-- Property settings, and a menu the property can actually run.
--
-- Three things were hardcoded in the UI and had no business being there:
--
--   * the UPI handle and bank account guests are told to pay into
--   * the legal name, address and GSTIN printed on every invoice
--   * the menu, which was seed data with no way to add a dish
--
-- Payment details in particular are the kind of thing that changes — a new
-- account, a corrected IFSC — and a change that needs a developer is a change
-- that does not happen.

-- ---------------------------------------------------------------- settings --
-- A single row, enforced by the check on `id`. A settings table that can hold
-- two rows will eventually hold two rows, and then nothing agrees.
create table public.property_settings (
  id boolean primary key default true check (id),

  -- Identity, as it appears on an invoice
  legal_name     text not null default 'Homes of Sanctuary',
  trading_name   text not null default 'Homes of Sanctuary',
  address_line1  text not null default 'Nandi Hills',
  address_line2  text not null default 'Chikkaballapur',
  city           text not null default 'Chikkaballapur',
  state          text not null default 'Karnataka',
  postcode       text not null default '562103',
  country        text not null default 'India',
  contact_email  text not null default '',
  contact_phone  text not null default '',
  gstin          text not null default '',
  pan            text not null default '',

  -- Where guests send money
  upi_id          text not null default '',
  bank_name       text not null default '',
  account_name    text not null default '',
  account_number  text not null default '',
  ifsc            text not null default '',
  payment_note    text not null default
    'Please quote your booking reference with the transfer so we can match it.',

  -- Invoice presentation
  invoice_prefix  text not null default 'HOS',
  invoice_footer  text not null default '',
  invoice_terms   text not null default '',
  show_gstin_on_invoice boolean not null default true,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.property_settings (
  id, contact_email, contact_phone,
  upi_id, bank_name, account_name, account_number, ifsc
) values (
  true,
  'stay@homesofsanctuary.com', '+91 80 4567 8900',
  -- Carried over from what the guest payment page had hardcoded, so nothing
  -- changes for a guest mid-booking.
  'sanctuary@hdfcbank', 'HDFC Bank', 'Homes of Sanctuary', '5010 0842 1173 09', 'HDFC0001284'
)
on conflict (id) do nothing;

alter table public.property_settings enable row level security;

-- Guests need the payment details to pay, and the address for their invoice.
create policy "settings are readable when signed in" on public.property_settings
  for select to authenticated using (true);

create policy "admins change settings" on public.property_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_property_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger property_settings_touch_trg
  before update on public.property_settings
  for each row execute function public.touch_property_settings();

-- ------------------------------------------------------------------- menu --
-- A dish belongs to one villa, or to all of them when villa_id is null. Null
-- rather than a join table because "served everywhere" is the common case and
-- a row per villa would have to be kept in step by hand.
alter table public.menu_items
  add column if not exists villa_id uuid references public.villas (id) on delete cascade,
  add column if not exists sort_order int not null default 0;

comment on column public.menu_items.villa_id is
  'Null means the dish is served at every villa. Set it to limit the dish to one.';

create index if not exists menu_items_villa_idx on public.menu_items (villa_id);

-- Dish photos are not sensitive, so this bucket is public — a signed URL per
-- image on a menu would be a lot of round trips for no benefit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "menu images are public to read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-images');

create policy "admins upload menu images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_admin());

create policy "admins replace menu images"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());

create policy "admins remove menu images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());

-- ------------------------------------------------------- dish photography --
-- The seed pointed at picsum, which returns landscapes: the menu showed a
-- typewriter for Charred Corn Salad. These are keyword-matched photos, stable
-- because of the lock parameter, and every one is replaceable from Settings.
update public.menu_items set image = case name
  when 'Set Dosa with Vegetable Kurma'      then 'https://loremflickr.com/800/600/dosa,indian?lock=11'
  when 'Bisi Bele Bath'                     then 'https://loremflickr.com/800/600/rice,indian,curry?lock=12'
  when 'Nandi Hills Filter Coffee'          then 'https://loremflickr.com/800/600/filter,coffee,india?lock=13'
  when 'Akki Roti with Ennegayi'            then 'https://loremflickr.com/800/600/roti,indian,bread?lock=14'
  when 'Verandah Breakfast Plate'           then 'https://loremflickr.com/800/600/breakfast,eggs,toast?lock=15'
  when 'Charred Corn and Avocado Salad'     then 'https://loremflickr.com/800/600/salad,avocado,corn?lock=16'
  when 'Wood-Fired Margherita'              then 'https://loremflickr.com/800/600/pizza,margherita?lock=17'
  when 'Coorg Pandi Curry with Kadambuttu'  then 'https://loremflickr.com/800/600/pork,curry?lock=18'
  when 'Malnad Chicken Curry Thali'         then 'https://loremflickr.com/800/600/thali,indian,curry?lock=19'
  when 'Sanctuary Vegetarian Thali'         then 'https://loremflickr.com/800/600/thali,vegetarian,indian?lock=20'
  when 'Grilled Fish with Verandah Herbs'   then 'https://loremflickr.com/800/600/grilled,fish?lock=21'
  when 'Masala Peanuts and Papad Basket'    then 'https://loremflickr.com/800/600/peanuts,snack?lock=22'
  when 'Mangalore Bajji with Chutney'       then 'https://loremflickr.com/800/600/fritters,pakora?lock=23'
  when 'Estate Nilgiri Tea'                 then 'https://loremflickr.com/800/600/tea,teapot?lock=24'
  when 'Tender Coconut Cooler'              then 'https://loremflickr.com/800/600/coconut,drink?lock=25'
  else image
end
where image like '%picsum%';

-- Keep the menu in a sensible order rather than whatever came back.
update public.menu_items
   set sort_order = case category
     when 'breakfast'    then 10
     when 'south_indian' then 20
     when 'lunch'        then 30
     when 'dinner'       then 40
     when 'continental'  then 50
     when 'snacks'       then 60
     when 'beverages'    then 70
   end;
