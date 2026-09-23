-- What a guest tells us once, and nobody should ask for twice.
--
-- ── Why a table rather than columns on bookings ──────────────────────────
-- Two reasons, and the second is the one that decided it.
--
-- 1. A stay request exists in two shapes — a booking, or a waitlist entry
--    hoping to become one. The same eight fields on both tables would be one
--    set of columns maintained twice, and conversion would be a column-by-
--    column copy that drifts the first time somebody adds a ninth.
--
-- 2. RLS is row-level, not column-level. The kitchen needs the dietary
--    preference; it has no business reading the nightly rate, the discount or
--    the balance, all of which live on `bookings`. A separate row is the only
--    way to hand a department what it needs and nothing more.
--
-- The stay context (villa, dates, guest name) is deliberately denormalised
-- onto this row for the same reason: the kitchen must know whose dinner it is
-- and when, without being granted the bookings and customers tables. A trigger
-- keeps it in step when a booking is re-dated, so the copy cannot rot.

create type public.dietary_preference as enum (
  'none',
  'vegetarian',
  'jain',
  'vegan',
  'eggetarian',
  'non_vegetarian'
);

-- ------------------------------------------------- the waitlist catches up --
--
-- A waitlist entry has to hold everything a booking would, or converting one
-- means asking the guest again — which is the whole point of this work.

alter table public.waitlist
  add column check_in_time  time,
  add column check_out_time time,
  -- The rooms they asked for in a split villa. Not a foreign key array on
  -- purpose: it is a preference, not a hold. The hold is made by the booking.
  add column room_ids       uuid[] not null default '{}';

comment on column public.waitlist.check_in_time is
  'Arrival they asked for. Null means the villa standard — the same rule bookings use.';

-- ---------------------------------------------------------- the row itself --

create table public.stay_preferences (
  id                uuid primary key default gen_random_uuid(),

  -- Exactly one parent. A preference belongs to a stay or to a request for
  -- one, never to both and never to neither.
  booking_id        uuid references public.bookings (id) on delete cascade,
  waitlist_id       uuid references public.waitlist (id) on delete cascade,

  -- Denormalised stay context. See the header.
  villa_id          uuid references public.villas (id) on delete set null,
  guest_name        text not null default '',
  guest_phone       text not null default '',
  check_in          date,
  check_out         date,

  dietary           public.dietary_preference not null default 'none',
  -- breakfast / lunch / dinner / snacks. Text rather than an enum: the
  -- property adds a high tea and nobody should need a migration for it.
  meals             text[] not null default '{}',
  -- indian / north_indian / south_indian / continental / asian / kids
  cuisines          text[] not null default '{}',
  allergies         text not null default '',
  dietary_notes     text not null default '',
  food_notes        text not null default '',
  -- late_arrival / early_departure / birthday / anniversary / children /
  -- accessibility / other
  occasions         text[] not null default '{}',
  special_requests  text not null default '',

  created_at        timestamptz not null default now(),

  constraint stay_preferences_one_parent
    check (num_nonnulls(booking_id, waitlist_id) = 1)
);

create unique index stay_preferences_booking_idx
  on public.stay_preferences (booking_id) where booking_id is not null;
create unique index stay_preferences_waitlist_idx
  on public.stay_preferences (waitlist_id) where waitlist_id is not null;
create index stay_preferences_villa_dates_idx
  on public.stay_preferences (villa_id, check_in);

comment on table public.stay_preferences is
  'What the guest told us when they asked: diet, meals, allergies, occasion. Carries its own stay context so a department can read it without the bookings table.';

alter table public.stay_preferences enable row level security;

create policy "management reads preferences" on public.stay_preferences
  for select to authenticated
  using (public.is_admin());

create policy "management writes preferences" on public.stay_preferences
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The departments that act on them. Kitchen cooks to the diet, housekeeping
-- sets the room up for the occasion, and the desk meets a late arrival.
create policy "departments read preferences" on public.stay_preferences
  for select to authenticated
  using (
    public.has_permission('kitchen.work')
    or public.has_permission('requests.work')
    or public.has_permission('frontdesk.view')
  );

create policy "guests read their own preferences" on public.stay_preferences
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = stay_preferences.booking_id
        and b.customer_id = public.current_customer_id()
    )
    or exists (
      select 1 from public.waitlist w
      where w.id = stay_preferences.waitlist_id
        and w.customer_id = public.current_customer_id()
    )
  );

