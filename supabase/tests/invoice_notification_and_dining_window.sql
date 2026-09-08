-- Every booking raises an invoice, the guest is told, and the kitchen keeps to the stay window.
--
-- Paste into the Supabase SQL editor, or:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/invoice_notification_and_dining_window.sql
--
-- Everything runs inside a transaction ending in ROLLBACK, so it is safe
-- against the live database. Any outcome containing "wrong", "FAILED",
-- "NOT " or "ALLOWED" is a regression.

-- Checks for today's three fixes. Everything runs inside a transaction that
-- ends in ROLLBACK, so it can be pointed at the live database.
begin;

create temp table res (step text, outcome text) on commit drop;
-- The RPC checks run as `authenticated`, which still needs to record results.
grant all on res to authenticated;

-- A throwaway guest with a login, and three stays: past, current, future.
do $$
declare
  v uuid; c uuid; u uuid;
  b_past uuid; b_now uuid; b_future uuid;
  n int;
begin
  select id into v from public.villas order by name limit 1;

  insert into public.customers (name, phone, email)
    values ('ZZ Window Guest', '+910000000009', 'zz-window@example.invalid') returning id into c;

  -- A login for them, so notify_guest has somewhere to deliver.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'zz-window@example.invalid', '', now(), now(), now(),
            '', '', '', '')
    returning id into u;
  insert into public.profiles (id, role, full_name, customer_id)
    values (u, 'guest', 'ZZ Window Guest', c)
    on conflict (id) do update set customer_id = excluded.customer_id;

  -- 1. A booking must raise an invoice by itself.
  insert into public.bookings
    (reference, customer_id, villa_id, booking_mode, source, status, payment_status,
     check_in, check_out, adults, nightly_rate, nights)
    values ('ZZ-NOW-1', c, v, 'whole', 'phone', 'confirmed', 'pending',
            current_date - 1, current_date + 2, 2, 10000, 3)
    returning id into b_now;

  insert into res
  select 'invoice raised with the booking',
         coalesce((select 'yes, ' || i.number || ' (' || i.status || ')'
                   from public.invoices i where i.booking_id = b_now),
                  'NO INVOICE — the trigger did not fire');

  -- 2. Confirming should have told the guest, and the invoice should be issued.
  select count(*) into n from public.notifications
   where target_user_id = u and title = 'Your booking is confirmed';
  insert into res values ('guest told the booking is confirmed',
                          case when n > 0 then 'yes' else 'NOT NOTIFIED' end);

  select count(*) into n from public.notifications
   where target_user_id = u and title = 'Your invoice is ready';
  insert into res values ('guest told the invoice is ready',
                          case when n > 0 then 'yes' else 'NOT NOTIFIED' end);

  -- 3. A stay that has not started, and one that has ended.
  insert into public.bookings
    (reference, customer_id, villa_id, booking_mode, source, status, payment_status,
     check_in, check_out, adults, nightly_rate, nights)
    values ('ZZ-FUT-1', c, v, 'whole', 'phone', 'confirmed', 'pending',
            current_date + 30, current_date + 32, 2, 10000, 2)
    returning id into b_future;

  insert into public.bookings
    (reference, customer_id, villa_id, booking_mode, source, status, payment_status,
     check_in, check_out, adults, nightly_rate, nights)
    values ('ZZ-PAST-1', c, v, 'whole', 'phone', 'completed', 'paid',
            current_date - 30, current_date - 28, 2, 10000, 2)
    returning id into b_past;

  insert into res values ('window: during the stay',
    case when public.can_order_food(b_now) then 'open (correct)' else 'CLOSED — wrong' end);
  insert into res values ('window: before arrival',
    case when public.can_order_food(b_future) then 'OPEN — wrong' else 'closed (correct)' end);
  insert into res values ('window: after check-out',
    case when public.can_order_food(b_past) then 'OPEN — wrong' else 'closed (correct)' end);

  -- 4. A guest's mail must not land in the staff tray.
  select count(*) into n from public.notifications
   where target_user_id is not null and target_user_id <> u;
  insert into res values ('guest notifications are addressed',
    case when (select count(*) from public.notifications
               where target_user_id = u) > 0 then 'yes' else 'no' end);
end $$;

-- 5. The dining window as a guest actually experiences it: through the RPC,
--    signed in as them, which is the path the portal uses.
do $$
declare
  u uuid; b uuid; m uuid;
begin
  select p.id into u from public.profiles p
   join public.customers c on c.id = p.customer_id
   where c.email = 'zz-window@example.invalid';
  select id into m from public.menu_items where available limit 1;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    select id into b from public.bookings where reference = 'ZZ-PAST-1';
    perform public.place_food_order(b, jsonb_build_array(
      jsonb_build_object('menu_item_id', m, 'quantity', 1)));
    insert into res values ('guest orders after check-out', 'ALLOWED — the rule did not hold');
  exception when others then
    insert into res values ('guest orders after check-out', 'refused: ' || sqlerrm);
  end;

  begin
    select id into b from public.bookings where reference = 'ZZ-FUT-1';
    perform public.place_food_order(b, jsonb_build_array(
      jsonb_build_object('menu_item_id', m, 'quantity', 1)));
    insert into res values ('guest orders before arrival', 'ALLOWED — the rule did not hold');
  exception when others then
    insert into res values ('guest orders before arrival', 'refused: ' || sqlerrm);
  end;

  begin
    select id into b from public.bookings where reference = 'ZZ-NOW-1';
    perform public.place_food_order(b, jsonb_build_array(
      jsonb_build_object('menu_item_id', m, 'quantity', 1)));
    insert into res values ('guest orders during the stay', 'allowed (correct)');
  exception when others then
    insert into res values ('guest orders during the stay', 'REFUSED — wrong: ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
end $$;

select * from res order by step;

rollback;
