-- Checks for the people on somebody else's booking.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/booking_companions.sql
--
-- One transaction, rolled back. Every check asserts WHY something was refused
-- where that matters — a refusal for the wrong reason proves nothing.

begin;

do $$
declare
  v_holder_user uuid;
  v_holder      uuid;
  v_stranger    uuid;
  v_villa       uuid;
  v_booking     uuid;
  v_other_bkg   uuid;
  v_first       record;
  v_second      record;
  v_companion   uuid;
  v_comp_user   uuid;
  v_count       int;
  v_message     text;
  v_live        boolean;
begin
  -- ------------------------------------------------------------- fixtures
  select p.id, p.customer_id into v_holder_user, v_holder
  from public.profiles p where p.role = 'guest' and p.customer_id is not null limit 1;

  select id into v_villa from public.villas where status = 'active' order by name limit 1;

  insert into public.customers (name, phone, email)
  values ('Stranger Check', '+910000000009', 'stranger@example.test')
  returning id into v_stranger;

  -- Far enough out that no real hold is in the way, near enough that the
  -- stay has not ended — so access is live.
  insert into public.bookings (
    reference, customer_id, villa_id, booking_mode, check_in, check_out,
    adults, children, source, status, payment_status, nightly_rate, nights, tax_rate
  ) values (
    'HOS-T9001', v_holder, v_villa, 'whole', current_date + 400, current_date + 402,
    3, 1, 'website', 'confirmed', 'pending', 10000, 2, 0.18
  ) returning id into v_booking;

  insert into public.bookings (
    reference, customer_id, villa_id, booking_mode, check_in, check_out,
    adults, children, source, status, payment_status, nightly_rate, nights, tax_rate
  ) values (
    'HOS-T9002', v_stranger, v_villa, 'whole', current_date + 410, current_date + 412,
    2, 0, 'website', 'confirmed', 'pending', 10000, 2, 0.18
  ) returning id into v_other_bkg;

  insert into public.payments (booking_id, amount, method, reference, status)
  values (v_booking, 5000, 'upi', 'UTR-CHECK', 'uploaded');

  -- ---------------------------------------------- as the booking holder --
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder_user, 'role', 'authenticated')::text, true);

  select * into v_first from public.add_companion(
    v_booking, 'Rahul Check', '+919800000001', '', 'friend', false);
  raise notice '%  1. the booking holder adds a companion (%)',
    case when v_first.guest_code like 'HOS-G%' and length(v_first.temporary_password) = 10
         then 'ok  ' else 'FAIL' end, v_first.guest_code;

  select count(*) into v_count
  from public.booking_companions where booking_id = v_booking;
  raise notice '%  18. the holder can see the people on their booking',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  -- The booking sold 3 adults. The holder is one, Rahul another: one left.
  select * into v_second from public.add_companion(
    v_booking, 'Ananya Check', '', '', 'family', false);

  v_message := null;
  begin
    perform public.add_companion(v_booking, 'One Too Many', '', '', 'friend', false);
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  capacity is enforced by the database (%)',
    case when v_message like 'This booking covers 3 adults%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'no error raised');

  -- The child place is separate from the adult places.
  perform public.add_companion(v_booking, 'Aarav Check', '', '', 'child', true);
  raise notice 'ok    children count against the children the booking sold';

  -- The password is nowhere but the bcrypt column.
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'booking_companions'
    and column_name ilike '%password%';
  raise notice '%  no plaintext password column exists',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  -- ------------------------------------------------ as the companion ----
  select profile_id, id into v_comp_user, v_companion
  from public.booking_companions where guest_code = v_first.guest_code;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_comp_user, 'role', 'authenticated')::text, true);

  -- The stay, through the narrow view — never the bookings row itself, which
  -- carries the rate, the discount, the amount paid and the internal notes.
  select count(*) into v_count from public.companion_stays;
  raise notice '%  4. a companion sees their stay and only their stay (%)',
    case when v_count = 1 then 'ok  ' else 'FAIL' end, v_count;

  select count(*) into v_count from public.companion_stays where id = v_other_bkg;
  raise notice '%  9. asking for another booking by id returns nothing',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.bookings;
  raise notice '%  the bookings table itself is closed to a companion (%)',
    case when v_count = 0 then 'ok  ' else 'FAIL' end, v_count;

  select count(*) into v_count from public.booking_totals;
  raise notice '%  the money view gives a companion nothing (%)',
    case when v_count = 0 then 'ok  ' else 'FAIL' end, v_count;

  -- Checked by column, not by row: a row count cannot tell you what is in it,
  -- which is how the first version of this leaked the price.
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'companion_stays'
    and column_name in ('nightly_rate', 'discount', 'amount_paid', 'payment_status',
                        'internal_notes', 'food', 'add_ons', 'tax_rate');
  raise notice '%  the stay view carries no money and no internal notes',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.payments;
  raise notice '%  11. a companion sees no payments at all',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.invoices;
  raise notice '%  11. a companion sees no invoices',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.customers;
  raise notice '%  a companion sees no customer records',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count from public.booking_companions;
  raise notice '%  a companion sees themselves, not the other companions',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  -- 10. No UPDATE policy reaches them: zero rows, silently.
  update public.bookings set adults = 20 where id = v_booking;
  get diagnostics v_count = row_count;
  raise notice '%  10. a companion cannot change the booking',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  v_message := null;
  begin
    perform public.add_companion(v_booking, 'Sneaky Friend', '', '', 'friend', false);
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  12. a companion cannot add another companion (%)',
    case when v_message = 'Only the booking holder can add a guest' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'no error raised');

  v_message := null;
  begin
    perform public.revoke_companion(v_second.companion_id);
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a companion cannot revoke another guest (%)',
    case when v_message = 'Only the booking holder can revoke a guest' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'no error raised');

  -- 7/8. A request carries who asked, and is filed against the holder.
  insert into public.guest_requests (
    reference, booking_id, customer_id, villa_id, category, description,
    priority, status, companion_id
  ) values (
    'REQ-T9001', v_booking, v_holder, v_villa, 'extra_towels', 'Two more towels',
    'normal', 'pending', v_companion
  );
  select count(*) into v_count
  from public.guest_requests where reference = 'REQ-T9001' and companion_id = v_companion;
  raise notice '%  7/8. a companion raises a request that names them',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  v_message := null;
  begin
    insert into public.guest_requests (
      reference, booking_id, customer_id, villa_id, category, description,
      priority, status, companion_id
    ) values (
      'REQ-T9002', v_other_bkg, v_stranger, v_villa, 'housekeeping', 'Not my villa',
      'normal', 'pending', v_companion
    );
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a companion cannot file a request against another booking',
    case when v_message like '%row-level security%' then 'ok  ' else 'FAIL' end;

  -- 5/6. The order RPC accepts them as the booking's own; the only thing in
  -- the way is the dining window, because this stay is a year out.
  v_message := null;
  begin
    perform public.place_food_order(
      v_booking,
      jsonb_build_array(jsonb_build_object(
        'menu_item_id', (select id from public.menu_items where available limit 1),
        'quantity', 1)),
      null);
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  5. a companion passes the ownership check to order (%)',
    case when v_message like 'The kitchen opens when you arrive%' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'order placed');

  v_message := null;
  begin
    perform public.place_food_order(
      v_other_bkg,
      jsonb_build_array(jsonb_build_object(
        'menu_item_id', (select id from public.menu_items where available limit 1),
        'quantity', 1)),
      null);
  exception when others then v_message := sqlerrm;
  end;
  raise notice '%  a companion cannot order on another booking (%)',
    case when v_message = 'That is not your booking' then 'ok  ' else 'FAIL' end,
    coalesce(v_message, 'order placed');

  -- ------------------------------------------------ revocation and expiry --
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder_user, 'role', 'authenticated')::text, true);

  perform public.revoke_companion(v_companion);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_comp_user, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.companion_stays;
  raise notice '%  13/14. a revoked companion loses the booking at once',
    case when v_count = 0 then 'ok  ' else 'FAIL' end;

  reset role;

  -- 15/16. Expiry is the stay's departure hour, not a status somebody sets.
  -- Move the booking into the past without touching its status.
  update public.bookings
     set check_in = current_date - 5, check_out = current_date - 2
   where id = v_booking;

  select public.companion_access_is_live(v_second.companion_id) into v_live;
  raise notice '%  15. access ends at check-out, though status still says confirmed',
    case when not v_live then 'ok  ' else 'FAIL' end;

  -- 17. History survives both.
  select count(*) into v_count
  from public.guest_requests where companion_id = v_companion;
  raise notice '%  17. a revoked companion''s history stays on the booking',
    case when v_count = 1 then 'ok  ' else 'FAIL' end;

  select count(*) into v_count
  from public.booking_companions where booking_id = v_booking;
  raise notice '%  17. the companion records are kept, not deleted (%)',
    case when v_count = 3 then 'ok  ' else 'FAIL' end, v_count;

  -- Cancellation cuts access the same way, through the existing lifecycle.
  update public.bookings
     set check_in = current_date + 400, check_out = current_date + 402,
         status = 'cancelled'
   where id = v_booking;
  select public.companion_access_is_live(v_second.companion_id) into v_live;
  raise notice '%  cancelling the booking ends every companion''s access',
    case when not v_live then 'ok  ' else 'FAIL' end;
end $$;

rollback;
