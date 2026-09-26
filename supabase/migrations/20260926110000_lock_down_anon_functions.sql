-- Found by the QA pass of 26 Sept: PostgreSQL grants EXECUTE to PUBLIC on every
-- new function, and Supabase exposes every public function as an endpoint. Any
-- function written without an explicit revoke was therefore callable by a
-- visitor with no login at all. Probed as anon, these worked:
--
--   notify_staff / notify_guest     put a fake alert in the staff tray, or in any
--                                   guest's, by booking id
--   find_booking_conflicts          returned other guests' booking references and dates
--   next_invoice_number             consumed a GST invoice number (gaps in a tax
--                                   invoice series need explaining to an auditor)
--   next_booking_reference          consumed a booking reference
--   can_order_food                  answered for any booking id
--
-- None of these was ever meant to be reached from a browser.

-- Internal only: every caller is a SECURITY DEFINER function or trigger (checked
-- against pg_proc — no invoker function calls them), so nobody needs the grant.
revoke all on function public.notify_staff(public.activity_kind, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_staff(public.activity_kind, text, text)       from public, anon, authenticated;
revoke all on function public.notify_guest(uuid, public.activity_kind, text, text) from public, anon, authenticated;

-- Signed-in only. find_booking_conflicts is called by staff (the create-booking
-- function, on the caller's JWT) and can_order_food by a row-level-security policy.
revoke all on function public.find_booking_conflicts(uuid, uuid[], date, date, uuid) from public, anon;
revoke all on function public.can_order_food(uuid)                                    from public, anon;
grant execute on function public.find_booking_conflicts(uuid, uuid[], date, date, uuid) to authenticated;
grant execute on function public.can_order_food(uuid)                                    to authenticated;

revoke all on function public.generate_guest_code()   from public, anon;
revoke all on function public.next_employee_code()    from public, anon;
revoke all on function public.next_booking_reference() from public, anon;
revoke all on function public.next_invoice_number()   from public, anon;
revoke all on function public.seed_id(text)           from public, anon;
grant execute on function public.generate_guest_code()   to authenticated;
grant execute on function public.next_employee_code()    to authenticated;
grant execute on function public.next_booking_reference() to authenticated;
grant execute on function public.next_invoice_number()   to authenticated;

-- A signed-in GUEST must not be able to burn numbers either. The two that matter
-- (an invoice series must be gapless, booking references unique and ordered) are
-- only ever reached legitimately through a SECURITY DEFINER path — where
-- current_user is the function owner, not `authenticated` — or by staff.
create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Invoice numbers are issued by the system' using errcode = '42501';
  end if;
  return coalesce((select invoice_prefix from public.property_settings limit 1), 'HOS')
         || '/' || public.financial_year()
         || '/' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
end;
$$;

create or replace function public.next_booking_reference()
returns text
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Booking references are issued by the system' using errcode = '42501';
  end if;
  return 'HOS-' || lpad(nextval('public.booking_reference_seq')::text, 4, '0');
end;
$$;

-- Same lint fix as a bonus: the empty array literal was typed text, not text[].
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
  changes text[] := '{}'::text[];
begin
  if not public.has_permission('wifi.configure') then
    raise exception 'You do not have permission to change Wi-Fi settings' using errcode = '42501';
  end if;
  select * into v from public.villas where id = p_villa_id;
  if not found then
    raise exception 'No such villa' using errcode = '23503';
  end if;

  if v.wifi_enabled is distinct from p_enabled then
    changes := changes || (case when p_enabled then 'Wi-Fi switched on' else 'Wi-Fi switched off' end)::text;
  end if;
  if v.captive_portal_enabled is distinct from p_captive_portal then
    changes := changes || (case when p_captive_portal then 'captive portal enabled' else 'captive portal disabled' end)::text;
  end if;
  if v.wifi_network is distinct from trim(p_ssid) then changes := changes || ('network renamed to ' || trim(p_ssid))::text; end if;
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

revoke all on function public.wifi_configure_villa(uuid, boolean, boolean, text, text, text) from public, anon;
grant execute on function public.wifi_configure_villa(uuid, boolean, boolean, text, text, text) to authenticated;
