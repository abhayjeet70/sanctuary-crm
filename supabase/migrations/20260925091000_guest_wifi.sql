-- Guest Wi-Fi: the software side of a captive portal.
--
-- ── The booking is the source of truth ──────────────────────────────────
-- There is no Wi-Fi account. A person gets access because they hold (or are
-- a live companion on) a booking that is in its stay window. Every function
-- below derives the booking from WHO IS CALLING, never from an id the client
-- sends, so a guest cannot authorise themselves onto somebody else's stay.
--
-- ── What is real and what is not ────────────────────────────────────────
-- No network hardware is connected yet. Every authorisation, device and
-- session here is the CRM's record of what it has allowed. The `controller`
-- column says which controller carried it out — today always 'mock' — so no
-- screen can mistake a database row for a device that is actually online.
--
-- ── Expiry ──────────────────────────────────────────────────────────────
-- Access ends at the booking's effective check-out: its agreed check-out time
-- if it has one, else the villa's standard hour, on the check-out date, in
-- India time. Only staff holding wifi.manage may push it further.

-- ------------------------------------------------------------ villa config --
-- `villas.wifi_network` is already the SSID guests are shown, so it is reused
-- rather than duplicated as a second `wifi_ssid` column that could disagree.
alter table public.villas
  add column if not exists wifi_enabled             boolean not null default true,
  add column if not exists captive_portal_enabled   boolean not null default false,
  add column if not exists wifi_network_id          text    not null default '',
  add column if not exists wifi_configuration_notes text    not null default '';

comment on column public.villas.wifi_network_id is
  'The identifier the Wi-Fi controller knows this network by. Empty until hardware is connected.';

