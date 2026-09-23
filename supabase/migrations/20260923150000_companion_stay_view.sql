-- A companion sees the stay, not the booking.
--
-- The first cut let a companion SELECT their `bookings` row. RLS is
-- row-level, and that row carries the nightly rate, every surcharge, the
-- discount, the tax rate, the amount paid, the payment status — and the
-- property's internal notes. Hiding those in the portal would have been
-- exactly the "hide the button" security this feature was told not to use.
--
-- So the policy goes, and in its place is a view that has no such columns to
-- leak. It is owned by the migration role, so it reads `bookings` past RLS;
-- the WHERE clause is the whole boundary, and it is the same live-access rule
-- every other companion policy uses. `security_barrier` stops a clever filter
-- from being pushed beneath it and evaluated against rows it should never see.
--
-- `booking_totals` needs no change: it is security_invoker, so with no
-- bookings policy a companion gets nothing from it either.

drop policy if exists "companions read their booking" on public.bookings;

create view public.companion_stays
with (security_barrier = true)
as
select
  b.id,
  b.reference,
  -- An opaque id, needed to file a request against the holder. The customers
  -- table stays closed to companions, so it resolves to nothing they can see.
  b.customer_id,
  b.villa_id,
  b.booking_mode,
  b.check_in,
  b.check_out,
  b.check_in_time,
  b.check_out_time,
  b.adults,
  b.children,
  b.status,
  b.created_at
from public.bookings b
where public.is_active_companion(b.id);

comment on view public.companion_stays is
  'A companion''s window onto their booking: dates, villa, party size, status. No money, no notes, no customer details.';

revoke all on public.companion_stays from public, anon;
grant select on public.companion_stays to authenticated;

-- ------------------------------------------- the policies that looked it up --
--
-- Two companion policies found the booking holder with a subquery on
-- `bookings`. Inside a policy that subquery runs as the caller — so with the
-- read policy gone it would return nothing, and every companion request would
-- be refused with no hint why. The lookup moves into a definer function that
-- answers one question and exposes nothing else.

create or replace function public.companion_booking_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.customer_id
  from public.bookings b
  where b.id = public.companion_booking_id();
$$;

revoke all on function public.companion_booking_customer_id from public, anon;
grant execute on function public.companion_booking_customer_id to authenticated;

drop policy if exists "companions raise their own requests" on public.guest_requests;
create policy "companions raise their own requests" on public.guest_requests
  for insert to authenticated
  with check (
    companion_id = public.current_companion_id()
    and booking_id = public.companion_booking_id()
    and customer_id = public.companion_booking_customer_id()
    and priority in ('low', 'normal')
    and status = 'pending'
    and assigned_to is null
  );

drop policy if exists "companions leave feedback" on public.feedback;
create policy "companions leave feedback" on public.feedback
  for insert to authenticated
  with check (
    companion_id = public.current_companion_id()
    and booking_id = public.companion_booking_id()
    and customer_id = public.companion_booking_customer_id()
  );
