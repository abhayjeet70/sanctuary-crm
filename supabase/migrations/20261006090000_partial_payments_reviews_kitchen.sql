-- Full advance by default; part-payment only when the desk agrees.
-- Plus: a Google review link for guests, and the kitchen follows the
-- `kitchen.work` permission (so a Management department can run it), including
-- placing an order by hand for a guest who rang.

-- ------------------------------------------------------- partial payments --

create table if not exists public.partial_payment_requests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  amount_now    int  not null check (amount_now > 0),
  next_due_date date not null,
  note          text not null default '',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at    timestamptz,
  decided_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists partial_payment_requests_booking on public.partial_payment_requests (booking_id);

alter table public.partial_payment_requests enable row level security;

create policy "guest reads own partial requests"
  on public.partial_payment_requests for select to authenticated
  using (customer_id = public.current_customer_id() or public.is_admin());

-- Writes go through the two functions below only.

create or replace function public.request_partial_payment(
  p_booking_id uuid, p_amount_now int, p_next_due date, p_note text
)
returns public.partial_payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_row     public.partial_payment_requests%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found or v_booking.customer_id is distinct from public.current_customer_id() then
    raise exception 'That is not your booking' using errcode = '42501';
  end if;
  if coalesce(p_amount_now, 0) <= 0 then
    raise exception 'Say how much you can pay now' using errcode = '23514';
  end if;
  if p_next_due is null or p_next_due < current_date then
    raise exception 'Choose when you will pay the rest' using errcode = '23514';
  end if;
  if exists (select 1 from public.partial_payment_requests
             where booking_id = p_booking_id and status = 'pending') then
    raise exception 'A request is already waiting for a reply' using errcode = '23505';
  end if;

  insert into public.partial_payment_requests (booking_id, customer_id, amount_now, next_due_date, note)
  values (p_booking_id, v_booking.customer_id, p_amount_now, p_next_due, left(coalesce(p_note, ''), 500))
  returning * into v_row;

  perform public.notify_staff(
    'payment', 'Part-payment requested',
    v_booking.reference || ' - pay ' || p_amount_now || ' now, rest by ' || to_char(p_next_due, 'DD Mon'),
    v_booking.id);
  return v_row;
end;
$$;

revoke all on function public.request_partial_payment(uuid, int, date, text) from public, anon;
grant execute on function public.request_partial_payment(uuid, int, date, text) to authenticated;

create or replace function public.decide_partial_payment(
  p_request_id uuid, p_approve boolean, p_amount_now int default null, p_next_due date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.partial_payment_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only management can decide this' using errcode = '42501';
  end if;
  update public.partial_payment_requests
     set status        = case when p_approve then 'approved' else 'rejected' end,
         amount_now    = coalesce(p_amount_now, amount_now),
         next_due_date = coalesce(p_next_due, next_due_date),
         decided_at    = now(),
         decided_by    = (select full_name from public.profiles where id = auth.uid())
   where id = p_request_id and status = 'pending'
  returning * into v_row;
  if not found then
    raise exception 'That request has already been decided' using errcode = '23514';
  end if;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_row.booking_id, 'payment',
          case when p_approve then 'Part-payment approved' else 'Part-payment declined' end,
          'Pay ' || v_row.amount_now || ' now, rest by ' || to_char(v_row.next_due_date, 'DD Mon'),
          coalesce(v_row.decided_by, 'Management'));
end;
$$;

revoke all on function public.decide_partial_payment(uuid, boolean, int, date) from public, anon;
grant execute on function public.decide_partial_payment(uuid, boolean, int, date) to authenticated;

-- ------------------------------------------------------------ google review --

alter table public.property_settings
  add column if not exists google_review_url text not null default '';

-- --------------------------------------------- kitchen follows the permission --

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
  if not public.is_admin() and not public.has_permission('kitchen.work') then
    raise exception 'Only the kitchen can move an order along' using errcode = '42501';
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

-- An order taken by hand (a call from the villa). Same insert as the guest's,
-- but for staff, and with no dining-window check: the desk decides.
create or replace function public.place_manual_food_order(
  p_booking_id uuid,
  p_lines      jsonb,
  p_notes      text default null
)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_order   public.food_orders%rowtype;
begin
  if not public.is_admin() and not public.has_permission('kitchen.work') then
    raise exception 'Only the kitchen or management can take an order' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'An order needs at least one item' using errcode = '23514';
  end if;

  insert into public.food_orders (reference, booking_id, customer_id, villa_id, room_id, status, notes)
  values (
    'KIT-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'),
    v_booking.id, v_booking.customer_id, v_booking.villa_id,
    (select room_id from public.booking_rooms where booking_id = v_booking.id limit 1),
    'confirmed', left(coalesce(p_notes, ''), 500)
  )
  returning * into v_order;

  insert into public.food_order_lines (order_id, menu_item_id, name, price, quantity)
  select v_order.id, m.id, m.name, m.price, greatest(1, (line ->> 'quantity')::int)
  from jsonb_array_elements(p_lines) as line
  join public.menu_items m on m.id = (line ->> 'menu_item_id')::uuid;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_booking.id, 'food', 'Kitchen order taken by hand', v_order.reference,
          coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff'));
  return v_order;
end;
$$;

revoke all on function public.place_manual_food_order(uuid, jsonb, text) from public, anon;
grant execute on function public.place_manual_food_order(uuid, jsonb, text) to authenticated;
