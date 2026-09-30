-- Captive Wi-Fi: the controller connection, the access policy, and the
-- per-villa network plan - all owned by the CRM.
--
-- What lives where
--   * The CRM decides WHO may be online and UNTIL WHEN (the wifi_* functions).
--   * A controller (UniFi, Omada, MikroTik) is what makes the network obey.
--   * SECRETS (the controller's login) are never stored here. They are edge
--     function secrets: `supabase secrets set WIFI_CONTROLLER_USER=... `.
--     This table holds only the non-secret address and the policy.

-- --------------------------------------------------------------- settings --
create table if not exists public.wifi_settings (
  id              boolean primary key default true check (id),
  kind            text not null default 'mock'
                  check (kind in ('mock', 'unifi', 'omada', 'mikrotik')),
  controller_url  text not null default '',
  site            text not null default 'default',
  -- Omada 5.x puts the controller's id in every URL; empty for the rest.
  controller_id   text not null default '',
  portal_url      text not null default '',
  -- Policy. Applied by wifi_booking_expiry / wifi_booking_opens / wifi_authorize.
  grace_minutes   int  not null default 0  check (grace_minutes between 0 and 720),
  early_hours     int  not null default 0  check (early_hours between 0 and 24),
  max_devices     int  not null default 8  check (max_devices between 1 and 20),
  down_kbps       int  check (down_kbps is null or down_kbps between 64 and 1000000),
  up_kbps         int  check (up_kbps   is null or up_kbps   between 64 and 1000000),
  data_cap_mb     int  check (data_cap_mb is null or data_cap_mb between 50 and 1000000),
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_message text not null default '',
  updated_at      timestamptz not null default now()
);
insert into public.wifi_settings (id) values (true) on conflict do nothing;

-- No policies on purpose: nobody reads this table directly. The address of the
-- controller is for people who may configure it, through wifi_get_settings().
alter table public.wifi_settings enable row level security;
revoke all on public.wifi_settings from anon, authenticated;

alter table public.villas
  add column if not exists wifi_vlan_id  int check (wifi_vlan_id is null or wifi_vlan_id between 1 and 4094),
  add column if not exists wifi_ap_count int not null default 0 check (wifi_ap_count between 0 and 30);
comment on column public.villas.wifi_vlan_id is 'VLAN the villa''s guest SSID is tagged with. Null = untagged.';
comment on column public.villas.wifi_ap_count is 'Access points installed at the villa, for the hardware plan.';

-- Which authorisations the controller has been told to drop. The sweep finds
-- the rest: a booking cancelled in the database never called the controller.
alter table public.wifi_authorizations
  add column if not exists controller_released_at timestamptz;

-- ------------------------------------------------------------- permission --
/** Does the caller hold this Wi-Fi permission? For the edge function, which
 *  must not act for someone who could not do it from the app. */
create or replace function public.wifi_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_permission like 'wifi.%' and public.has_permission(p_permission);
$$;
revoke all on function public.wifi_can(text) from public, anon;
grant execute on function public.wifi_can(text) to authenticated;

-- --------------------------------------------------------- read and write --
create or replace function public.wifi_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.wifi_settings%rowtype;
begin
  if not public.has_permission('wifi.configure') then
    raise exception 'You do not have permission to see Wi-Fi settings' using errcode = '42501';
  end if;
  select * into s from public.wifi_settings;
  return to_jsonb(s) - 'id';
end;
$$;

create or replace function public.wifi_save_settings(
  p_kind           text,
  p_controller_url text,
  p_site           text,
  p_controller_id  text,
  p_portal_url     text,
  p_grace_minutes  int,
  p_early_hours    int,
  p_max_devices    int,
  p_down_kbps      int,
  p_up_kbps        int,
  p_data_cap_mb    int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.wifi_settings%rowtype;
  changes text[] := '{}';
  v_url text := regexp_replace(trim(coalesce(p_controller_url, '')), '/+$', '');
begin
  if not public.has_permission('wifi.configure') then
    raise exception 'You do not have permission to change Wi-Fi settings' using errcode = '42501';
  end if;
  if p_kind not in ('mock', 'unifi', 'omada', 'mikrotik') then
    raise exception 'Unknown controller type' using errcode = '23514';
  end if;
  if p_kind <> 'mock' and v_url !~* '^https://[^\s/]+' then
    -- A controller reachable over plain http would carry its login in clear.
    raise exception 'The controller address must start with https://' using errcode = '23514';
  end if;

  select * into o from public.wifi_settings;

  if o.kind is distinct from p_kind then changes := changes || ('controller set to ' || p_kind); end if;
  if o.controller_url is distinct from v_url then changes := changes || 'controller address changed'::text; end if;
  if o.grace_minutes is distinct from p_grace_minutes then changes := changes || ('grace after check-out ' || p_grace_minutes || ' min'); end if;
  if o.early_hours is distinct from p_early_hours then changes := changes || ('early access ' || p_early_hours || ' h'); end if;
  if o.max_devices is distinct from p_max_devices then changes := changes || ('device limit ' || p_max_devices); end if;
  if o.down_kbps is distinct from p_down_kbps or o.up_kbps is distinct from p_up_kbps
     or o.data_cap_mb is distinct from p_data_cap_mb then
    changes := changes || 'speed or data limits changed'::text;
  end if;

  update public.wifi_settings
     set kind = p_kind, controller_url = v_url, site = coalesce(nullif(trim(p_site), ''), 'default'),
         controller_id = trim(coalesce(p_controller_id, '')), portal_url = trim(coalesce(p_portal_url, '')),
         grace_minutes = p_grace_minutes, early_hours = p_early_hours, max_devices = p_max_devices,
         down_kbps = p_down_kbps, up_kbps = p_up_kbps, data_cap_mb = p_data_cap_mb,
         -- A different controller has not been tested yet.
         last_test_at = case when o.kind is distinct from p_kind or o.controller_url is distinct from v_url
                             then null else last_test_at end,
         last_test_ok = case when o.kind is distinct from p_kind or o.controller_url is distinct from v_url
                             then null else last_test_ok end,
         updated_at = now();

  -- Moving the grace period moves check-out for everyone still on the network,
  -- except those staff extended by hand.
  if o.grace_minutes is distinct from p_grace_minutes then
    update public.wifi_authorizations a
       set expires_at = public.wifi_booking_expiry(a.booking_id)
     where not a.extended and a.status in ('pending', 'authorized');
    update public.wifi_sessions s
       set expires_at = public.wifi_booking_expiry(s.booking_id)
     where s.status = 'active'
       and not exists (select 1 from public.wifi_authorizations a
                        where a.device_id = s.device_id and a.extended);
  end if;

  if array_length(changes, 1) > 0 then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values ('00000000-0000-0000-0000-000000000000', 'wifi', 'Captive Wi-Fi settings changed',
            array_to_string(changes, ', '),
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff'));
  end if;
end;
$$;

/** Written by the edge function after a connection test. */
create or replace function public.wifi_record_test(p_ok boolean, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('wifi.configure') then
    raise exception 'You do not have permission to test the controller' using errcode = '42501';
  end if;
  update public.wifi_settings
     set last_test_at = now(), last_test_ok = p_ok, last_test_message = left(coalesce(p_message, ''), 300);
end;
$$;

create or replace function public.wifi_configure_villa_network(
  p_villa_id uuid, p_vlan_id int, p_ap_count int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.villas%rowtype;
begin
  if not public.has_permission('wifi.configure') then
    raise exception 'You do not have permission to change Wi-Fi settings' using errcode = '42501';
  end if;
  select * into v from public.villas where id = p_villa_id;
  if not found then
    raise exception 'No such villa' using errcode = '23503';
  end if;
  update public.villas set wifi_vlan_id = p_vlan_id, wifi_ap_count = coalesce(p_ap_count, 0)
   where id = p_villa_id;
  if v.wifi_vlan_id is distinct from p_vlan_id or v.wifi_ap_count is distinct from coalesce(p_ap_count, 0) then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (p_villa_id, 'wifi', 'Guest Wi-Fi network plan changed',
            v.name || ': VLAN ' || coalesce(p_vlan_id::text, 'untagged') || ', ' || coalesce(p_ap_count, 0) || ' access point(s)',
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff'));
  end if;
end;
$$;

revoke all on function public.wifi_get_settings()  from public, anon;
revoke all on function public.wifi_save_settings(text, text, text, text, text, int, int, int, int, int, int) from public, anon;
revoke all on function public.wifi_record_test(boolean, text) from public, anon;
revoke all on function public.wifi_configure_villa_network(uuid, int, int) from public, anon;
grant execute on function public.wifi_get_settings()  to authenticated;
grant execute on function public.wifi_save_settings(text, text, text, text, text, int, int, int, int, int, int) to authenticated;
grant execute on function public.wifi_record_test(boolean, text) to authenticated;
grant execute on function public.wifi_configure_villa_network(uuid, int, int) to authenticated;

-- ------------------------------------------------------- the policy applied --
/** When access ends: agreed check-out plus the property's grace period. */
create or replace function public.wifi_booking_expiry(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((b.check_out + coalesce(b.check_out_time, v.check_out_time, time '11:00'))
           at time zone 'Asia/Kolkata')
         + make_interval(mins => coalesce((select grace_minutes from public.wifi_settings), 0))
  from public.bookings b
  join public.villas v on v.id = b.villa_id
  where b.id = p_booking_id;
$$;

/** When access may start: the check-in day, less any early-access hours. */
create or replace function public.wifi_booking_opens(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (b.check_in::timestamp at time zone 'Asia/Kolkata')
         - make_interval(hours => coalesce((select early_hours from public.wifi_settings), 0))
  from public.bookings b where b.id = p_booking_id;
$$;

-- wifi_authorize: the device ceiling and the controller name now come from the
-- settings instead of being written into the function.
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
  v_max   int;
  v_kind  text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.wifi_expire_due();
  select max_devices, kind into v_max, v_kind from public.wifi_settings;

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
    if v_count >= v_max then
      raise exception 'You have % devices registered already — disconnect one first', v_max
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
                                          authorized_at, expires_at, created_by, controller)
  values (b.customer_id, b.id, b.villa_id, v_device, 'authorized', now(), v_expiry, auth.uid(), v_kind)
  on conflict (device_id) do update
     set status = 'authorized', authorized_at = now(), revoked_at = null, revoked_reason = null,
         controller = excluded.controller, controller_released_at = null,
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
                                    expires_at, controller, controller_session_id)
  values (v_device, b.customer_id, b.id, b.villa_id, v_expiry, v_kind,
          case when v_kind = 'mock' then 'mock-' || replace(gen_random_uuid()::text, '-', '') end)
  returning id into v_session;

  perform public.wifi_log(b.id, 'Wi-Fi access granted',
    trim(p_device_name) || ' at ' || v.name || ' until ' ||
    to_char(v_expiry at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ' · controller: ' || v_kind);

  return jsonb_build_object('device_id', v_device, 'authorization_id', v_auth,
                            'session_id', v_session, 'expires_at', v_expiry,
                            'controller', v_kind);
end;
$$;


-- wifi_my_access: report the controller that is really configured.
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
    'controller', (select kind from public.wifi_settings),
    'expires_at', public.wifi_booking_expiry(b.id));
end;
$$;

