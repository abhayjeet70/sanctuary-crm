-- L7 — staff accounts.
--
-- Until now `assigned_to` was a label: a request could say "housekeeping" but
-- nobody could log in as housekeeping. This makes a team a thing a person
-- belongs to, so the housekeeper opens the app and sees their own queue.
--
-- Deliberately NOT a full permission system. Staff get exactly two powers:
-- read the requests and orders for their team, and move those along. Money,
-- bookings and guest records stay admin-only.

alter type public.app_role add value if not exists 'staff';

-- The enum value must be committed before it can be used in a policy below.
commit;

alter table public.profiles
  add column if not exists team public.team;

comment on column public.profiles.team is
  'Set for role = staff. Which queue this person sees. Null for admin and guest.';

create or replace function public.current_team()
returns public.team
language sql
stable
security definer
set search_path = public
as $$
  select team from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('staff', 'admin')
  );
$$;

revoke all on function public.current_team() from public, anon;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.current_team() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- ------------------------------------------------------------- requests ----
create policy "staff read their team's requests" on public.guest_requests
  for select to authenticated
  using (public.current_team() is not null and assigned_to = public.current_team());

-- Staff may move a request along but not reassign it to another team, and not
-- hand it to nobody. Reassignment stays a manager's call.
create policy "staff advance their team's requests" on public.guest_requests
  for update to authenticated
  using (public.current_team() is not null and assigned_to = public.current_team())
  with check (assigned_to = public.current_team());

-- ---------------------------------------------------------- food orders ----
create policy "kitchen reads orders" on public.food_orders
  for select to authenticated
  using (public.current_team() = 'kitchen');

create policy "kitchen moves orders" on public.food_orders
  for update to authenticated
  using (public.current_team() = 'kitchen')
  with check (public.current_team() = 'kitchen');

create policy "kitchen reads order lines" on public.food_order_lines
  for select to authenticated
  using (public.current_team() = 'kitchen');

-- Staff need the villa and guest name behind a ticket to act on it, but not
-- the money — so bookings stay closed and only the narrow view below opens.
create or replace view public.request_context as
select
  q.id            as request_id,
  q.reference,
  q.villa_id,
  v.name          as villa_name,
  c.name          as guest_name,
  b.check_out     as guest_leaves
from public.guest_requests q
join public.villas v    on v.id = q.villa_id
join public.customers c on c.id = q.customer_id
join public.bookings b  on b.id = q.booking_id;

alter view public.request_context set (security_invoker = on);
grant select on public.request_context to authenticated;

-- `set_food_order_status` and the request update path both check is_admin();
-- widen them to staff on their own queue.
create or replace function public.set_food_order_status(
  p_order_id uuid,
  p_status   public.food_order_status
)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.food_orders%rowtype;
begin
  if not public.is_admin() and public.current_team() is distinct from 'kitchen' then
    raise exception 'Only staff can move an order along' using errcode = '42501';
  end if;

  update public.food_orders set status = p_status where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Order not found' using errcode = '23503';
  end if;
  return v_order;
end;
$$;

grant execute on function public.set_food_order_status to authenticated;
