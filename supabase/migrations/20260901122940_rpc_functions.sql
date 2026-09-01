-- Transactional operations.
--
-- Each of these is several writes that must all land or none of them. Doing
-- them as separate client calls invites a half-applied state — an approved
-- payment with the booking still unconfirmed, say — so they are one function
-- and one transaction each.

-- --------------------------------------------------------- create_booking ---
-- BR5, enforced. The exclusion constraint is the real guard; this function
-- catches the violation and returns something a human can act on.
create or replace function public.create_booking(
  p_customer_id       uuid,
  p_villa_id          uuid,
  p_room_ids          uuid[],
  p_check_in          date,
  p_check_out         date,
  p_adults            int,
  p_children          int,
  p_source            public.booking_source,
  p_nightly_rate      int,
  p_discount          int default 0,
  p_tax_rate          numeric default 0.180,
  p_advance           int default 0,
  p_special_requests  text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode      public.villa_mode;
  v_capacity  int;
  v_nights    int;
  v_booking   public.bookings%rowtype;
  v_conflicts text;
begin
  if not public.is_admin() then
    raise exception 'Only staff can create bookings' using errcode = '42501';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in' using errcode = '22007';
  end if;

  select mode, capacity into v_mode, v_capacity
  from public.villas where id = p_villa_id;
  if v_mode is null then
    raise exception 'Villa not found' using errcode = '23503';
  end if;

  if (p_adults + p_children) > v_capacity then
    raise exception 'That villa sleeps %, and this booking is for %',
      v_capacity, p_adults + p_children using errcode = '23514';
  end if;

  -- Report every clash at once rather than one per attempt.
  select string_agg(
           reference || ' (' || check_in::text || ' to ' || check_out::text || ')', ', ')
    into v_conflicts
  from public.find_booking_conflicts(p_villa_id, p_room_ids, p_check_in, p_check_out, null);

  if v_conflicts is not null then
    raise exception 'Those dates are already held by %', v_conflicts
      using errcode = '23P01';
  end if;

  v_nights := p_check_out - p_check_in;

  insert into public.bookings (
    reference, customer_id, villa_id, booking_mode,
    check_in, check_out, adults, children, source,
    status, payment_status,
    nightly_rate, nights, discount, tax_rate, amount_paid, special_requests
  ) values (
    'HOS-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'),
    p_customer_id, p_villa_id, v_mode,
    p_check_in, p_check_out, p_adults, p_children, p_source,
    case when p_advance > 0 then 'confirmed' else 'pending_payment' end,
    case when p_advance > 0 then 'partial'   else 'pending' end,
    p_nightly_rate, v_nights, p_discount, p_tax_rate, p_advance, p_special_requests
  )
  returning * into v_booking;

  -- Expanding into room holds is what trips the exclusion constraint if two
  -- staff members book the same dates at the same instant.
  perform public.sync_booking_rooms(v_booking.id, p_room_ids);

  return v_booking;
exception
  when exclusion_violation then
    raise exception 'Those dates were taken while you were filling the form — reload and try again'
      using errcode = '23P01';
end;
$$;

-- -------------------------------------------------------- approve_payment ---
-- Four writes in one transaction: the payment, the booking's paid amount, its
-- status, and the activity row.
create or replace function public.approve_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can approve payments' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = '23503';
  end if;
  if v_payment.status = 'approved' then
    raise exception 'That payment has already been approved' using errcode = '23505';
  end if;

  update public.payments
     set status = 'approved',
         verified_by = auth.uid(),
         verified_at = now(),
         rejection_reason = null,
         rejection_note = null
   where id = p_payment_id
  returning * into v_payment;

  update public.bookings
     set amount_paid = amount_paid + v_payment.amount,
         -- Approving money never drags a stay that has already started back to
         -- "confirmed".
         status = case
           when status in ('pending_payment', 'payment_uploaded', 'inquiry')
             then 'confirmed'::public.booking_status
           else status
         end
   where id = v_payment.booking_id
  returning * into v_booking;

  perform public.recalculate_payment_status(v_payment.booking_id);

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_payment.booking_id, 'payment', 'Payment approved',
          v_payment.reference, coalesce(auth.email(), 'Staff'));

  return v_payment;
