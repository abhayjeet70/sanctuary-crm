-- Every mutating RPC, called as the role that calls it in the app.
--
-- Paste into the Supabase SQL editor, or:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rpc_sweep.sql
--
-- Everything runs inside a transaction ending in ROLLBACK, so it is safe
-- against the live database. Any outcome containing "wrong", "FAILED",
-- "NOT " or "ALLOWED" is a regression.

-- Exercises every mutating path the app can call, as the role that calls it.
-- Reading a migration proves nothing; a CASE that resolves to text only fails
-- when it runs. Rolls back.
begin;

create temp table res (step text, outcome text) on commit drop;
grant all on res to authenticated;

do $$
declare
  admin_id uuid; guest_u uuid; guest_c uuid; v uuid; m uuid;
  bk public.bookings%rowtype;
  pay public.payments%rowtype;
  ord public.food_orders%rowtype;
  inv public.invoices%rowtype;
  tmp uuid;
begin
  select id into admin_id from public.profiles where role = 'admin' limit 1;
  select p.id, p.customer_id into guest_u, guest_c
    from public.profiles p join public.customers c on c.id = p.customer_id
    where c.email = 'abhayjeet9988@gmail.com';
  select id into v from public.villas where mode = 'whole' order by name limit 1;
  select id into m from public.menu_items where available limit 1;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- create_booking
  begin
    bk := public.create_booking(guest_c, v, null, current_date, current_date + 3,
                                2, 0, 'phone', 20000, 0, 0.180, 0, null);
    insert into res values ('create_booking', 'ok ' || bk.reference);
  exception when others then
    insert into res values ('create_booking', 'FAILED: ' || sqlerrm);
  end;

  -- update_booking
  begin
    perform public.update_booking(bk.id, bk.villa_id, null, bk.check_in, bk.check_out,
                                  3, 0, 'phone'::public.booking_source, 22000,
                                  0, 0, 0, 0, 0, 0.180, 'a note');
    insert into res values ('update_booking', 'ok');
  exception when others then
    insert into res values ('update_booking', 'FAILED: ' || sqlerrm);
  end;

  -- set_booking_status through the lifecycle
  begin
    perform public.set_booking_status(bk.id, 'confirmed');
    perform public.set_booking_status(bk.id, 'checked_in');
    perform public.set_booking_status(bk.id, 'in_house');
    insert into res values ('set_booking_status', 'ok through in_house');
  exception when others then
    insert into res values ('set_booking_status', 'FAILED: ' || sqlerrm);
  end;

  -- create_invoice on a booking that has none (the trigger already made one,
  -- so this must refuse — that is the correct behaviour, not a failure)
  begin
    inv := public.create_invoice(bk.id);
    insert into res values ('create_invoice on an invoiced booking', 'ALLOWED A SECOND — wrong');
  exception when others then
    insert into res values ('create_invoice on an invoiced booking', 'refused: ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);

  -- A receipt from the guest, then the admin decision on it.
  insert into public.payments (booking_id, amount, method, reference, status)
  values (bk.id, 5000, 'upi', 'ZZTEST123', 'uploaded') returning * into pay;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.approve_payment(pay.id);
    insert into res values ('approve_payment', 'ok');
  exception when others then
    insert into res values ('approve_payment', 'FAILED: ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
  insert into public.payments (booking_id, amount, method, reference, status)
  values (bk.id, 100, 'upi', 'ZZTEST124', 'uploaded') returning * into pay;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.reject_payment(pay.id, 'wrong_amount', 'short by a lot');
    insert into res values ('reject_payment', 'ok');
  exception when others then
    insert into res values ('reject_payment', 'FAILED: ' || sqlerrm);
  end;

  -- The guest ordering during their own stay, then staff moving the ticket.
  perform set_config('role', 'postgres', true);
  insert into res select 'booking status before ordering', b.status::text
    from public.bookings b where b.id = bk.id;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', guest_u, 'role', 'authenticated')::text, true);
  begin
    ord := public.place_food_order(bk.id,
             jsonb_build_array(jsonb_build_object('menu_item_id', m, 'quantity', 2)), 'no chilli');
    insert into res values ('place_food_order', 'ok ' || ord.reference);
  exception when others then
    insert into res values ('place_food_order', 'FAILED: ' || sqlerrm);
  end;

  -- A guest raising a request, on their own booking.
  begin
    insert into public.guest_requests (reference, booking_id, customer_id, villa_id,
                                       category, description, priority, status)
    values ('ZZ-REQ-1', bk.id, guest_c, v, 'housekeeping', 'extra towels', 'normal', 'pending');
    insert into res values ('guest raises a request', 'ok');
  exception when others then
    insert into res values ('guest raises a request', 'FAILED: ' || sqlerrm);
  end;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  begin
    perform public.set_food_order_status(ord.id, 'confirmed');
    perform public.set_food_order_status(ord.id, 'cooking');
    perform public.set_food_order_status(ord.id, 'billed');
    insert into res values ('set_food_order_status', 'ok through billed');
  exception when others then
    insert into res values ('set_food_order_status', 'FAILED: ' || sqlerrm);
  end;

  -- Billing food must reach the booking's money (BR12).
  perform set_config('role', 'postgres', true);
  insert into res
  select 'food billed onto the booking',
         case when b.food > 0 then 'yes, ' || b.food else 'NOT ADDED — food is still 0' end
  from public.bookings b where b.id = bk.id;
end $$;

select * from res order by step;

rollback;
