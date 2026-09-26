-- Menu options the property manages, and what each guest picks from them.
--
-- The dining menu used to be one block of text guests read but could not answer.
-- Now the property defines courses ("categories": breakfast, lunch, dinner,
-- dessert…) and the dishes offered in each, and a guest picks any number of them
-- — up to a limit the property sets per course ("choose any two"). Everything is
-- editable by management; nothing about the menu is in the code.
--
-- What a guest picked is stored as the dish NAMES, in a jsonb map keyed by the
-- course's slug on their stay preferences. Names, not ids, on purpose: an order
-- is a record of what was asked for, so renaming or retiring a dish next month
-- must not rewrite what this guest chose last week.

create table public.meal_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9_]{1,40}$'),
  label        text not null check (length(trim(label)) between 1 and 60),
  -- Null means "as many as they like".
  max_choices  int check (max_choices is null or max_choices between 1 and 20),
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.meal_options (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.meal_categories (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  description  text not null default '',
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (category_id, name)
);
create index meal_options_category_idx on public.meal_options (category_id, sort_order);

alter table public.meal_categories enable row level security;
alter table public.meal_options    enable row level security;

-- The booking popup runs before anybody has an account, so the live menu is
-- readable by anon. Only what is switched on: a dish the kitchen has retired
-- must not be offered.
create policy "anyone reads the live menu categories" on public.meal_categories
  for select to anon, authenticated using (active);
create policy "anyone reads the live menu options" on public.meal_options
  for select to anon, authenticated
  using (active and exists (select 1 from public.meal_categories c
                             where c.id = category_id and c.active));
create policy "management reads the whole menu" on public.meal_categories
  for select to authenticated using (public.is_admin());
create policy "management reads every option" on public.meal_options
  for select to authenticated using (public.is_admin());
create policy "management edits menu categories" on public.meal_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "management edits menu options" on public.meal_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------- seed --
-- From the property's own printed menu; every line is editable in Settings.
insert into public.meal_categories (slug, label, max_choices, sort_order) values
  ('breakfast', 'Breakfast', 2, 10),
  ('lunch',     'Lunch',     null, 20),
  ('dinner',    'Dinner',    null, 30),
  ('dessert',   'Dessert',   1, 40),
  ('beverages', 'Beverages', null, 50);

insert into public.meal_options (category_id, name, sort_order)
select c.id, o.name, o.ord
from public.meal_categories c
join (values
  ('breakfast', 'Dosa with Sambhar, Chutney & Palya', 1),
  ('breakfast', 'Aloo Paratha with Curd & Pickle',    2),
  ('breakfast', 'Eggs, Toast, Butter & Jam',          3),
  ('breakfast', 'Upma',                               4),
  ('breakfast', 'Poha',                               5),
  ('lunch',     'Tadka Dal',                          1),
  ('lunch',     'Methi Dal',                          2),
  ('lunch',     'Dal Makhani',                        3),
  ('lunch',     'Rajma Curry',                        4),
  ('dinner',    'Tadka Dal',                          1),
  ('dinner',    'Methi Dal',                          2),
  ('dinner',    'Dal Makhani',                        3),
  ('dinner',    'Rajma Curry',                        4),
  ('dessert',   'Kesari Kheer',                       1),
  ('dessert',   'Custard with Fruit',                 2),
  ('dessert',   'Ice Cream (Vanilla / Strawberry / Mango) — on availability', 3),
  ('beverages', 'Tea',                                1),
  ('beverages', 'Coffee',                             2),
  ('beverages', 'Fresh Fruit Juice (seasonal)',       3)
) as o(slug, name, ord) on o.slug = c.slug;

-- ------------------------------------------------------ what guests picked --
alter table public.stay_preferences
  add column meal_choices jsonb not null default '{}'::jsonb
    check (jsonb_typeof(meal_choices) = 'object' and pg_column_size(meal_choices) < 8000);

comment on column public.stay_preferences.meal_choices is
  'Dish names the guest picked, by course slug: {"breakfast": ["Upma", "Poha"]}. Names, not ids — a record of what was asked.';

/**
 * Stay preferences, now with menu choices.
 *
 * The course must exist (an unknown key is dropped, not stored), each value must
 * be an array of short strings, and a course with a limit is held to it — the
 * form enforces it for a friendly message, and this is what makes it true.
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
  v_choices  jsonb := '{}'::jsonb;
  c          record;
  v_arr      jsonb;
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

  -- Menu choices: only real courses, only arrays, only within the course's limit.
  if jsonb_typeof(p_prefs -> 'mealChoices') = 'object' then
    for c in select slug, label, max_choices from public.meal_categories where active loop
      if jsonb_typeof(p_prefs -> 'mealChoices' -> c.slug) = 'array' then
        select coalesce(jsonb_agg(distinct left(x, 120)), '[]'::jsonb) into v_arr
        from jsonb_array_elements_text(p_prefs -> 'mealChoices' -> c.slug) x
        where length(trim(x)) > 0;
        if c.max_choices is not null and jsonb_array_length(v_arr) > c.max_choices then
          raise exception '% allows at most % choices', c.label, c.max_choices
            using errcode = '23514';
        end if;
        if jsonb_array_length(v_arr) > 0 then
          v_choices := v_choices || jsonb_build_object(c.slug, v_arr);
        end if;
      end if;
    end loop;
  end if;

  insert into public.stay_preferences (
    booking_id, waitlist_id, villa_id, guest_name, guest_phone,
    check_in, check_out, dietary, meals, cuisines,
    allergies, dietary_notes, food_notes, occasions, special_requests, meal_choices
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
    left(coalesce(p_prefs ->> 'specialRequests', ''), 1000),
    v_choices
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.save_stay_preferences from public, anon;
grant execute on function public.save_stay_preferences to authenticated;

-- A waiting guest's choices follow them when they become a booking.
CREATE OR REPLACE FUNCTION public.convert_waitlist_entry(p_waitlist_id uuid, p_booking_id uuid)
 RETURNS waitlist
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    occasions, special_requests, meal_choices
  )
  select
    p_booking_id, b.villa_id, sp.guest_name, sp.guest_phone, b.check_in, b.check_out,
    sp.dietary, sp.meals, sp.cuisines, sp.allergies, sp.dietary_notes, sp.food_notes,
    sp.occasions, sp.special_requests, sp.meal_choices
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
$function$;

revoke all on function public.convert_waitlist_entry(uuid, uuid) from public, anon;
grant execute on function public.convert_waitlist_entry(uuid, uuid) to authenticated;
