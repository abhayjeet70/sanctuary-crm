-- The front desk: arrival and departure times, guest identification, a room
-- rack, and a waiting list that turns "we're full" into a queue.
--
-- Five things, all of them the same job — reception. Grouped in one migration
-- because they are one feature: the desk cannot run a waiting list without
-- knowing who is arriving and when, and cannot check anyone in without an ID.

-- ============================================================ arrival times ==
--
-- Nullable on purpose. Null means "the villa's standard time", which is the
-- true state for almost every booking — writing 14:00 onto every row would
-- lose the difference between a guest who asked for a late arrival and one who
-- never said. The villa's own check_in_time stays the default.

alter table public.bookings
  add column if not exists check_in_time  time,
  add column if not exists check_out_time time;

comment on column public.bookings.check_in_time is
  'Agreed arrival time. Null falls back to the villa standard check-in.';
comment on column public.bookings.check_out_time is
  'Agreed departure time. Null falls back to the villa standard check-out.';

-- ========================================================== guest identity ==
--
-- Indian hospitality practice requires a photo ID on file for every guest
-- checking in. Only the type, a reference and the scan's storage path are held
-- here — the picture itself lives in a private bucket, never as a public URL.

alter table public.customers
  add column if not exists id_type       text,
  add column if not exists id_number     text,
  add column if not exists id_image_path text;

comment on column public.customers.id_number is
  'As presented at check-in. Personal data: reachable only through the customers policy.';
comment on column public.customers.id_image_path is
  'A path inside the private guest-ids bucket, never a public URL.';

-- The scans. Same shape as payment-receipts, and equally not public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-ids',
  'guest-ids',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Management only, in both directions. A guest has no reason to fetch their
-- own ID scan back out of our storage, and no other department needs it.
create policy "management uploads guest ids"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'guest-ids' and public.is_admin());

create policy "management reads guest ids"
  on storage.objects for select to authenticated
  using (bucket_id = 'guest-ids' and public.is_admin());

-- Replacing a blurred photograph is an ordinary correction, so update is
-- allowed. Delete is not: removing the ID for a stay that happened is a
-- support task, not a button.
create policy "management replaces guest ids"
  on storage.objects for update to authenticated
  using (bucket_id = 'guest-ids' and public.is_admin())
  with check (bucket_id = 'guest-ids' and public.is_admin());

-- ============================================================= the waitlist ==
--
-- Someone asks for dates that are already sold. Today that is the end of the
-- conversation. This makes it a queue instead: first come, first served, and
-- when a stay is cancelled the desk knows immediately who was waiting.
--
-- Position is NOT a column. It is `order by created_at`, derived on read —
-- storing a number means renumbering every row behind one that is removed, and
-- a renumbering that half-runs is a queue nobody can trust again.

create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  -- Null means "any villa" — a guest who wants the dates more than the house.
  villa_id    uuid references public.villas (id) on delete cascade,
  check_in    date not null,
  check_out   date not null,
  adults      int not null default 1 check (adults >= 1),
  children    int not null default 0 check (children >= 0),
  source      public.booking_source not null default 'phone',
  note        text not null default '',

  status      text not null default 'waiting'
                check (status in ('waiting', 'offered', 'converted', 'expired', 'cancelled')),
  -- Set when the desk offers freed dates, so an offer nobody answered is
  -- visible rather than silently holding up everyone behind it.
  offered_at  timestamptz,
  -- The stay it became, once it became one.
  booking_id  uuid references public.bookings (id) on delete set null,
  created_at  timestamptz not null default now(),

  -- Same half-open rule as a booking: a check-out on the 3rd is not the 3rd.
  constraint waitlist_dates_ordered check (check_out > check_in)
);

comment on table public.waitlist is
  'Requests for dates already sold. First come, first served on created_at.';

create index waitlist_villa_dates_idx on public.waitlist (villa_id, check_in, check_out);
create index waitlist_open_idx on public.waitlist (created_at) where status = 'waiting';
create index waitlist_customer_idx on public.waitlist (customer_id);

alter table public.waitlist enable row level security;

-- Management runs it; a department can be granted it (reception is exactly
-- who should hold this).
create policy "management runs the waitlist" on public.waitlist
  for all to authenticated
  using (public.is_admin() or public.has_permission('waitlist.manage'))
  with check (public.is_admin() or public.has_permission('waitlist.manage'));

-- A guest can join the queue and see where they are in it.
create policy "guests read their own waitlist entries" on public.waitlist
  for select to authenticated
  using (customer_id = public.current_customer_id());

create policy "guests join the waitlist" on public.waitlist
  for insert to authenticated
  with check (
    customer_id = public.current_customer_id()
    and status = 'waiting'
    and booking_id is null
  );

-- They may withdraw. They may not promote themselves: the two statuses this
-- allows are the two a guest legitimately owns.
create policy "guests withdraw from the waitlist" on public.waitlist
  for update to authenticated
  using (customer_id = public.current_customer_id())
  with check (
    customer_id = public.current_customer_id()
    and status in ('waiting', 'cancelled')
  );

alter table public.waitlist replica identity full;
alter publication supabase_realtime add table public.waitlist;

-- ------------------------------------------------- when a stay is released --
--
-- The whole point of a queue. A cancellation is only useful to the desk if
-- somebody tells them the dates are worth selling again.

create or replace function public.notify_waitlist_on_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waiting int;
  v_villa   text;
begin
  if new.status not in ('cancelled', 'rejected', 'no_show') then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  -- Overlap, not equality: someone waiting for the 3rd to the 6th cares about
  -- a cancellation of the 1st to the 5th.
  select count(*) into v_waiting
  from public.waitlist w
  where w.status = 'waiting'
    and (w.villa_id is null or w.villa_id = new.villa_id)
    and w.check_in  < new.check_out
    and w.check_out > new.check_in;

  if v_waiting = 0 then return new; end if;

  select name into v_villa from public.villas where id = new.villa_id;

  perform public.notify_staff(
    'booking',
    coalesce(v_villa, 'A villa') || ' has freed up',
    v_waiting::text || ' on the waiting list want these dates - ' ||
      to_char(new.check_in, 'DD Mon') || ' to ' || to_char(new.check_out, 'DD Mon'),
    new.id);

  return new;
end;
$$;

create trigger notify_waitlist_on_release
  after update of status on public.bookings
  for each row execute function public.notify_waitlist_on_release();

-- ============================================================== front desk ==
--
-- Reception as a department the owner can staff, rather than four fixed teams
-- with nobody answering the door.

insert into public.departments (name, slug, description, designations, sort_order)
values (
  'Front desk',
  'front_desk',
  'Arrivals, departures, the room rack and the waiting list.',
  array['Receptionist', 'Front desk executive', 'Guest relations executive',
        'Night auditor', 'Concierge'],
  4)
on conflict (slug) do nothing;

-- Two new grants. `frontdesk.view` opens the rack; `waitlist.manage` is what
-- the policy above checks. Both are ordinary rows, so the owner can move them
-- to another department without a migration.
insert into public.department_permissions (department_id, permission)
select d.id, p.permission
from public.departments d
join (values
  ('front_desk', 'frontdesk.view'),
  ('front_desk', 'waitlist.manage'),
  ('front_desk', 'bookings.view'),
  ('front_desk', 'guests.view'),
  ('front_desk', 'requests.work'),
  ('front_desk', 'requests.all'),
  -- The desk on duty is management's screen too.
  ('manager',    'frontdesk.view'),
  ('manager',    'waitlist.manage')
) as p(slug, permission) on p.slug = d.slug
on conflict do nothing;