-- No guest INSERT policy: preferences are written by the RPCs below, inside
-- the same transaction as the booking or the waitlist entry they describe.

-- --------------------------------------------- keep the denormalised copy --

create or replace function public.sync_stay_preference_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stay_preferences
     set villa_id  = new.villa_id,
         check_in  = new.check_in,
         check_out = new.check_out
   where booking_id = new.id;
  return new;
end;
$$;

create trigger bookings_sync_preference_context
  after update of villa_id, check_in, check_out on public.bookings
  for each row execute function public.sync_stay_preference_context();

-- ------------------------------------------------------ writing them down --

/**
 * Record preferences against a stay or a request for one.
 *
 * Takes jsonb only as transport — every field lands in its own typed column,
 * because the kitchen filters on diet and the desk filters on arrival, and
 * neither should be digging through a document to do it.
 */
create or replace function public.save_stay_preferences(
  p_booking_id  uuid,
  p_waitlist_id uuid,
  p_prefs       jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_villa    uuid;
  v_in       date;
  v_out      date;
  v_name     text := '';
  v_phone    text := '';
  v_customer uuid;
begin
  if p_prefs is null or p_prefs = '{}'::jsonb then return; end if;
  if num_nonnulls(p_booking_id, p_waitlist_id) <> 1 then
    raise exception 'Preferences belong to exactly one booking or waitlist entry'
      using errcode = '23514';
  end if;

  if p_booking_id is not null then
    select villa_id, check_in, check_out, customer_id
      into v_villa, v_in, v_out, v_customer
    from public.bookings where id = p_booking_id;
  else
    select villa_id, check_in, check_out, customer_id
      into v_villa, v_in, v_out, v_customer
    from public.waitlist where id = p_waitlist_id;
  end if;

  if v_customer is null then
    raise exception 'No such booking or waitlist entry' using errcode = '23503';
  end if;

  -- Only the owner of the stay, or management. A guest cannot write notes
  -- onto somebody else's dinner.
  if not public.is_admin() and v_customer is distinct from public.current_customer_id() then
    raise exception 'Not your stay' using errcode = '42501';
  end if;

  select name, phone into v_name, v_phone
  from public.customers where id = v_customer;

  insert into public.stay_preferences (
    booking_id, waitlist_id, villa_id, guest_name, guest_phone,
    check_in, check_out, dietary, meals, cuisines,
    allergies, dietary_notes, food_notes, occasions, special_requests
  ) values (
    p_booking_id, p_waitlist_id, v_villa, coalesce(v_name, ''), coalesce(v_phone, ''),
    v_in, v_out,
    coalesce((p_prefs ->> 'dietary')::public.dietary_preference, 'none'),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_prefs -> 'meals')), '{}'),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_prefs -> 'cuisines')), '{}'),
    left(coalesce(p_prefs ->> 'allergies', ''), 500),
    left(coalesce(p_prefs ->> 'dietaryNotes', ''), 500),
    left(coalesce(p_prefs ->> 'foodNotes', ''), 500),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_prefs -> 'occasions')), '{}'),
    left(coalesce(p_prefs ->> 'specialRequests', ''), 1000)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.save_stay_preferences from public, anon;
grant execute on function public.save_stay_preferences to authenticated;

-- ------------------------------------------------------- joining the queue --

/**
 * Put someone on the waiting list, preferences and all, in one transaction.
 *
 * Replaces a client-side INSERT so that an entry can never exist without the
 * preferences that were typed alongside it. A guest may only ever queue for
 * themselves; `p_customer_id` is honoured for management alone, which is how
 * reception adds somebody who rang up.
 */
