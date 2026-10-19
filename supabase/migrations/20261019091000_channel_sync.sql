-- OTA channel sync through a channel manager (Channex).
--
-- Bookings from Goibibo/MakeMyTrip, Booking.com, Airbnb, Agoda… arrive from
-- the channel manager; availability goes back to it whenever a room hold
-- changes, so the same bedroom is never sold twice.
--
-- SECRETS. The channel-manager API key and the two tokens live in Supabase
-- Vault (encrypted at rest) and nowhere else:
--   channel_api_key         the owner pastes it once in Settings → Channels.
--                           Write-only: no function returns it to a browser.
--   channel_webhook_token   generated here, sent to Channex by the server as a
--                           custom header on the webhook. Never shown to anyone.
--   channel_internal_token  generated here; authenticates the database's own
--                           calls to the channel-sync function.
-- Only `service_role` (the edge functions) can read them, through
-- channel_secret(). The settings table holds the last four characters of the
-- key so the owner can see which key is in place, and nothing more.
--
-- INVENTORY. Availability is read from booking_rooms, the table the exclusion
-- constraint guards, so the OTAs see exactly what the constraint enforces:
-- a whole-villa unit is free only when every bedroom is; a room unit is free
-- when that room is. An imported booking that would overlap is NOT forced in —
-- the constraint refuses it, and it is recorded as a conflict for the owner.

create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net;

