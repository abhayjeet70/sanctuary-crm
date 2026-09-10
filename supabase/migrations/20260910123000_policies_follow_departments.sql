-- The five policies that compared against the `team` enum now read the
-- department and the permissions the owner granted it.
--
-- Written so the starting position is identical to before: the seed in the
-- previous migration gave each department exactly what its old policy allowed.
-- What changes is that it can now be changed.

-- ------------------------------------------------------------- requests --

drop policy if exists "staff read their team's requests" on public.guest_requests;
create policy "staff read requests they may" on public.guest_requests
  for select to authenticated
  using (
    public.has_permission('requests.all')
    or (
      public.has_permission('requests.work')
      and department_id is not null
      and department_id = public.current_department()
    )
  );

drop policy if exists "staff advance their team's requests" on public.guest_requests;
create policy "staff work requests they may" on public.guest_requests
  for update to authenticated
  using (
    public.has_permission('requests.all')
    or (
      public.has_permission('requests.work')
      and department_id is not null
      and department_id = public.current_department()
    )
  )
  with check (
    public.has_permission('requests.all')
    or (
      public.has_permission('requests.work')
      and department_id = public.current_department()
    )
  );

-- --------------------------------------------------------------- kitchen --

drop policy if exists "kitchen reads orders" on public.food_orders;
create policy "kitchen reads orders" on public.food_orders
  for select to authenticated using (public.has_permission('kitchen.work'));

drop policy if exists "kitchen moves orders" on public.food_orders;
create policy "kitchen moves orders" on public.food_orders
  for update to authenticated
  using (public.has_permission('kitchen.work'))
  with check (public.has_permission('kitchen.work'));

drop policy if exists "kitchen reads order lines" on public.food_order_lines;
create policy "kitchen reads order lines" on public.food_order_lines
  for select to authenticated using (public.has_permission('kitchen.work'));

-- ------------------------------------------------ two the owner can grant --
--
-- Neither existed before: staff had no way to see a booking or a guest record
-- at all. Both are off unless the owner switches them on for a department,
-- and both are read-only — nothing here lets a department change a booking.

create policy "staff view bookings when permitted" on public.bookings
  for select to authenticated using (public.has_permission('bookings.view'));

create policy "staff view guests when permitted" on public.customers
  for select to authenticated using (public.has_permission('guests.view'));

-- Bookings carry no use without the villa and the room; both are already
-- readable to anyone signed in, so nothing further is needed there.

-- ------------------------------------------------------------- routing --
--
-- The router wrote the enum. It writes the department now, and keeps the enum
-- column filled where a matching value still exists so old rows stay legible.

create or replace function public.route_request_to_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_dept uuid;
begin
  if new.department_id is not null then return null; end if;

  v_slug := case new.category
    when 'housekeeping' then 'housekeeping'
    when 'extra_towels' then 'housekeeping'
    when 'room_setup'   then 'housekeeping'
    when 'food'         then 'kitchen'
    when 'maintenance'  then 'maintenance'
    when 'wifi'         then 'maintenance'
    -- Transport and anything unclassified is the desk's to place.
    else 'manager'
  end;

  select id into v_dept from public.departments where slug = v_slug and active;

  -- A property that renamed or retired that department still needs the
  -- request to land somewhere, so fall back to whatever is left.
  if v_dept is null then
    select id into v_dept from public.departments where active order by sort_order limit 1;
  end if;

  update public.guest_requests
     set department_id = v_dept,
         assigned_to = case
           when v_slug in ('housekeeping', 'kitchen', 'maintenance', 'manager')
             then v_slug::public.team
           else assigned_to
         end
   where id = new.id;

  return null;
end;
$$;