end;
$$;

-- --------------------------------------------------------- reject_payment ---
-- BR8: rejecting returns the booking to pending_payment so the guest is asked
-- again, and BR7: the reason is not optional.
create or replace function public.reject_payment(
  p_payment_id uuid,
  p_reason     public.payment_rejection_reason,
  p_note       text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can reject payments' using errcode = '42501';
  end if;

  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Choosing "other" requires a note explaining what was wrong'
      using errcode = '23514';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = '23503';
  end if;
  if v_payment.status = 'approved' then
    raise exception 'That payment was already approved — refund it instead'
      using errcode = '23505';
  end if;

  update public.payments
     set status = 'rejected',
         rejection_reason = p_reason,
         rejection_note = p_note,
         verified_by = auth.uid(),
         verified_at = now()
   where id = p_payment_id
  returning * into v_payment;

  update public.bookings
     set status = 'pending_payment', payment_status = 'rejected'
   where id = v_payment.booking_id;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_payment.booking_id, 'payment', 'Payment rejected',
          coalesce(p_note, replace(p_reason::text, '_', ' ')),
          coalesce(auth.email(), 'Staff'));

  return v_payment;
end;
$$;

-- ----------------------------------------------------- place_food_order -----
-- The order and its lines have to arrive together, or the kitchen sees an
-- empty ticket.
create or replace function public.place_food_order(
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
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;

  if not public.is_admin() and v_booking.customer_id is distinct from public.current_customer_id() then
    raise exception 'That is not your booking' using errcode = '42501';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one item' using errcode = '23514';
  end if;

  insert into public.food_orders (reference, booking_id, customer_id, villa_id, room_id, status, notes)
  values (
    'KIT-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'),
    v_booking.id, v_booking.customer_id, v_booking.villa_id,
    (select room_id from public.booking_rooms where booking_id = v_booking.id limit 1),
    'placed', p_notes
  )
  returning * into v_order;

  insert into public.food_order_lines (order_id, menu_item_id, name, price, quantity)
  select
    v_order.id,
    (line ->> 'menu_item_id')::uuid,
    m.name,
    m.price,                                  -- priced from the menu, never the client
    greatest(1, (line ->> 'quantity')::int)
  from jsonb_array_elements(p_lines) as line
  join public.menu_items m on m.id = (line ->> 'menu_item_id')::uuid
  where m.available;

  if (select count(*) from public.food_order_lines where order_id = v_order.id) = 0 then
    raise exception 'None of those items are available today' using errcode = '23514';
  end if;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_booking.id, 'food', 'Kitchen order placed', v_order.reference, 'Guest');

  return v_order;
end;
$$;

-- ----------------------------------------------- set_food_order_status ------
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
  if not public.is_admin() then
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

-- ------------------------------------------------------ booking lifecycle ---
create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status     public.booking_status
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can change a booking status' using errcode = '42501';
  end if;

  update public.bookings set status = p_status where id = p_booking_id
  returning * into v_booking;

  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------- grants ----
revoke all on function public.create_booking          from public, anon;
revoke all on function public.approve_payment         from public, anon;
revoke all on function public.reject_payment          from public, anon;
revoke all on function public.set_food_order_status   from public, anon;
revoke all on function public.set_booking_status      from public, anon;
revoke all on function public.sync_booking_rooms      from public, anon;
revoke all on function public.recalculate_payment_status from public, anon;

grant execute on function public.create_booking        to authenticated;
grant execute on function public.approve_payment       to authenticated;
grant execute on function public.reject_payment        to authenticated;
grant execute on function public.place_food_order      to authenticated;
grant execute on function public.set_food_order_status to authenticated;
grant execute on function public.set_booking_status    to authenticated;
grant execute on function public.find_booking_conflicts to authenticated;
