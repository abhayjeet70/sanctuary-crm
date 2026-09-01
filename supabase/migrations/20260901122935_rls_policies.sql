-- Row Level Security.
--
-- This is the authorization boundary. The RequireRole guard in the React router
-- is a routing convenience and is never trusted.
--
-- Two rules run through everything below:
--   1. Deny by default — RLS on for every table, no policy means no access.
--   2. A client never writes a column that represents a decision the business
--      makes. Verification, status and assignment go through the RPCs in
--      20260901122940, which run as definer.

alter table public.profiles        enable row level security;
alter table public.villas          enable row level security;
alter table public.rooms           enable row level security;
alter table public.customers       enable row level security;
alter table public.bookings        enable row level security;
alter table public.booking_rooms   enable row level security;
alter table public.payments        enable row level security;
alter table public.invoices        enable row level security;
alter table public.menu_items      enable row level security;
alter table public.food_orders     enable row level security;
alter table public.food_order_lines enable row level security;
alter table public.guest_requests  enable row level security;
alter table public.feedback        enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications   enable row level security;

-- ---------------------------------------------------------------- profiles --
create policy "own profile readable" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

create policy "admins manage profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------- villas, rooms, menu --
-- Readable by anyone: the public marketing site reads the same rows.
create policy "villas are public" on public.villas
  for select to anon, authenticated using (true);
create policy "admins write villas" on public.villas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "rooms are public" on public.rooms
  for select to anon, authenticated using (true);
create policy "admins write rooms" on public.rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "menu is public" on public.menu_items
  for select to anon, authenticated using (true);
create policy "admins write menu" on public.menu_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --------------------------------------------------------------- customers --
create policy "guests read own customer row" on public.customers
  for select to authenticated
  using (id = public.current_customer_id() or public.is_admin());

create policy "guests update own contact details" on public.customers
  for update to authenticated
  using (id = public.current_customer_id())
  with check (id = public.current_customer_id());

create policy "admins manage customers" on public.customers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- bookings --
create policy "guests read own bookings" on public.bookings
  for select to authenticated
  using (customer_id = public.current_customer_id() or public.is_admin());

-- Deliberately no guest INSERT/UPDATE/DELETE. Every booking write is an RPC, so
-- a guest can never move their own stay to `confirmed` or edit the rate.
create policy "admins manage bookings" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own booking rooms" on public.booking_rooms
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id = booking_rooms.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );
create policy "admins manage booking rooms" on public.booking_rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- payments --
create policy "guests read own payments" on public.payments
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );

-- A guest may submit a receipt against their own booking, and only ever as
-- `uploaded`. This WITH CHECK is the most important clause in the schema:
-- without the status pin, a guest could insert their own `approved` payment.
create policy "guests upload own receipts" on public.payments
  for insert to authenticated
  with check (
    status = 'uploaded'
    and verified_by is null
    and verified_at is null
    and rejection_reason is null
    and exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );

-- No guest UPDATE at all. Approving and rejecting are RPCs.
create policy "admins manage payments" on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- invoices --
create policy "guests read own invoices" on public.invoices
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id = invoices.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );
create policy "admins manage invoices" on public.invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------- food orders --
create policy "guests read own orders" on public.food_orders
  for select to authenticated
  using (customer_id = public.current_customer_id() or public.is_admin());

create policy "guests place own orders" on public.food_orders
  for insert to authenticated
  with check (
    status = 'placed'
    and customer_id = public.current_customer_id()
    and exists (
      select 1 from public.bookings b
      where b.id = food_orders.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );

-- A guest may cancel, but only while nothing has been cooked yet.
create policy "guests cancel their own untouched orders" on public.food_orders
  for update to authenticated
  using (customer_id = public.current_customer_id() and status = 'placed')
  with check (customer_id = public.current_customer_id() and status = 'cancelled');

create policy "admins manage food orders" on public.food_orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own order lines" on public.food_order_lines
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.food_orders o
      where o.id = food_order_lines.order_id
        and o.customer_id = public.current_customer_id()
    )
  );
create policy "guests write own order lines" on public.food_order_lines
  for insert to authenticated
  with check (
    exists (
      select 1 from public.food_orders o
      where o.id = food_order_lines.order_id
        and o.customer_id = public.current_customer_id()
    )
  );
create policy "admins manage order lines" on public.food_order_lines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- requests --
create policy "guests read own requests" on public.guest_requests
  for select to authenticated
  using (customer_id = public.current_customer_id() or public.is_admin());

-- Priority, status and assignment are the property's call, so a guest may only
-- open a request at the default priority and pending status.
create policy "guests raise own requests" on public.guest_requests
  for insert to authenticated
  with check (
    status = 'pending'
    and assigned_to is null
    and priority in ('low', 'normal')
    and customer_id = public.current_customer_id()
    and exists (
      select 1 from public.bookings b
      where b.id = guest_requests.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );

create policy "admins manage requests" on public.guest_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- feedback --
create policy "guests read own feedback" on public.feedback
  for select to authenticated
  using (customer_id = public.current_customer_id() or public.is_admin());

create policy "guests leave own feedback" on public.feedback
  for insert to authenticated
  with check (
    reviewed = false
    and reply is null
    and customer_id = public.current_customer_id()
    and exists (
      select 1 from public.bookings b
      where b.id = feedback.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );

create policy "admins manage feedback" on public.feedback
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------ activity & notifications --
-- Guests see the timeline of their own bookings only; everything is written by
-- triggers and definer functions, never by a client.
create policy "read activity for own records" on public.activity_events
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id = activity_events.entity_id
        and b.customer_id = public.current_customer_id()
    )
  );

create policy "admins read notifications" on public.notifications
  for select to authenticated using (public.is_admin());
create policy "admins update notifications" on public.notifications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The totals view must not leak past the bookings policy.
alter view public.booking_totals set (security_invoker = on);

grant select on public.booking_totals to anon, authenticated;
