-- The dining window, enforced where orders are actually placed.
--
-- The previous migration put the rule in the food_orders insert policy. That
-- was not enough: place_food_order is `security definer`, so it bypasses RLS
-- and every guest order goes through it. The policy would only have caught a
-- direct insert that nothing in the app performs.
--
-- Staff are deliberately exempt. Reception adding a charge after check-out is
-- a real thing that happens; a guest ordering dinner for a stay that ended in
-- July is not.

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

  if not public.is_admin() and not public.can_order_food(p_booking_id) then
    if current_date < v_booking.check_in then
      raise exception 'The kitchen opens when you arrive on %.',
        to_char(v_booking.check_in, 'DD Mon') using errcode = '23514';
    elsif current_date > v_booking.check_out then
      raise exception 'This stay ended on %. Get in touch if you need anything.',
        to_char(v_booking.check_out, 'DD Mon') using errcode = '23514';
    else
      raise exception 'The kitchen opens once your booking is confirmed.'
        using errcode = '23514';
    end if;
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

  if not exists (select 1 from public.food_order_lines where order_id = v_order.id) then
    raise exception 'None of those items are available today' using errcode = '23514';
  end if;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_booking.id, 'food', 'Kitchen order placed', v_order.reference, 'Guest');

  return v_order;
end;
$$;

revoke all on function public.place_food_order from public, anon;
grant execute on function public.place_food_order to authenticated;