-- ------------------------------------------------------------------ tables --
create table if not exists public.wifi_devices (
  id            uuid primary key default gen_random_uuid(),
  -- The auth user who registered it: the holder or a companion. This, not the
  -- customer, is what a guest's own-devices policy matches on.
  user_id       uuid not null references auth.users (id) on delete cascade,
  guest_id      uuid not null references public.customers (id) on delete cascade,
  booking_id    uuid not null references public.bookings (id)  on delete cascade,
  villa_id      uuid not null references public.villas (id)    on delete cascade,
  device_name   text not null check (length(trim(device_name)) between 1 and 60),
  device_type   text not null default 'phone'
                check (device_type in ('phone', 'tablet', 'laptop', 'tv', 'other')),
  -- Supplied by the controller's redirect in production. Sensitive: staff only.
  mac_address   text,
  ip_address    text,
  status        text not null default 'active'
                check (status in ('active', 'disconnected', 'blocked', 'expired')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists wifi_devices_booking_idx on public.wifi_devices (booking_id);
create index if not exists wifi_devices_user_idx    on public.wifi_devices (user_id);
create index if not exists wifi_devices_villa_idx   on public.wifi_devices (villa_id);

create table if not exists public.wifi_authorizations (
  id             uuid primary key default gen_random_uuid(),
  guest_id       uuid not null references public.customers (id) on delete cascade,
  booking_id     uuid not null references public.bookings (id)  on delete cascade,
  villa_id       uuid not null references public.villas (id)    on delete cascade,
  device_id      uuid not null unique references public.wifi_devices (id) on delete cascade,
  status         text not null default 'authorized'
                 check (status in ('pending', 'authorized', 'revoked', 'expired')),
  authorized_at  timestamptz,
  expires_at     timestamptz not null,
  -- True once staff pushed expiry past check-out. A later change to the
  -- booking's check-out then leaves the staff decision alone.
  extended       boolean not null default false,
  revoked_at     timestamptz,
  revoked_reason text,
  controller     text not null default 'mock',
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now()
);
create index if not exists wifi_auth_booking_idx on public.wifi_authorizations (booking_id);
create index if not exists wifi_auth_status_idx  on public.wifi_authorizations (status);

create table if not exists public.wifi_sessions (
  id                    uuid primary key default gen_random_uuid(),
  device_id             uuid not null references public.wifi_devices (id) on delete cascade,
  guest_id              uuid not null references public.customers (id) on delete cascade,
  booking_id            uuid not null references public.bookings (id)  on delete cascade,
  villa_id              uuid not null references public.villas (id)    on delete cascade,
  connected_at          timestamptz not null default now(),
  disconnected_at       timestamptz,
  last_seen_at          timestamptz not null default now(),
  expires_at            timestamptz not null,
  status                text not null default 'active'
                        check (status in ('active', 'ended', 'expired', 'revoked')),
  controller            text not null default 'mock',
  controller_session_id text,
  created_at            timestamptz not null default now()
);
create index if not exists wifi_sessions_device_idx  on public.wifi_sessions (device_id);
create index if not exists wifi_sessions_booking_idx on public.wifi_sessions (booking_id);
create index if not exists wifi_sessions_status_idx  on public.wifi_sessions (status);

-- --------------------------------------------------------------------- RLS --
-- Reads only. No insert/update/delete policy exists on any of the three: every
-- write goes through a function below that checks who is asking.
alter table public.wifi_devices        enable row level security;
alter table public.wifi_authorizations enable row level security;
alter table public.wifi_sessions       enable row level security;

create policy "wifi devices: own" on public.wifi_devices
  for select to authenticated using (user_id = auth.uid());
create policy "wifi devices: staff with wifi.view" on public.wifi_devices
  for select to authenticated using (public.has_permission('wifi.view'));

create policy "wifi authorizations: own device" on public.wifi_authorizations
  for select to authenticated
  using (exists (select 1 from public.wifi_devices d where d.id = device_id and d.user_id = auth.uid()));
create policy "wifi authorizations: staff with wifi.view" on public.wifi_authorizations
  for select to authenticated using (public.has_permission('wifi.view'));

create policy "wifi sessions: own device" on public.wifi_sessions
  for select to authenticated
  using (exists (select 1 from public.wifi_devices d where d.id = device_id and d.user_id = auth.uid()));
create policy "wifi sessions: staff with wifi.view" on public.wifi_sessions
  for select to authenticated using (public.has_permission('wifi.view'));

-- A guest sees their own device's name and status, never its MAC or IP. The
-- view is what the guest portal reads; the table stays staff-only for those.
create or replace view public.my_wifi_devices
with (security_invoker = on) as
select d.id, d.booking_id, d.villa_id, d.device_name, d.device_type, d.status,
       d.first_seen_at, d.last_seen_at,
       a.status as access_status, a.expires_at, a.controller
from public.wifi_devices d
left join public.wifi_authorizations a on a.device_id = d.id
where d.user_id = auth.uid();

grant select on public.my_wifi_devices to authenticated;

-- ----------------------------------------------------------------- helpers --

/** When access to this booking ends: agreed check-out, else the villa's hour. */
create or replace function public.wifi_booking_expiry(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((b.check_out + coalesce(b.check_out_time, v.check_out_time, time '11:00'))
           at time zone 'Asia/Kolkata')
  from public.bookings b
  join public.villas v on v.id = b.villa_id
  where b.id = p_booking_id;
$$;

/** When access may start: the villa's check-in hour isn't a gate — a guest who
 *  arrives early still gets Wi-Fi — but the check-in DAY is. */
create or replace function public.wifi_booking_opens(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (b.check_in::timestamp at time zone 'Asia/Kolkata')
  from public.bookings b where b.id = p_booking_id;
$$;

/**
 * The booking that entitles the caller to Wi-Fi right now, or null.
 *
 * A companion's is the booking they are on while their access is live. A
 * holder's is their stay that has opened, has not closed, and is in a status
 * where a guest is actually expected at the villa.
 */
create or replace function public.wifi_entitled_booking()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking uuid;
begin
  v_booking := public.companion_booking_id();
  if v_booking is null then
    select b.id into v_booking
    from public.bookings b
    where b.customer_id = public.current_customer_id()
      and b.status in ('confirmed', 'payment_approved', 'checked_in', 'in_house')
      and now() >= public.wifi_booking_opens(b.id)
      and now() <  public.wifi_booking_expiry(b.id)
    order by b.check_in
    limit 1;
  end if;

  if v_booking is null then return null; end if;

  -- The companion path still has to pass the same stay rules.
  if not exists (
    select 1 from public.bookings b
    where b.id = v_booking
      and b.status in ('confirmed', 'payment_approved', 'checked_in', 'in_house')
      and now() >= public.wifi_booking_opens(b.id)
      and now() <  public.wifi_booking_expiry(b.id)
  ) then
    return null;
  end if;
  return v_booking;
end;
$$;

/** Anything past its expiry is marked so. Cheap, idempotent, and called at the
 *  start of every Wi-Fi function, so nothing reads a stale "authorized". */
create or replace function public.wifi_expire_due()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.wifi_authorizations set status = 'expired'
   where status = 'authorized' and expires_at <= now();
  get diagnostics n = row_count;

  update public.wifi_sessions
     set status = 'expired', disconnected_at = coalesce(disconnected_at, expires_at)
   where status = 'active' and expires_at <= now();

  update public.wifi_devices d set status = 'expired', updated_at = now()
   where d.status in ('active', 'disconnected')
     and exists (select 1 from public.wifi_authorizations a
                  where a.device_id = d.id and a.status = 'expired');
  return n;
end;
$$;

/** Log a Wi-Fi event against its booking. Never given secrets. */
create or replace function public.wifi_log(p_booking uuid, p_title text, p_detail text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (p_booking, 'wifi', p_title, p_detail,
          coalesce((select full_name from public.profiles where id = auth.uid()), 'System'));
$$;

-- ----------------------------------------------------------- guest actions --

/**
 * What the guest portal shows: which villa, its network, whether access is
 * possible, and until when. One call, all derived server-side.
 */
create or replace function public.wifi_my_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking uuid;
  b public.bookings%rowtype;
  v public.villas%rowtype;
  v_state text;
begin
  perform public.wifi_expire_due();
  v_booking := public.wifi_entitled_booking();

  if v_booking is null then
    -- No live stay. Say which one is coming or just ended, if any, so the page
    -- can explain rather than just refuse.
    select * into b from public.bookings
     where (customer_id = public.current_customer_id() or id = (
              select booking_id from public.booking_companions where profile_id = auth.uid()))
       and status not in ('cancelled', 'rejected', 'no_show')
     order by abs(check_in - current_date) limit 1;
    if not found then
      return jsonb_build_object('state', 'unavailable', 'reason', 'no_booking');
    end if;
    select * into v from public.villas where id = b.villa_id;
    return jsonb_build_object(
      'state', case when now() >= public.wifi_booking_expiry(b.id) then 'expired' else 'not_yet' end,
      'booking_id', b.id, 'villa_name', v.name, 'ssid', v.wifi_network,
      'opens_at', public.wifi_booking_opens(b.id),
      'expires_at', public.wifi_booking_expiry(b.id));
  end if;

  select * into b from public.bookings where id = v_booking;
  select * into v from public.villas   where id = b.villa_id;

  v_state := case
    when not v.wifi_enabled then 'unavailable'
    when exists (select 1 from public.wifi_authorizations a
                  join public.wifi_devices d on d.id = a.device_id
                  where d.user_id = auth.uid() and a.booking_id = b.id
                    and a.status = 'authorized') then 'authorized'
    else 'ready'
  end;

  return jsonb_build_object(
    'state', v_state,
    'booking_id', b.id,
    'booking_reference', b.reference,
    'villa_id', v.id,
    'villa_name', v.name,
    'ssid', v.wifi_network,
    'captive_portal', v.captive_portal_enabled,
    'controller', 'mock',
    'expires_at', public.wifi_booking_expiry(b.id));
end;
$$;

/**
 * Authorise a device for the caller's live stay.
 *
 * The booking comes from the caller, not the request. Re-authorising a device
 * the caller already registered (same MAC, or same name) reuses its row rather
 * than piling up duplicates.
 */
create or replace function public.wifi_authorize(
  p_device_name text,
  p_device_type text default 'phone',
  p_mac         text default null,
  p_ip          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking uuid;
  b public.bookings%rowtype;
  v public.villas%rowtype;
  v_device uuid;
  v_auth   uuid;
  v_expiry timestamptz;
  v_session uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.wifi_expire_due();

  v_booking := public.wifi_entitled_booking();
  if v_booking is null then
    raise exception 'Wi-Fi is available during your stay — we could not find a stay that is live right now'
      using errcode = '42501';
  end if;

  select * into b from public.bookings where id = v_booking;
  select * into v from public.villas   where id = b.villa_id;
  if not v.wifi_enabled then
    raise exception 'Wi-Fi is switched off at % right now', v.name using errcode = '55000';
  end if;

  -- One person, one stay: a small ceiling stops a script registering hundreds.
  select count(*) into v_count from public.wifi_devices
   where user_id = auth.uid() and booking_id = v_booking and status <> 'blocked';
  v_expiry := public.wifi_booking_expiry(v_booking);

  select id into v_device from public.wifi_devices
   where user_id = auth.uid() and booking_id = v_booking
     and ((p_mac is not null and mac_address = p_mac) or device_name = trim(p_device_name))
   order by created_at desc limit 1;

  if v_device is null then
    if v_count >= 8 then
      raise exception 'You have 8 devices registered already — disconnect one first'
        using errcode = '54000';
    end if;
    insert into public.wifi_devices (user_id, guest_id, booking_id, villa_id,
                                     device_name, device_type, mac_address, ip_address)
    values (auth.uid(), b.customer_id, b.id, b.villa_id,
            trim(p_device_name), coalesce(nullif(p_device_type, ''), 'phone'), p_mac, p_ip)
    returning id into v_device;
    perform public.wifi_log(b.id, 'Wi-Fi device registered',
                            trim(p_device_name) || ' at ' || v.name);
  else
    if exists (select 1 from public.wifi_devices where id = v_device and status = 'blocked') then
      raise exception 'This device has been blocked — please speak to the front desk'
        using errcode = '42501';
    end if;
    update public.wifi_devices
       set status = 'active', last_seen_at = now(), updated_at = now(),
           ip_address = coalesce(p_ip, ip_address), mac_address = coalesce(p_mac, mac_address)
     where id = v_device;
  end if;

  insert into public.wifi_authorizations (guest_id, booking_id, villa_id, device_id, status,
                                          authorized_at, expires_at, created_by)
  values (b.customer_id, b.id, b.villa_id, v_device, 'authorized', now(), v_expiry, auth.uid())
  on conflict (device_id) do update
     set status = 'authorized', authorized_at = now(), revoked_at = null, revoked_reason = null,
         -- A staff extension survives re-authorising; otherwise follow the booking.
         expires_at = case when public.wifi_authorizations.extended
                           then greatest(public.wifi_authorizations.expires_at, excluded.expires_at)
                           else excluded.expires_at end
     where public.wifi_authorizations.status <> 'revoked'
  returning id, expires_at into v_auth, v_expiry;

  if v_auth is null then
    raise exception 'Access for this device was revoked by our team — please speak to the front desk'
      using errcode = '42501';
  end if;

  -- One open session per device.
  update public.wifi_sessions set status = 'ended', disconnected_at = now()
   where device_id = v_device and status = 'active';
  insert into public.wifi_sessions (device_id, guest_id, booking_id, villa_id,
                                    expires_at, controller_session_id)
  values (v_device, b.customer_id, b.id, b.villa_id, v_expiry,
          'mock-' || replace(gen_random_uuid()::text, '-', ''))
  returning id into v_session;

  perform public.wifi_log(b.id, 'Wi-Fi access granted',
    trim(p_device_name) || ' at ' || v.name || ' until ' ||
    to_char(v_expiry at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ' · controller: mock');

  return jsonb_build_object('device_id', v_device, 'authorization_id', v_auth,
                            'session_id', v_session, 'expires_at', v_expiry,
                            'controller', 'mock');
end;
$$;

/**
 * End a device's session. Access stays authorised — the guest can reconnect.
 * Their own device, or staff holding wifi.disconnect.
 */
create or replace function public.wifi_disconnect(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.wifi_devices%rowtype;
begin
  select * into d from public.wifi_devices where id = p_device_id;
  if not found then
    raise exception 'No such device' using errcode = '23503';
  end if;
  if d.user_id is distinct from auth.uid() and not public.has_permission('wifi.disconnect') then
    raise exception 'You cannot disconnect this device' using errcode = '42501';
  end if;

  update public.wifi_sessions set status = 'ended', disconnected_at = now()
   where device_id = p_device_id and status = 'active';
  update public.wifi_devices set status = 'disconnected', updated_at = now()
   where id = p_device_id and status = 'active';

  perform public.wifi_log(d.booking_id, 'Wi-Fi device disconnected', d.device_name);
end;
$$;

-- ----------------------------------------------------------- staff actions --

/** Take a device's access away. It cannot re-authorise until staff restore it. */
create or replace function public.wifi_revoke(p_device_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.wifi_devices%rowtype;
begin
  if not public.has_permission('wifi.revoke') then
    raise exception 'You do not have permission to revoke Wi-Fi access' using errcode = '42501';
  end if;
  select * into d from public.wifi_devices where id = p_device_id;
  if not found then
    raise exception 'No such device' using errcode = '23503';
  end if;

  update public.wifi_authorizations
     set status = 'revoked', revoked_at = now(), revoked_reason = nullif(trim(p_reason), '')
   where device_id = p_device_id;
  update public.wifi_sessions set status = 'revoked', disconnected_at = now()
   where device_id = p_device_id and status = 'active';
  update public.wifi_devices set status = 'blocked', updated_at = now() where id = p_device_id;

  perform public.wifi_log(d.booking_id, 'Wi-Fi access revoked',
    d.device_name || coalesce(' — ' || nullif(trim(p_reason), ''), ''));

  insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
  values ('wifi', 'Wi-Fi access removed',
          'Access for ' || d.device_name || ' was removed by our team. Please speak to the front desk.',
          false, d.booking_id, d.user_id);
end;
$$;

/** Undo a revoke: the device may authorise again. */
create or replace function public.wifi_restore(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.wifi_devices%rowtype;
begin
  if not public.has_permission('wifi.revoke') then
    raise exception 'You do not have permission to restore Wi-Fi access' using errcode = '42501';
  end if;
  select * into d from public.wifi_devices where id = p_device_id;
  if not found then
    raise exception 'No such device' using errcode = '23503';
  end if;
  -- Back to 'expired', not 'authorized': the guest reconnects through the
  -- portal, which re-checks that their stay is still live.
  update public.wifi_authorizations set status = 'expired', revoked_at = null, revoked_reason = null
   where device_id = p_device_id;
  update public.wifi_devices set status = 'disconnected', updated_at = now() where id = p_device_id;
  perform public.wifi_log(d.booking_id, 'Wi-Fi access restored', d.device_name);
end;
$$;

/** Push a device's access past check-out. The only way expiry outruns a stay. */
create or replace function public.wifi_extend(p_device_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.wifi_authorizations%rowtype;
begin
  if not public.has_permission('wifi.manage') then
    raise exception 'You do not have permission to extend Wi-Fi access' using errcode = '42501';
  end if;
  select * into a from public.wifi_authorizations where device_id = p_device_id;
  if not found or a.status = 'revoked' then
    raise exception 'That device has no access to extend' using errcode = '23514';
  end if;
  if p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'Extend to a time within the next seven days' using errcode = '23514';
  end if;

  update public.wifi_authorizations
     set expires_at = p_until, extended = true,
         status = case when status = 'expired' then 'authorized' else status end
   where id = a.id;
  update public.wifi_sessions set expires_at = p_until
   where device_id = p_device_id and status = 'active';

  perform public.wifi_log(a.booking_id, 'Wi-Fi access extended',
    'until ' || to_char(p_until at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'));
end;
$$;

/** Change a villa's Wi-Fi settings. Needs wifi.configure, and is logged. */
create or replace function public.wifi_configure_villa(
  p_villa_id        uuid,
  p_enabled         boolean,
  p_captive_portal  boolean,
  p_ssid            text,
  p_network_id      text,
  p_notes           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.villas%rowtype;
  changes text[] := '{}';
begin
  if not public.has_permission('wifi.configure') then
    raise exception 'You do not have permission to change Wi-Fi settings' using errcode = '42501';
  end if;
  select * into v from public.villas where id = p_villa_id;
  if not found then
    raise exception 'No such villa' using errcode = '23503';
  end if;

  if v.wifi_enabled is distinct from p_enabled then
    changes := changes || (case when p_enabled then 'Wi-Fi switched on' else 'Wi-Fi switched off' end);
  end if;
  if v.captive_portal_enabled is distinct from p_captive_portal then
    changes := changes || (case when p_captive_portal then 'captive portal enabled' else 'captive portal disabled' end);
  end if;
  if v.wifi_network is distinct from trim(p_ssid) then changes := changes || ('network renamed to ' || trim(p_ssid)); end if;
  if v.wifi_network_id is distinct from trim(p_network_id) then changes := changes || 'controller network id changed'::text; end if;
  if v.wifi_configuration_notes is distinct from p_notes then changes := changes || 'notes updated'::text; end if;

  update public.villas
     set wifi_enabled = p_enabled, captive_portal_enabled = p_captive_portal,
         wifi_network = trim(p_ssid), wifi_network_id = trim(p_network_id),
         wifi_configuration_notes = coalesce(p_notes, '')
   where id = p_villa_id;

  if array_length(changes, 1) > 0 then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (p_villa_id, 'wifi', 'Guest Wi-Fi configuration changed',
            v.name || ': ' || array_to_string(changes, ', '),
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff'));
  end if;
end;
$$;

-- ------------------------------------------------- the booking lifecycle --
/**
 * Wi-Fi follows the booking. Closing a stay ends its access; moving check-out
 * moves expiry (unless staff extended it by hand); a stay that has not started
 * never had any to take.
 */
create or replace function public.wifi_follow_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry timestamptz;
begin
  if new.status in ('cancelled', 'rejected', 'no_show', 'checked_out', 'completed')
     and old.status is distinct from new.status then
    update public.wifi_authorizations
       set status = case when new.status in ('checked_out', 'completed') then 'expired' else 'revoked' end,
           revoked_at = case when new.status in ('checked_out', 'completed') then null else now() end,
           revoked_reason = case when new.status in ('checked_out', 'completed') then null
                                 else 'Booking ' || replace(new.status::text, '_', ' ') end
     where booking_id = new.id and status in ('pending', 'authorized');
    update public.wifi_sessions
       set status = case when new.status in ('checked_out', 'completed') then 'expired' else 'revoked' end,
           disconnected_at = now()
     where booking_id = new.id and status = 'active';
    update public.wifi_devices set status = 'expired', updated_at = now()
     where booking_id = new.id and status in ('active', 'disconnected');
    return new;
  end if;

  if new.check_out is distinct from old.check_out
     or new.check_out_time is distinct from old.check_out_time then
    v_expiry := public.wifi_booking_expiry(new.id);
    update public.wifi_authorizations set expires_at = v_expiry
     where booking_id = new.id and not extended and status in ('pending', 'authorized', 'expired');
    -- An access that already lapsed stays lapsed: the guest reconnects through
    -- the portal, which re-checks the stay. Nothing is silently re-opened.
    update public.wifi_sessions set expires_at = v_expiry
     where booking_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_wifi_trg on public.bookings;
create trigger bookings_wifi_trg
  after update of status, check_out, check_out_time on public.bookings
  for each row execute function public.wifi_follow_booking();

/** A villa's standard check-out moving shifts expiry for stays that use it. */
create or replace function public.wifi_follow_villa_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.check_out_time is distinct from old.check_out_time then
    update public.wifi_authorizations a
       set expires_at = public.wifi_booking_expiry(a.booking_id)
      from public.bookings b
     where b.id = a.booking_id and b.villa_id = new.id and b.check_out_time is null
       and not a.extended and a.status in ('pending', 'authorized');
  end if;
  return new;
end;
$$;

drop trigger if exists villas_wifi_hours_trg on public.villas;
create trigger villas_wifi_hours_trg
  after update of check_out_time on public.villas
  for each row execute function public.wifi_follow_villa_hours();

-- ---------------------------------------------------------- permissions --
-- The owner holds all five by definition (has_permission). Nobody else gets
-- anything automatically except the two sensible defaults below: management
-- can see and disconnect, maintenance can see. Revoking, extending and
-- configuring are granted deliberately, in Roles & permissions.
insert into public.department_permissions (department_id, permission)
select d.id, p.permission
from public.departments d
join (values
  ('manager',     'wifi.view'),
  ('manager',     'wifi.disconnect'),
  ('maintenance', 'wifi.view')
) as p(slug, permission) on p.slug = d.slug
on conflict do nothing;

-- ---------------------------------------------------------------- grants --
revoke all on function public.wifi_booking_expiry(uuid)   from public, anon;
revoke all on function public.wifi_booking_opens(uuid)    from public, anon;
revoke all on function public.wifi_entitled_booking()     from public, anon;
revoke all on function public.wifi_expire_due()           from public, anon;
revoke all on function public.wifi_log(uuid, text, text)  from public, anon, authenticated;
revoke all on function public.wifi_my_access()            from public, anon;
revoke all on function public.wifi_authorize(text, text, text, text) from public, anon;
revoke all on function public.wifi_disconnect(uuid)       from public, anon;
revoke all on function public.wifi_revoke(uuid, text)     from public, anon;
revoke all on function public.wifi_restore(uuid)          from public, anon;
revoke all on function public.wifi_extend(uuid, timestamptz) from public, anon;
revoke all on function public.wifi_configure_villa(uuid, boolean, boolean, text, text, text) from public, anon;

grant execute on function public.wifi_booking_expiry(uuid)   to authenticated;
grant execute on function public.wifi_expire_due()           to authenticated;
grant execute on function public.wifi_my_access()            to authenticated;
grant execute on function public.wifi_authorize(text, text, text, text) to authenticated;
grant execute on function public.wifi_disconnect(uuid)       to authenticated;
grant execute on function public.wifi_revoke(uuid, text)     to authenticated;
grant execute on function public.wifi_restore(uuid)          to authenticated;
grant execute on function public.wifi_extend(uuid, timestamptz) to authenticated;
grant execute on function public.wifi_configure_villa(uuid, boolean, boolean, text, text, text) to authenticated;
