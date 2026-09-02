-- Room guard checks. Paste into the Supabase SQL editor and run.
--
-- Everything happens inside a transaction that ends in ROLLBACK, so it can be
-- run against the live database without touching the property's data. It
-- builds its own villa, rooms, guest and booking, and reports four outcomes:
--
--   bedrooms after adding 2 rooms   2 (expected 2)
--   delete free room                allowed, bedrooms now 1 (expected 1)
--   delete held room                refused: That room is held by 1 booking(s)...
--   delete last room                refused: A villa must keep at least one room.
--
-- Anything reading "ALLOWED — the guard did not fire" or "UNEXPECTED FAILURE"
-- means a guard in 20260902140000_room_management_guards.sql has regressed.

-- Exercises the room guards end to end on a throwaway villa, then rolls the
-- whole thing back so the property's own data is never touched.
begin;

create temp table res (step text, outcome text) on commit drop;

do $$
declare v uuid; r1 uuid; r2 uuid; n int;
begin
  insert into public.villas (slug, name, bedrooms, capacity, base_rate)
    values ('zz-guard-test', 'ZZ Guard Test', 1, 2, 0) returning id into v;

  insert into public.rooms (villa_id, name, capacity, base_rate)
    values (v, 'R1', 2, 1000) returning id into r1;
  insert into public.rooms (villa_id, name, capacity, base_rate)
    values (v, 'R2', 2, 1000) returning id into r2;

  select bedrooms into n from public.villas where id = v;
  insert into res values ('bedrooms after adding 2 rooms', n::text || ' (expected 2)');

  -- The branch that was untested: deleting a room nothing holds.
  delete from public.rooms where id = r2;
  select bedrooms into n from public.villas where id = v;
  insert into res values ('delete free room', 'allowed, bedrooms now ' || n || ' (expected 1)');
exception when others then
  insert into res values ('delete free room', 'UNEXPECTED FAILURE: ' || sqlerrm);
end $$;

do $$
declare v uuid; r1 uuid;
begin
  select id into v from public.villas where slug = 'zz-guard-test';
  select id into r1 from public.rooms where villa_id = v limit 1;
  delete from public.rooms where id = r1;
  insert into res values ('delete last room', 'ALLOWED — the guard did not fire');
exception when others then
  insert into res values ('delete last room', 'refused: ' || sqlerrm);
end $$;

-- And the held-room branch, against a booking made here rather than a real one.
do $$
declare v uuid; r1 uuid; c uuid; b uuid;
begin
  select id into v from public.villas where slug = 'zz-guard-test';
  select id into r1 from public.rooms where villa_id = v limit 1;

  insert into public.customers (name, phone, email)
    values ('ZZ Test Guest', '+910000000000', 'zz-guard-test@example.invalid') returning id into c;
  insert into public.bookings
    (reference, customer_id, villa_id, booking_mode, source, status, payment_status,
     check_in, check_out, adults, nightly_rate, nights)
    values ('ZZ-GUARD-1', c, v, 'split', 'phone', 'confirmed', 'pending',
            current_date + 5, current_date + 7, 2, 1000, 2) returning id into b;
  perform public.sync_booking_rooms(b, array[r1]);

  delete from public.rooms where id = r1;
  insert into res values ('delete held room', 'ALLOWED — the guard did not fire');
exception when others then
  insert into res values ('delete held room', 'refused: ' || sqlerrm);
end $$;

select * from res order by step;

rollback;