create or replace function public.join_waitlist(
  p_villa_id       uuid,
  p_check_in       date,
  p_check_out      date,
  p_adults         int,
  p_children       int default 0,
  p_source         public.booking_source default 'website',
  p_note           text default '',
  p_room_ids       uuid[] default '{}',
  p_check_in_time  time default null,
  p_check_out_time time default null,
  p_prefs          jsonb default null,
  p_customer_id    uuid default null
)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_entry    public.waitlist%rowtype;
begin
  if p_check_out <= p_check_in then
    raise exception 'The departure must be after the arrival' using errcode = '23514';
  end if;

  if public.is_admin() or public.has_permission('waitlist.manage') then
    v_customer := coalesce(p_customer_id, public.current_customer_id());
  else
    -- A guest queues for themselves, whatever the request says.
    v_customer := public.current_customer_id();
  end if;

  if v_customer is null then
    raise exception 'No guest record to queue' using errcode = '23503';
  end if;

  insert into public.waitlist (
    customer_id, villa_id, check_in, check_out, adults, children,
    source, note, room_ids, check_in_time, check_out_time
  ) values (
    v_customer, p_villa_id, p_check_in, p_check_out,
    greatest(coalesce(p_adults, 1), 1), greatest(coalesce(p_children, 0), 0),
    p_source, left(coalesce(p_note, ''), 1000),
    coalesce(p_room_ids, '{}'), p_check_in_time, p_check_out_time
  )
  returning * into v_entry;

  perform public.save_stay_preferences(null, v_entry.id, p_prefs);

  return v_entry;
end;
$$;

revoke all on function public.join_waitlist from public, anon;
grant execute on function public.join_waitlist to authenticated;

-- ------------------------------------------------------------ conversion --

/**
 * Close out a waitlist entry against the booking it became.
 *
 * The booking itself is made by the ordinary booking flow — this does not
 * create one, and deliberately cannot. It marks the entry converted, links it
 * so the trail survives, and carries the preferences across so the kitchen
 * reads them against the stay rather than against a request that is now
 * history.
 *
 * The entry is never deleted. "Converted → HOS-1042" is the audit.
 */
create or replace function public.convert_waitlist_entry(
  p_waitlist_id uuid,
  p_booking_id  uuid
)
returns public.waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.waitlist%rowtype;
begin
  if not (public.is_admin() or public.has_permission('waitlist.manage')) then
    raise exception 'Only the desk converts a waiting list entry' using errcode = '42501';
  end if;

  select * into v_entry from public.waitlist where id = p_waitlist_id;
  if not found then
    raise exception 'No such waiting list entry' using errcode = '23503';
  end if;

  -- Carry the preferences over, unless the booking already has its own.
  insert into public.stay_preferences (
    booking_id, villa_id, guest_name, guest_phone, check_in, check_out,
    dietary, meals, cuisines, allergies, dietary_notes, food_notes,
    occasions, special_requests
  )
  select
    p_booking_id, b.villa_id, sp.guest_name, sp.guest_phone, b.check_in, b.check_out,
    sp.dietary, sp.meals, sp.cuisines, sp.allergies, sp.dietary_notes, sp.food_notes,
    sp.occasions, sp.special_requests
  from public.stay_preferences sp
  join public.bookings b on b.id = p_booking_id
  where sp.waitlist_id = p_waitlist_id
    and not exists (
      select 1 from public.stay_preferences existing
      where existing.booking_id = p_booking_id
    );

  update public.waitlist
     set status = 'converted', booking_id = p_booking_id
   where id = p_waitlist_id
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.convert_waitlist_entry from public, anon;
grant execute on function public.convert_waitlist_entry to authenticated;

-- ------------------------------------------- booking, with what they told us --

-- Dropped and recreated rather than overloaded: two signatures that differ
-- only by defaulted arguments are ambiguous to call, and PostgREST would have
-- to guess.
drop function if exists public.request_booking(uuid, uuid[], date, date, int, int, text);

