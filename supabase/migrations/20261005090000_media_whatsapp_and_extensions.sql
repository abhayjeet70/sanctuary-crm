-- Three small additions behind the booking-window rework.
--
-- 1. Rooms get photographs, so a guest choosing rooms in a split villa sees
--    what they are choosing. Villas already had `gallery`.
-- 2. "Chat with us on WhatsApp" from the booking window is logged as an
--    enquiry, so the desk sees who reached out and with what details.
-- 3. A stay extended by the desk records when the extra money is due; how long
--    the guest gets is a property setting.

-- ------------------------------------------------------------- room photos --

alter table public.rooms
  add column if not exists gallery text[] not null default '{}',
  add column if not exists description text not null default '';

/** What the public booking window shows about rooms. Anon cannot read `rooms`. */
create or replace function public.public_room_media()
returns table (id uuid, villa_id uuid, name text, capacity int, description text, gallery text[])
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.villa_id, r.name, r.capacity, r.description, r.gallery
  from public.rooms r
  order by r.name;
$$;

revoke all on function public.public_room_media() from public;
grant execute on function public.public_room_media() to anon, authenticated;

-- -------------------------------------------------------- whatsapp enquiries --

create table if not exists public.whatsapp_enquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  phone      text not null default '',
  email      text not null default '',
  villa_name text not null default '',
  check_in   date,
  check_out  date,
  adults     int not null default 0,
  children   int not null default 0,
  estimate   int not null default 0,
  message    text not null default '',
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_enquiries enable row level security;

create policy "management reads whatsapp enquiries"
  on public.whatsapp_enquiries for select to authenticated
  using (public.is_admin());

create policy "management updates whatsapp enquiries"
  on public.whatsapp_enquiries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Inserted only through this function, which caps every field: the booking
-- window runs before sign-in, so the caller is anonymous.
-- ponytail: no rate limit; add one keyed on phone if the table gets spammed.
create or replace function public.log_whatsapp_enquiry(
  p_name text, p_phone text, p_email text, p_villa_name text,
  p_check_in date, p_check_out date, p_adults int, p_children int,
  p_estimate int, p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.whatsapp_enquiries
    (name, phone, email, villa_name, check_in, check_out, adults, children, estimate, message)
  values (
    left(coalesce(p_name, ''), 120), left(coalesce(p_phone, ''), 40),
    left(coalesce(p_email, ''), 160), left(coalesce(p_villa_name, ''), 120),
    p_check_in, p_check_out,
    least(greatest(coalesce(p_adults, 0), 0), 50), least(greatest(coalesce(p_children, 0), 0), 50),
    least(greatest(coalesce(p_estimate, 0), 0), 100000000), left(coalesce(p_message, ''), 2000)
  );
$$;

revoke all on function public.log_whatsapp_enquiry(text, text, text, text, date, date, int, int, int, text) from public;
grant execute on function public.log_whatsapp_enquiry(text, text, text, text, date, date, int, int, int, text) to anon, authenticated;

-- --------------------------------------------- food & wishes from the portal --

-- Food & wishes moved out of the booking window into the guest portal, so they
-- are answered after the booking exists — and may be changed. save_stay_preferences
-- inserts with `on conflict do nothing`; this replaces in one transaction, and a
-- refused save (a course limit) rolls the delete back with it.
create or replace function public.replace_stay_preferences(p_booking_id uuid, p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin()
     and (select customer_id from public.bookings where id = p_booking_id)
         is distinct from public.current_customer_id() then
    raise exception 'Not your stay' using errcode = '42501';
  end if;
  delete from public.stay_preferences where booking_id = p_booking_id;
  perform public.save_stay_preferences(p_booking_id, null, p_prefs);
end;
$$;

revoke all on function public.replace_stay_preferences(uuid, jsonb) from public, anon;
grant execute on function public.replace_stay_preferences(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------- stay extensions --

alter table public.bookings
  add column if not exists extension_due_at timestamptz;

alter table public.property_settings
  add column if not exists extension_payment_days int not null default 1
    check (extension_payment_days between 0 and 60);
