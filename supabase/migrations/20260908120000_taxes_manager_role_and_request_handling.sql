-- Four things: configurable taxes, a proper Indian tax invoice, a manager
-- role beside the owner, and requests that can actually be worked and closed.

-- =================================================================== roles ==
--
-- A manager runs the property day to day; the owner also holds the keys to
-- the configuration. Rather than rewrite 27 policies, is_admin() becomes
-- "management" — one definition governing all of them — and the handful of
-- owner-only tables move to is_owner().

/** The owner: the one account that may change configuration. */
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

/**
 * Management: owner or manager.
 *
 * Deliberately still called is_admin(). Twenty-seven policies read it, and
 * one definition changing is a smaller and safer diff than twenty-seven
 * policies changing — the meaning was always "may run the property".
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  );
$$;

/** Staff: anyone on the payroll, management included. */
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('staff', 'manager', 'admin')
  );
$$;

-- Configuration stays with the owner. A manager runs the property; they do
-- not get to change the tax rates, the villas or who else has an account.
drop policy if exists "admins change settings" on public.property_settings;
create policy "owners change settings" on public.property_settings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "admins write villas" on public.villas;
create policy "owners write villas" on public.villas
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "admins write rooms" on public.rooms;
create policy "owners write rooms" on public.rooms
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "owners manage profiles" on public.profiles
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ================================================================== taxes ==
--
-- One rate on the booking stays the source of truth for money — every total
-- in the system already derives from booking.tax_rate and must keep agreeing
-- with what the guest was quoted. This table describes how that rate is made
-- up and what each part is called, so the invoice can print a real breakdown
-- and the property can change the levies without a deploy.
--
-- The sum of the active rows is the rate offered on a new booking. An invoice
-- apportions the tax actually charged across those rows pro rata, so the
-- printed parts always add back to the total even for a booking taken when
-- the rates were different.

create table if not exists public.taxes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rate       numeric(6,4) not null check (rate >= 0 and rate <= 1),
  -- 'gst' splits into CGST + SGST within the state and becomes IGST across
  -- it. 'levy' prints as one line wherever the guest is from.
  kind       text not null default 'gst' check (kind in ('gst', 'levy')),
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.taxes enable row level security;

create policy "taxes are readable" on public.taxes
  for select to anon, authenticated using (true);
create policy "owners write taxes" on public.taxes
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

insert into public.taxes (name, rate, kind, sort_order)
select 'GST', 0.180, 'gst', 0
where not exists (select 1 from public.taxes);

-- Place of supply decides CGST + SGST against IGST, and it is the guest's
-- state that decides it. The column was never there to compare.
alter table public.customers add column if not exists state text not null default '';

-- What a compliant invoice has to carry beyond what Settings already held.
alter table public.property_settings
  add column if not exists state_code           text not null default '29',
  add column if not exists hsn_code             text not null default '996311',
  add column if not exists invoice_declaration  text not null default
    'We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.',
  add column if not exists signatory_name       text not null default '';

comment on column public.property_settings.state_code is
  'GST state code of the place of supply — 29 is Karnataka.';
comment on column public.property_settings.hsn_code is
  'SAC for accommodation services. 996311 is hotel/guest-house lodging.';

-- ================================================================ requests ==
--
-- A request could be moved between statuses and nothing else. There was no
-- way to say who picked it up, what was done, or when it was finished — so
-- "completed" was a claim with no evidence behind it, and the guest was
-- never told.

alter table public.guest_requests
  add column if not exists acknowledged_at timestamptz,
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolution_note text,
  add column if not exists assigned_user   uuid references public.profiles(id);

comment on column public.guest_requests.assigned_user is
  'The person on the hook, where assigned_to is only the team.';

/** Stamp the clock from the status, so the times cannot disagree with it. */
create or replace function public.stamp_request_progress()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('assigned', 'in_progress') and new.acknowledged_at is null then
    new.acknowledged_at := now();
  end if;

  if new.status in ('completed', 'rejected') then
    if new.resolved_at is null then new.resolved_at := now(); end if;
    if new.acknowledged_at is null then new.acknowledged_at := now(); end if;
  else
    -- Reopening clears the finish, otherwise the row claims to be both.
    new.resolved_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists guest_requests_stamp_trg on public.guest_requests;
create trigger guest_requests_stamp_trg
  before insert or update of status on public.guest_requests
  for each row execute function public.stamp_request_progress();

/** Tell the guest what happened to what they asked for. */
create or replace function public.notify_guest_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'in_progress' then
    perform public.notify_guest(new.booking_id, 'request', 'We are on it',
      replace(new.category::text, '_', ' ') || ' — someone is dealing with it now.');
  elsif new.status = 'completed' then
    perform public.notify_guest(new.booking_id, 'request', 'Your request is done',
      coalesce(new.resolution_note,
               replace(new.category::text, '_', ' ') || ' has been taken care of.'));
  elsif new.status = 'rejected' then
    perform public.notify_guest(new.booking_id, 'request', 'About your request',
      coalesce(new.resolution_note,
               'We could not do this one. Please talk to the desk.'));
  end if;

  return new;
end;
$$;

drop trigger if exists guest_requests_notify_guest_trg on public.guest_requests;
create trigger guest_requests_notify_guest_trg
  after update of status on public.guest_requests
  for each row execute function public.notify_guest_request();

-- Staff need to see and work the queue for their own team. Until now only
-- management could write to guest_requests at all, so the staff screen could
-- show a job but never finish it.
drop policy if exists "staff read requests" on public.guest_requests;
create policy "staff read requests" on public.guest_requests
  for select to authenticated using (public.is_staff());

drop policy if exists "staff work their queue" on public.guest_requests;
create policy "staff work their queue" on public.guest_requests
  for update to authenticated
  using (
    public.is_staff()
    and (public.is_admin() or assigned_to is null or assigned_to = public.current_team())
  )
  with check (public.is_staff());