create or replace function public.request_booking(
  p_villa_id        uuid,
  p_room_ids        uuid[],
  p_check_in        date,
  p_check_out       date,
  p_adults          int,
  p_children        int default 0,
  p_special_requests text default null,
  p_check_in_time   time default null,
  p_check_out_time  time default null,
  p_prefs           jsonb default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_villa       public.villas%rowtype;
  v_nights      int;
  v_rate        int;
  v_tax         numeric(4,3);
  v_conflicts   text;
  v_booking     public.bookings%rowtype;
  v_capacity    int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Sign in before booking' using errcode = '42501';
  end if;

  v_customer_id := public.current_customer_id();
  if v_customer_id is null then
    insert into public.customers (name, phone, email, guest_type)
    select
      coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
      '',
      lower(u.email),
      'new'
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
    returning id into v_customer_id;

    update public.profiles set customer_id = v_customer_id where id = auth.uid();
  end if;

  select * into v_villa from public.villas where id = p_villa_id;
  if not found then
    raise exception 'No such villa' using errcode = '23503';
  end if;
  if v_villa.status <> 'active' then
    raise exception 'That villa is not taking bookings' using errcode = '23514';
  end if;

  v_nights := p_check_out - p_check_in;
  if v_nights < 1 then
    raise exception 'The departure must be after the arrival' using errcode = '23514';
  end if;

  if v_villa.mode = 'split' then
    if p_room_ids is null or cardinality(p_room_ids) = 0 then
      raise exception 'Choose at least one room' using errcode = '23514';
    end if;
    select coalesce(sum(base_rate), 0), coalesce(sum(capacity), 0)
      into v_rate, v_capacity
    from public.rooms
    where id = any (p_room_ids) and villa_id = p_villa_id;

    if v_rate = 0 then
      raise exception 'Those rooms do not belong to that villa' using errcode = '23503';
    end if;
  else
    v_rate := v_villa.base_rate;
    v_capacity := v_villa.capacity;
  end if;

  if (p_adults + p_children) > v_capacity then
    raise exception 'That sleeps %, and you have asked for %',
      v_capacity, p_adults + p_children using errcode = '23514';
  end if;

  v_tax := case when v_rate > 7500 then 0.180 else 0.120 end;

  select string_agg(reference, ', ') into v_conflicts
  from public.find_booking_conflicts(
    p_villa_id, case when v_villa.mode = 'split' then p_room_ids else '{}'::uuid[] end,
    p_check_in, p_check_out, null);

  if v_conflicts is not null then
    raise exception 'Those dates are no longer available' using errcode = '23P01';
  end if;

  begin
    insert into public.bookings (
      reference, customer_id, villa_id, booking_mode,
      check_in, check_out, check_in_time, check_out_time,
      adults, children, source,
      status, payment_status, nightly_rate, nights, tax_rate,
      amount_paid, special_requests
    ) values (
      public.next_booking_reference(),
      v_customer_id, p_villa_id, v_villa.mode,
      p_check_in, p_check_out, p_check_in_time, p_check_out_time,
      p_adults, p_children, 'website',
      'pending_payment', 'pending', v_rate, v_nights, v_tax,
      0, left(coalesce(p_special_requests, ''), 1000)
    )
    returning * into v_booking;

    perform public.sync_booking_rooms(
      v_booking.id,
      case when v_villa.mode = 'split' then p_room_ids else null end);
  exception
    when exclusion_violation then
      raise exception 'Those dates were taken a moment ago — please pick others'
        using errcode = '23P01';
  end;

  perform public.save_stay_preferences(v_booking.id, null, p_prefs);

  perform public.notify_staff(
    'booking', 'New booking from the guest portal',
    v_booking.reference || ' - ' || v_villa.name, v_booking.id);

  return v_booking;
end;
$$;

revoke all on function public.request_booking from public, anon;
grant execute on function public.request_booking to authenticated;

-- ------------------------------------- an opening names who is first in line --

create or replace function public.notify_waitlist_on_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waiting int;
  v_villa   text;
  v_first   record;
begin
  if new.status not in ('cancelled', 'rejected', 'no_show') then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  select count(*) into v_waiting
  from public.waitlist w
  where w.status = 'waiting'
    and (w.villa_id is null or w.villa_id = new.villa_id)
    and w.check_in  < new.check_out
    and w.check_out > new.check_in;

  if v_waiting = 0 then return new; end if;

  select name into v_villa from public.villas where id = new.villa_id;

  -- Who the desk should ring, rather than a count they have to go and resolve
  -- into a person. First come, first served — so it is the oldest row.
  select c.name, c.phone, w.check_in, w.check_out
    into v_first
  from public.waitlist w
  join public.customers c on c.id = w.customer_id
  where w.status = 'waiting'
    and (w.villa_id is null or w.villa_id = new.villa_id)
    and w.check_in  < new.check_out
    and w.check_out > new.check_in
  order by w.created_at
  limit 1;

  perform public.notify_staff(
    'waitlist',
    coalesce(v_villa, 'A villa') || ' has freed up',
    v_waiting::text || ' waiting for ' ||
      to_char(new.check_in, 'DD Mon') || ' to ' || to_char(new.check_out, 'DD Mon') ||
      '. First in line: ' || coalesce(v_first.name, 'someone') ||
      coalesce(' (' || nullif(v_first.phone, '') || ')', '') ||
      ', wanting ' || to_char(v_first.check_in, 'DD Mon') ||
      ' to ' || to_char(v_first.check_out, 'DD Mon'),
    null::uuid);

  return new;
end;
$$;
