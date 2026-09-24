-- Two small doors.
--
-- 1. The booking wizard runs before anybody has an account, so it cannot read
--    property_settings (signed-in only, and it holds bank details). This hands
--    anon exactly the guest-facing words and nothing financial.
--
-- 2. A companion signs in with a shared login and then says who they are.
--    Only their own row, only name and contact — never the booking.

create or replace function public.public_stay_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trading_name', trading_name,
    'legal_name', legal_name,
    'address_line1', address_line1,
    'city', city,
    'state', state,
    'contact_phone', contact_phone,
    'contact_email', contact_email,
    'website', website,
    'instagram', instagram,
    'dining_menu', dining_menu,
    'addons', addons,
    'stay_terms', stay_terms,
    'booking_policy', booking_policy,
    'pet_policy', pet_policy,
    'important_info', important_info,
    'breakfast_line', breakfast_line
  )
  from public.property_settings
  where id;
$$;

grant execute on function public.public_stay_info() to anon, authenticated;

create or replace function public.update_companion_details(
  p_full_name text,
  p_phone     text default '',
  p_email     text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companion uuid := public.current_companion_id();
begin
  if v_companion is null then
    raise exception 'Only a guest added to a booking can do this' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Tell us your name' using errcode = '23514';
  end if;

  update public.booking_companions
     set full_name = trim(p_full_name),
         phone = coalesce(p_phone, ''),
         email = coalesce(p_email, '')
   where id = v_companion and revoked_at is null;

  update public.profiles set full_name = trim(p_full_name) where id = auth.uid();
end;
$$;

grant execute on function public.update_companion_details(text, text, text) to authenticated;