-- ----------------------------------------------------------------- settings
create table public.channel_settings (
  id                boolean primary key default true check (id),
  provider          text not null default 'channex' check (provider in ('channex')),
  environment       text not null default 'staging' check (environment in ('staging', 'production')),
  property_id       text not null default '',
  -- [{room_type_id, rate_plan_id, villa_id, room_id|null}]; room_id null means
  -- the channel unit is the whole villa.
  mapping           jsonb not null default '[]'::jsonb check (jsonb_typeof(mapping) = 'array'),
  sync_enabled      boolean not null default false,
  -- Where the database sends "availability changed". Pinned to a Supabase
  -- functions URL so the internal token cannot be pointed anywhere else.
  functions_url     text not null default ''
    check (functions_url = '' or functions_url ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1$'),
  webhook_id        text,
  api_key_last4     text,
  keys_updated_at   timestamptz,
  keys_updated_by   text,
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_message text not null default '',
  last_sync_at      timestamptz,
  last_error        text not null default '',
  updated_at        timestamptz not null default now()
);
insert into public.channel_settings default values;

-- No policies: reached only through the functions below.
alter table public.channel_settings enable row level security;
revoke all on table public.channel_settings from anon, authenticated;

-- ------------------------------------------------------------------- events
-- Every revision the channel manager sent and what became of it. The owner's
-- "needs attention" list is the unresolved conflicts/unmapped rows here.
create table public.channel_events (
  id           uuid primary key default gen_random_uuid(),
  revision_id  text unique,
  ota          text not null default '',
  external_ref text not null default '',
  outcome      text not null check (outcome in
                 ('imported', 'updated', 'cancelled', 'ignored', 'conflict', 'unmapped', 'error')),
  message      text not null default '',
  booking_id   uuid references public.bookings (id) on delete set null,
  check_in     date,
  check_out    date,
  guest_name   text not null default '',
  resolved     boolean not null default false,
  at           timestamptz not null default now()
);
create index channel_events_at_idx on public.channel_events (at desc);

alter table public.channel_events enable row level security;
revoke all on table public.channel_events from anon, authenticated;
grant select, update (resolved) on table public.channel_events to authenticated;
create policy channel_events_owner_read on public.channel_events
  for select to authenticated using (public.is_owner());
create policy channel_events_owner_resolve on public.channel_events
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- bookings
alter table public.bookings
  add column channel            text,  -- "Booking.com", "Goibibo"… as the OTA names itself
  add column external_ref       text,  -- the OTA's reservation code, for the desk
  add column channel_booking_id text;  -- the channel manager's id: the idempotency key
create unique index bookings_channel_booking_id_key
  on public.bookings (channel_booking_id) where channel_booking_id is not null;

-- ------------------------------------------------------------ vault tokens
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'channel_internal_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'channel_internal_token', 'Authenticates database → channel-sync calls');
  end if;
  if not exists (select 1 from vault.secrets where name = 'channel_webhook_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'channel_webhook_token', 'Sent by Channex on every webhook call');
  end if;
end;
$$;

-- ------------------------------------------------------- owner functions
create or replace function public.channel_actor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif((select full_name from public.profiles where id = auth.uid()), ''), 'Owner');
$$;

/** Everything the Channels tab shows. Never the key. */
create or replace function public.channel_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.channel_settings%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can see channel settings' using errcode = '42501';
  end if;
  select * into s from public.channel_settings;
  return to_jsonb(s) - 'id' || jsonb_build_object(
    'has_api_key', exists (select 1 from vault.secrets where name = 'channel_api_key'),
    'attention', (select count(*) from public.channel_events
                   where not resolved and outcome in ('conflict', 'unmapped', 'error')));
end;
$$;

create or replace function public.channel_save_settings(
  p_environment   text,
  p_property_id   text,
  p_mapping       jsonb,
  p_sync_enabled  boolean,
  p_functions_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change channel settings' using errcode = '42501';
  end if;
  if p_property_id !~ '^[A-Za-z0-9-]{0,64}$' then
    raise exception 'The property ID should be the UUID shown in Channex' using errcode = '22023';
  end if;
  if jsonb_typeof(p_mapping) <> 'array' then
    raise exception 'Mapping must be a list' using errcode = '22023';
  end if;
  for m in select * from jsonb_array_elements(p_mapping) loop
    if coalesce(m->>'room_type_id', '') !~ '^[A-Za-z0-9-]{1,64}$' then
      raise exception 'Every mapped unit needs a Channex room type ID' using errcode = '22023';
    end if;
    if not exists (select 1 from public.villas where id = (m->>'villa_id')::uuid) then
      raise exception 'A mapped villa no longer exists' using errcode = '23503';
    end if;
    if m->>'room_id' is not null and not exists (
      select 1 from public.rooms where id = (m->>'room_id')::uuid and villa_id = (m->>'villa_id')::uuid
    ) then
      raise exception 'A mapped room does not belong to its villa' using errcode = '23503';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_mapping))
     <> (select count(distinct x->>'room_type_id') from jsonb_array_elements(p_mapping) x) then
    raise exception 'Each Channex room type can be mapped only once' using errcode = '23505';
  end if;
  if p_sync_enabled and not exists (select 1 from vault.secrets where name = 'channel_api_key') then
    raise exception 'Save the API key before turning sync on' using errcode = '22023';
  end if;

  update public.channel_settings set
    environment   = p_environment,
    property_id   = p_property_id,
    mapping       = p_mapping,
    sync_enabled  = p_sync_enabled,
    functions_url = p_functions_url,
    updated_at    = now();
end;
$$;

