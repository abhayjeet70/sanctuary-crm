-- Employee management.
--
-- Until now the only people in the database were guests. Staff existed as
-- profiles hanging off auth.users, created by hand in a migration — which is
-- fine for two demo accounts and no use at all for running a property.
--
-- Two tables rather than one, deliberately. RLS is row-level: a salary column
-- on `employees` would be readable by every manager who can read the roster,
-- and there is no column-level policy to stop it. Pay lives apart, owner-only.
--
-- An employee is not a login. Someone can be on the roster with no portal
-- access at all — most of a housekeeping team never signs in — so profile_id
-- is nullable and the account is created separately, when it is wanted.

create type public.employment_type as enum
  ('full_time', 'part_time', 'contract', 'seasonal');

create type public.employee_status as enum
  ('active', 'on_leave', 'left');

create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  employee_code     text not null unique,
  full_name         text not null,
  -- The job title as the property would print it: "Sous chef", "Front desk
  -- executive". Free text, because a three-villa property invents roles as it
  -- needs them and an enum would be wrong within a month.
  designation       text not null default '',
  -- The team decides which queue they see once they have a login; the
  -- designation is only what they are called.
  team              public.team,
  phone             text not null default '',
  email             text not null default '',
  date_of_joining   date,
  employment_type   public.employment_type not null default 'full_time',
  status            public.employee_status not null default 'active',
  address           text not null default '',
  emergency_name    text not null default '',
  emergency_phone   text not null default '',
  -- Deliberately not called "Aadhaar". Whatever proof the property took, its
  -- reference — not a scan, and not a number this app has any business
  -- validating.
  id_document       text not null default '',
  notes             text not null default '',
  photo_url         text,
  /** The login, when they have one. Null means on the roster, no portal. */
  profile_id        uuid unique references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index employees_team_idx on public.employees (team);
create index employees_status_idx on public.employees (status);

comment on table public.employees is
  'The roster. A row here is a person the property employs, with or without a login.';

create table public.employee_pay (
  employee_id     uuid primary key references public.employees (id) on delete cascade,
  monthly_salary  int not null default 0 check (monthly_salary >= 0),
  effective_from  date not null default current_date,
  note            text not null default '',
  updated_at      timestamptz not null default now()
);

comment on table public.employee_pay is
  'Separate from employees so RLS can keep pay to the owner. Row-level '
  'policies cannot hide a column.';

/** An employee code that reads like one, without a sequence per property. */
create or replace function public.next_employee_code()
returns text
language sql
as $$
  select 'EMP-' || lpad((
    coalesce(max(nullif(regexp_replace(employee_code, '^\D+', ''), ''))::int, 0) + 1
  )::text, 3, '0')
  from public.employees;
$$;

create or replace function public.touch_employee()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.employee_code is null or new.employee_code = '' then
    new.employee_code := public.next_employee_code();
  end if;
  return new;
end;
$$;

create trigger employees_touch_trg
  before insert or update on public.employees
  for each row execute function public.touch_employee();

-- ------------------------------------------------------------------- RLS --

alter table public.employees    enable row level security;
alter table public.employee_pay enable row level security;

-- Management sees the roster: a manager rostering the week needs to know who
-- is on which team and who is on leave.
create policy "management reads the roster" on public.employees
  for select to authenticated using (public.is_admin());

-- Staff see their own record and nobody else's.
create policy "staff read their own record" on public.employees
  for select to authenticated using (profile_id = auth.uid());

-- Hiring, editing and removing is the owner's.
create policy "owners manage employees" on public.employees
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Pay never leaves the owner.
create policy "owners manage pay" on public.employee_pay
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ------------------------------------------------------------ the founders --
-- The three accounts that already exist become roster rows, so the screen is
-- not empty on first open and the links are real rather than invented.

insert into public.employees (employee_code, full_name, designation, team, email,
                              employment_type, status, profile_id)
select
  'EMP-' || lpad((row_number() over (order by p.created_at))::text, 3, '0'),
  p.full_name,
  case p.role
    when 'admin'   then 'Owner'
    when 'manager' then 'Operations manager'
    else initcap(replace(coalesce(p.team::text, 'staff'), '_', ' '))
  end,
  p.team,
  coalesce(u.email, ''),
  'full_time'::public.employment_type,
  'active'::public.employee_status,
  p.id
from public.profiles p
join auth.users u on u.id = p.id
where p.role in ('admin', 'manager', 'staff')
  and not exists (select 1 from public.employees e where e.profile_id = p.id);
