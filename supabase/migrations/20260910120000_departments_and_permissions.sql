-- Departments the property defines, instead of four values fixed in an enum.
--
-- `team` was a Postgres enum: housekeeping, kitchen, maintenance, manager.
-- Adding "Front desk" or "Spa" meant a migration, which is the wrong shape for
-- something the owner should be able to change on a Tuesday.
--
-- The enum columns are left in place and left populated. Nothing reads them
-- after this migration, but dropping a column that five policies referenced an
-- hour ago is how a Saturday gets ruined — they can go once this has run for a
-- while.
--
-- Permissions are rows, not booleans on a table, so a new one is an insert
-- rather than a schema change. Presence means granted; absence means no.

create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  description  text not null default '',
  -- Job titles this department offers, so the employee form can suggest them.
  designations text[] not null default '{}',
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.departments is
  'Teams the property runs. Replaces the fixed `team` enum.';

create table public.department_permissions (
  department_id uuid not null references public.departments (id) on delete cascade,
  permission    text not null,
  primary key (department_id, permission)
);

comment on table public.department_permissions is
  'Presence grants. Keys are checked by has_permission() and read by the UI.';

-- The four that existed, so nothing is orphaned and the names carry over.
insert into public.departments (name, slug, description, designations, sort_order) values
  ('Housekeeping', 'housekeeping', 'Rooms, turndown, laundry and linen.',
   array['Villa attendant', 'Housekeeping supervisor', 'Laundry attendant'], 0),
  ('Kitchen', 'kitchen', 'In-villa dining, from the order to the pass.',
   array['Chef de partie', 'Sous chef', 'Kitchen assistant', 'Steward'], 1),
  ('Maintenance', 'maintenance', 'Water, power, wifi and everything that stops working.',
   array['Maintenance technician', 'Gardener', 'Pool technician'], 2),
  ('Management', 'manager', 'The desk: bookings, guests and anything unplaced.',
   array['Operations manager', 'Front desk executive', 'Guest relations'], 3);

-- Each department starts with what its old policy already allowed, so this
-- migration changes who *can* be configured, not who currently can do what.
insert into public.department_permissions (department_id, permission)
select d.id, p.permission
from public.departments d
join (values
  ('housekeeping', 'requests.work'),
  ('maintenance',  'requests.work'),
  ('kitchen',      'requests.work'),
  ('kitchen',      'kitchen.work'),
  ('manager',      'requests.work'),
  ('manager',      'requests.all'),
  ('manager',      'kitchen.work'),
  ('manager',      'bookings.view'),
  ('manager',      'guests.view')
) as p(slug, permission) on p.slug = d.slug;

-- ------------------------------------------------------------- the links --

alter table public.profiles       add column if not exists department_id uuid references public.departments (id);
alter table public.employees      add column if not exists department_id uuid references public.departments (id);
alter table public.guest_requests add column if not exists department_id uuid references public.departments (id);

update public.profiles p
   set department_id = d.id
  from public.departments d
 where d.slug = p.team::text and p.department_id is null;

update public.employees e
   set department_id = d.id
  from public.departments d
 where d.slug = e.team::text and e.department_id is null;

update public.guest_requests r
   set department_id = d.id
  from public.departments d
 where d.slug = r.assigned_to::text and r.department_id is null;

create index if not exists guest_requests_department_idx on public.guest_requests (department_id);

-- ---------------------------------------------------------------- helpers --

/** The department of whoever is signed in. Null for guests and the owner. */
create or replace function public.current_department()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid();
$$;

/**
 * Does the signed-in person's department grant this?
 *
 * The owner is never asked — they hold everything by definition, and making
 * the owner depend on a row somebody could delete is how you lock yourself
 * out of your own property.
 */
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1
    from public.profiles pr
    join public.department_permissions dp on dp.department_id = pr.department_id
    join public.departments d on d.id = dp.department_id
    where pr.id = auth.uid()
      and d.active
      and dp.permission = p_permission
  );
$$;

revoke all on function public.current_department() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.current_department() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- -------------------------------------------------------------------- RLS --

alter table public.departments            enable row level security;
alter table public.department_permissions enable row level security;

-- Everyone signed in can read the list: the employee form, the request router
-- and the staff screen all need the names, and a department name is not a
-- secret.
create policy "departments are readable" on public.departments
  for select to authenticated using (true);
create policy "owners write departments" on public.departments
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "permissions are readable" on public.department_permissions
  for select to authenticated using (true);
create policy "owners write permissions" on public.department_permissions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
