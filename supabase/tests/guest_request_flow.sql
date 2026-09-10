-- A guest raising a request, as the portal does it.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/guest_request_flow.sql
--
-- Rolls back, so it is safe against the live database. Any outcome containing
-- "REFUSED", "ALLOWED", "wrong" or "NOT " is a regression.
--
-- This exists because a BEFORE INSERT trigger and an insert policy contradicted
-- each other for two days: the policy required assigned_to to be null, the
-- trigger filled it in first, and WITH CHECK judged the row the trigger left.
-- Neither piece is wrong on its own, which is why only running it finds it.
begin;

create temp table res (step text, outcome text) on commit drop;
grant all on res to authenticated;

do $$
declare
  guest_u uuid; b uuid; c uuid; v uuid; got public.team;
begin
  select p.id, p.customer_id into guest_u, c
  from public.profiles p
  join public.customers cu on cu.id = p.customer_id
  where cu.email = 'user@gmail.com';

  select id, villa_id into b, v from public.bookings where customer_id = c limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', guest_u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- The thing that was broken: an ordinary request from the portal.
  begin
    insert into public.guest_requests
      (reference, booking_id, customer_id, villa_id, category, description,
       priority, status)
    values ('ZZ-FLOW-1', b, c, v, 'extra_towels', 'Two extra bath towels',
            'normal', 'pending');
    insert into res values ('guest raises a request', 'allowed (correct)');
  exception when others then
    insert into res values ('guest raises a request', 'REFUSED: ' || sqlerrm);
  end;

  -- Routed by the trigger, after the check rather than before it.
  select assigned_to into got from public.guest_requests where reference = 'ZZ-FLOW-1';
  insert into res values ('routed to a team',
    coalesce(got::text, 'NOT ROUTED — still null'));

  -- The guard the policy exists for must still hold.
  begin
    insert into public.guest_requests
      (reference, booking_id, customer_id, villa_id, category, description,
       priority, status, assigned_to)
    values ('ZZ-FLOW-2', b, c, v, 'extra_towels', 'jump the queue',
            'normal', 'pending', 'maintenance');
    insert into res values ('guest picks their own team', 'ALLOWED — the guard is gone');
  exception when others then
    insert into res values ('guest picks their own team', 'refused (correct)');
  end;

  begin
    insert into public.guest_requests
      (reference, booking_id, customer_id, villa_id, category, description,
       priority, status)
    values ('ZZ-FLOW-3', b, c, v, 'wifi', 'urgent please', 'urgent', 'pending');
    insert into res values ('guest sets urgent priority', 'ALLOWED — the guard is gone');
  exception when others then
    insert into res values ('guest sets urgent priority', 'refused (correct)');
  end;

  perform set_config('role', 'postgres', true);
end $$;

-- And the category routing, which the desk relies on.
do $$
declare b uuid; c uuid; v uuid; got public.team;
begin
  select id, customer_id, villa_id into b, c, v from public.bookings limit 1;

  insert into public.guest_requests (reference, booking_id, customer_id, villa_id,
                                     category, description, priority, status)
  values ('ZZ-FLOW-4', b, c, v, 'food', 'Sandwich', 'normal', 'pending');
  select assigned_to into got from public.guest_requests where reference = 'ZZ-FLOW-4';
  insert into res values ('food routes to', got::text);

  insert into public.guest_requests (reference, booking_id, customer_id, villa_id,
                                     category, description, priority, status)
  values ('ZZ-FLOW-5', b, c, v, 'transport', 'Cab', 'normal', 'pending');
  select assigned_to into got from public.guest_requests where reference = 'ZZ-FLOW-5';
  insert into res values ('transport routes to', got::text);

  -- A team chosen deliberately by the desk must survive the trigger.
  insert into public.guest_requests (reference, booking_id, customer_id, villa_id,
                                     category, description, priority, status, assigned_to)
  values ('ZZ-FLOW-6', b, c, v, 'food', 'Odd one', 'normal', 'pending', 'manager');
  select assigned_to into got from public.guest_requests where reference = 'ZZ-FLOW-6';
  insert into res values ('explicit assignment kept', got::text);
end $$;

select * from res order by step;

rollback;