/** Write-only. The key goes into Vault; only its last four characters stay readable. */
create or replace function public.channel_save_api_key(p_api_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := btrim(coalesce(p_api_key, ''));
  v_id  uuid;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can set the channel key' using errcode = '42501';
  end if;
  if v_key !~ '^[A-Za-z0-9+/=_.-]{20,200}$' then
    raise exception 'That does not look like a Channex API key' using errcode = '22023';
  end if;

  select id into v_id from vault.secrets where name = 'channel_api_key';
  if v_id is null then
    perform vault.create_secret(v_key, 'channel_api_key', 'Channex user API key');
  else
    perform vault.update_secret(v_id, v_key);
  end if;

  update public.channel_settings set
    api_key_last4     = right(v_key, 4),
    keys_updated_at   = now(),
    keys_updated_by   = public.channel_actor(),
    last_test_ok      = null,
    last_test_message = 'Key changed: test the connection again',
    updated_at        = now();

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (auth.uid(), 'channel', 'Channel manager key saved',
          'Ending ' || right(v_key, 4), public.channel_actor());
end;
$$;

/** Forget the key and stop syncing. The channel-sync function removes the
 *  Channex webhook first, then calls this. */
create or replace function public.channel_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can disconnect the channel manager' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'channel_api_key';
  update public.channel_settings set
    sync_enabled = false, webhook_id = null, api_key_last4 = null,
    keys_updated_at = now(), keys_updated_by = public.channel_actor(),
    last_test_ok = null, last_test_message = 'Disconnected', updated_at = now();
  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (auth.uid(), 'channel', 'Channel manager disconnected', 'Key removed from the vault',
          public.channel_actor());
end;
$$;

-- --------------------------------------------- service-role-only functions
/** The only door to the secrets. Executable by service_role alone. */
create or replace function public.channel_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = case p_name
    when 'api_key'  then 'channel_api_key'
    when 'webhook'  then 'channel_webhook_token'
    when 'internal' then 'channel_internal_token'
  end;
$$;

create or replace function public.channel_config()
returns public.channel_settings
language sql
stable
security definer
set search_path = public
as $$
  select * from public.channel_settings;
$$;

create or replace function public.channel_record(
  p_kind text, p_ok boolean, p_message text, p_webhook_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'test' then
    update public.channel_settings set
      last_test_at = now(), last_test_ok = p_ok, last_test_message = left(p_message, 500),
      webhook_id = coalesce(p_webhook_id, webhook_id);
  else
    update public.channel_settings set
      last_sync_at = case when p_ok then now() else last_sync_at end,
      last_error   = case when p_ok then '' else left(p_message, 500) end;
  end if;
end;
$$;

/**
 * Per channel unit, per day: 1 if it can be sold, 0 if not.
 * Read from booking_rooms, i.e. from what the exclusion constraint guards.
 */
create or replace function public.channel_availability(p_from date, p_days int)
returns table (room_type_id text, rate_plan_id text, day date, availability int)
language sql
stable
security definer
set search_path = public
as $$
  with units as (
    select m->>'room_type_id' as room_type_id,
           m->>'rate_plan_id' as rate_plan_id,
           (m->>'villa_id')::uuid as villa_id,
           (m->>'room_id')::uuid as room_id
    from public.channel_settings s, jsonb_array_elements(s.mapping) m
  ),
  days as (
    select d::date as day from generate_series(p_from, p_from + (p_days - 1), interval '1 day') d
  )
  select u.room_type_id, u.rate_plan_id, d.day,
    case when v.status <> 'active' then 0
         when exists (
           select 1 from public.booking_rooms br
           join public.rooms r on r.id = br.room_id
           where public.holds_inventory(br.status)
             and d.day >= br.check_in and d.day < br.check_out
             and (case when u.room_id is null then r.villa_id = u.villa_id else r.id = u.room_id end)
         ) then 0
         when u.room_id is not null
              and (select status from public.rooms where id = u.room_id) = 'blocked' then 0
         else 1 end
  from units u
  join public.villas v on v.id = u.villa_id
  cross join days d;
$$;

/**
 * One booking revision from the channel manager, already fetched and
 * normalised by the channel-sync function:
 *   {revision_id, channel_booking_id, ota, external_ref, status: new|modified|cancelled,
 *    check_in, check_out, adults, children, room_type_ids[], amount,
 *    guest_name, guest_email, guest_phone, notes}
 */
create or replace function public.channel_ingest_booking(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.channel_settings%rowtype;
  v_cb_id    text := p->>'channel_booking_id';
  v_ota      text := coalesce(nullif(btrim(p->>'ota'), ''), 'OTA');
  v_ref      text := coalesce(p->>'external_ref', '');
  v_in       date := (p->>'check_in')::date;
  v_out      date := (p->>'check_out')::date;
  v_adults   int  := greatest(coalesce((p->>'adults')::int, 1), 1);
  v_children int  := greatest(coalesce((p->>'children')::int, 0), 0);
  v_amount   int  := greatest(coalesce(round((p->>'amount')::numeric), 0), 0)::int;
  v_guest    text := coalesce(nullif(btrim(p->>'guest_name'), ''), 'OTA guest');
  v_email    text := lower(btrim(coalesce(p->>'guest_email', '')));
  v_phone    text := btrim(coalesce(p->>'guest_phone', ''));
  v_villa    uuid;
  v_rooms    uuid[] := '{}';
  v_whole    boolean := false;
  v_existing public.bookings%rowtype;
  v_booking  public.bookings%rowtype;
  v_customer uuid;
  v_nights   int;
  v_outcome  text;
  v_message  text := '';
  t          text;
  m          jsonb;

begin
  -- Seen this revision already: the channel manager retries; we do not repeat.
  if exists (select 1 from public.channel_events
             where revision_id = p->>'revision_id' and outcome <> 'error') then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  select * into s from public.channel_settings;
  select * into v_existing from public.bookings where channel_booking_id = v_cb_id;

  if p->>'status' = 'cancelled' then
    if v_existing.id is null then
      v_outcome := 'ignored';
      v_message := 'Cancellation for a booking the CRM never imported';
    else
      if public.holds_inventory(v_existing.status) then
        update public.bookings set status = 'cancelled' where id = v_existing.id;
      end if;
      v_outcome := 'cancelled';
      v_booking := v_existing;
    end if;
  else
    -- Which villa / rooms the OTA sold.
    for t in select jsonb_array_elements_text(coalesce(p->'room_type_ids', '[]'::jsonb)) loop
      m := null;  -- SELECT INTO leaves the old value when nothing matches
      select x into m from jsonb_array_elements(s.mapping) x where x->>'room_type_id' = t;
      if m is null then
        v_outcome := 'unmapped';
        v_message := 'Channex room type ' || t || ' is not mapped to a villa or room';
        exit;
      end if;
      if v_villa is not null and v_villa <> (m->>'villa_id')::uuid then
        v_outcome := 'unmapped';
        v_message := 'One booking spans two villas; enter it by hand';
        exit;
      end if;
      v_villa := (m->>'villa_id')::uuid;
      if m->>'room_id' is null then v_whole := true;
      else v_rooms := v_rooms || (m->>'room_id')::uuid; end if;
    end loop;
    if v_villa is null and v_outcome is null then
      v_outcome := 'unmapped';
      v_message := 'The booking named no room type';
    end if;
    if v_whole then v_rooms := '{}'; end if;
    v_nights := v_out - v_in;

    if v_outcome is null then
      begin
        if v_existing.id is not null then
          update public.bookings set
            villa_id = v_villa,
            booking_mode = case when v_whole then 'whole'::public.villa_mode else 'split'::public.villa_mode end,
            check_in = v_in, check_out = v_out, nights = v_nights,
            adults = v_adults, children = v_children,
            nightly_rate = v_amount / greatest(v_nights, 1)
          where id = v_existing.id
          returning * into v_booking;
          perform public.sync_booking_rooms(v_booking.id, v_rooms);
          v_outcome := 'updated';
        else
          -- Same guest as before? Email first, then phone.
          select id into v_customer from public.customers
          where (v_email <> '' and lower(email) = v_email)
             or (v_email = '' and v_phone <> '' and phone = v_phone)
          order by created_at limit 1;
          if v_customer is null then
            insert into public.customers (name, phone, email, notes)
            values (v_guest, v_phone, v_email, 'Created from a ' || v_ota || ' booking')
            returning id into v_customer;
          end if;

          -- The OTA total is what the guest pays, taxes included, so tax_rate 0
          -- keeps the CRM total equal to it.
          insert into public.bookings (
            reference, customer_id, villa_id, booking_mode, check_in, check_out,
            adults, children, source, status, payment_status,
            nightly_rate, nights, tax_rate, special_requests, internal_notes,
            channel, external_ref, channel_booking_id
          ) values (
            public.next_booking_reference(), v_customer, v_villa,
            case when v_whole then 'whole'::public.villa_mode else 'split'::public.villa_mode end,
            v_in, v_out, v_adults, v_children,
            case when v_ota ~* '(goibibo|makemytrip|mmt)' then 'goibibo'::public.booking_source
                 else 'other'::public.booking_source end,
            'confirmed', 'pending',
            v_amount / greatest(v_nights, 1), v_nights, 0,
            nullif(btrim(coalesce(p->>'notes', '')), ''),
            'Imported from ' || v_ota || ' · ' || v_ref,
            v_ota, v_ref, v_cb_id
          )
          returning * into v_booking;
          perform public.sync_booking_rooms(v_booking.id, v_rooms);
          v_outcome := 'imported';
        end if;
      exception
        when exclusion_violation then
          v_outcome := 'conflict';
          v_message := 'Those dates are already held in the CRM. Close the OTA booking or move a guest';
          v_booking := null;
        when others then
          v_outcome := 'error';
          v_message := left(sqlerrm, 300);
          v_booking := null;
      end;
    end if;
  end if;

  insert into public.channel_events
    (revision_id, ota, external_ref, outcome, message, booking_id, check_in, check_out, guest_name)
  values (p->>'revision_id', v_ota, v_ref, v_outcome, v_message, v_booking.id, v_in, v_out, v_guest)
  on conflict (revision_id) do update set
    outcome = excluded.outcome, message = excluded.message,
    booking_id = excluded.booking_id, at = now();

  if v_booking.id is not null then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (v_booking.id, 'channel', initcap(v_outcome) || ' from ' || v_ota,
            'Reservation ' || v_ref, 'Channel manager');
  end if;
  if v_outcome in ('imported', 'cancelled', 'conflict', 'unmapped') then
    insert into public.notifications (kind, title, detail)
    values ('channel',
            case v_outcome
              when 'imported'  then 'New ' || v_ota || ' booking'
              when 'cancelled' then v_ota || ' booking cancelled'
              else v_ota || ' booking needs attention' end,
            v_guest || ' · ' || v_in || ' to ' || v_out
              || case when v_message <> '' then ' · ' || v_message else '' end);
  end if;

  return jsonb_build_object('outcome', v_outcome, 'booking_id', v_booking.id, 'message', v_message);
end;
$$;

-- --------------------------------------------- push on every hold change
-- Statement-level, so a whole-villa booking (four rows) asks once. pg_net
-- sends after the transaction commits, and a failure here never blocks the
-- booking itself.
create or replace function public.channel_request_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.channel_settings%rowtype;
begin
  select * into s from public.channel_settings;
  if s.sync_enabled and s.functions_url <> '' then
    perform net.http_post(
      url     := s.functions_url || '/channel-sync',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-channel-token', public.channel_secret('internal')),
      body    := jsonb_build_object('action', 'push'));
  end if;
  return null;
exception when others then
  raise warning 'channel push not queued: %', sqlerrm;
  return null;
end;
$$;

create trigger booking_rooms_channel_push
  after insert or update or delete on public.booking_rooms
  for each statement execute function public.channel_request_push();
create trigger villas_channel_push
  after update of status on public.villas
  for each statement execute function public.channel_request_push();

-- ------------------------------------------------------------------ grants
revoke all on function public.channel_actor()                                   from public, anon, authenticated;
revoke all on function public.channel_get_settings()                            from public, anon;
revoke all on function public.channel_save_settings(text, text, jsonb, boolean, text) from public, anon;
revoke all on function public.channel_save_api_key(text)                        from public, anon;
revoke all on function public.channel_disconnect()                              from public, anon;
grant execute on function public.channel_get_settings()                            to authenticated;
grant execute on function public.channel_save_settings(text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.channel_save_api_key(text)                        to authenticated;
grant execute on function public.channel_disconnect()                              to authenticated;

revoke all on function public.channel_secret(text)                         from public, anon, authenticated;
revoke all on function public.channel_config()                             from public, anon, authenticated;
revoke all on function public.channel_record(text, boolean, text, text)    from public, anon, authenticated;
revoke all on function public.channel_availability(date, int)              from public, anon, authenticated;
revoke all on function public.channel_ingest_booking(jsonb)                from public, anon, authenticated;
revoke all on function public.channel_request_push()                       from public, anon, authenticated;
grant execute on function public.channel_secret(text)                      to service_role;
grant execute on function public.channel_config()                          to service_role;
grant execute on function public.channel_record(text, boolean, text, text) to service_role;
grant execute on function public.channel_availability(date, int)           to service_role;
grant execute on function public.channel_ingest_booking(jsonb)             to service_role;
