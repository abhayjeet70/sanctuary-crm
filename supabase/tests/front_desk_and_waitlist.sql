-- The waiting list, end to end: who may join it, who may run it, who may not
-- see it, and whether a cancellation actually tells the desk.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/front_desk_and_waitlist.sql
--
-- Rolls back. Any outcome containing "wrong", "REFUSED", "ALLOWED", "NOT " or
-- "FAILED" is a regression.
begin;

create temp table res (step text, outcome text) on commit drop;
grant all on res to authenticated;

do $$
declare
  owner_id uuid;
  villa    uuid;
  guest_a  uuid; guest_b uuid;
  login_a  uuid;
  hk_dept  uuid; hk_person uuid;
  entry    uuid;
  stay     uuid;
  n        int;
begin
  select id into owner_id from public.profiles where role = 'admin' limit 1;
  select id into villa    from public.villas order by name limit 1;

  -- ---- Two guests, one of whom has a login.
  insert into public.customers (name, phone, email)
  values ('ZZ Waiting Guest', '+91 90000 00001', 'zz-wait-a@example.invalid')
  returning id into guest_a;
  insert into public.customers (name, phone, email)
  values ('ZZ Other Guest', '+91 90000 00002', 'zz-wait-b@example.invalid')
  returning id into guest_b;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'zz-wait-a@example.invalid', '', now(), now(), now(),
          '', '', '', '')
  returning id into login_a;
  -- The signup trigger already wrote a profile for this user; overwrite it the
  -- way the guest-linking path does.
  insert into public.profiles (id, role, full_name, customer_id)
  values (login_a, 'guest', 'ZZ Waiting Guest', guest_a)
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        customer_id = excluded.customer_id;

  -- A stay that holds the dates everyone below wants.
  insert into public.bookings (reference, customer_id, villa_id, booking_mode,
                               check_in, check_out, adults, status, nightly_rate, nights)
  values ('ZZ-WAIT-STAY', guest_b, villa, 'whole',
          '2027-03-01', '2027-03-05', 2, 'confirmed', 10000, 4)
  returning id into stay;

  -- =================================================== the guest's own half ==
  perform set_config('request.jwt.claims',
    json_build_object('sub', login_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.waitlist (customer_id, villa_id, check_in, check_out, adults, note)
    values (guest_a, villa, '2027-03-02', '2027-03-04', 2, 'ZZ own entry')
    returning id into entry;
    insert into res values ('1 guest joins the queue', 'ok');
  exception when others then
    insert into res values ('1 guest joins the queue', 'REFUSED: ' || sqlerrm);
  end;

  -- Somebody else's place in the queue is not theirs to take.
  begin
    insert into public.waitlist (customer_id, villa_id, check_in, check_out, adults)
    values (guest_b, villa, '2027-03-02', '2027-03-04', 2);
    insert into res values ('2 guest queues as someone else', 'ALLOWED — wrong');
  exception when others then
    insert into res values ('2 guest queues as someone else', 'refused (correct)');
  end;

  -- Withdrawing is theirs.
  begin
    update public.waitlist set status = 'cancelled' where id = entry;
    update public.waitlist set status = 'waiting'   where id = entry;
    insert into res values ('3 guest withdraws and rejoins', 'ok');
  exception when others then
    insert into res values ('3 guest withdraws and rejoins', 'REFUSED: ' || sqlerrm);
  end;

  -- Promoting themselves is not. This is the check that matters: the policy
  -- allows an update, so the WITH CHECK on the status is the only thing
  -- standing between a guest and marking themselves booked.
  begin
    update public.waitlist set status = 'converted' where id = entry;
    insert into res values ('4 guest marks self converted', 'ALLOWED — wrong');
  exception when others then
    insert into res values ('4 guest marks self converted', 'refused (correct)');
  end;

  -- And they see only their own row.
  perform set_config('role', 'postgres', true);
  insert into public.waitlist (customer_id, villa_id, check_in, check_out, adults, note)
  values (guest_b, villa, '2027-03-01', '2027-03-03', 4, 'ZZ other entry');
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.waitlist;
  insert into res values ('5 rows the guest can see',
    case when n = 1 then '1 (correct)' else n::text || ' — wrong, wanted 1' end);

  -- ====================================================== a staff department ==
  perform set_config('role', 'postgres', true);

  select id into hk_dept from public.departments where slug = 'housekeeping';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'zz-hk@example.invalid', '', now(), now(), now(),
          '', '', '', '')
  returning id into hk_person;
  insert into public.profiles (id, role, full_name, department_id)
  values (hk_person, 'staff', 'ZZ Housekeeper', hk_dept)
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        department_id = excluded.department_id,
        customer_id = null;

  perform set_config('request.jwt.claims',
    json_build_object('sub', hk_person, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.waitlist;
  insert into res values ('6 housekeeping sees the waitlist',
    case when n = 0 then '0 (correct)' else n::text || ' rows — wrong' end);

  -- Granting the permission is what opens it, and nothing else has to change.
  perform set_config('role', 'postgres', true);
  insert into public.department_permissions (department_id, permission)
  values (hk_dept, 'waitlist.manage');
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.waitlist;
  insert into res values ('7 after granting waitlist.manage',
    case when n = 2 then '2 (correct)' else n::text || ' rows — wrong, wanted 2' end);

  -- ================================================== the release notification ==
  perform set_config('role', 'postgres', true);
  update public.bookings set status = 'cancelled' where id = stay;

  select count(*) into n from public.notifications
   where target_user_id is null and title like '%freed up%';
  insert into res values ('8 cancelling tells the desk',
    case when n > 0 then 'notified (correct)' else 'NOT NOTIFIED — wrong' end);

  -- The same update again must not ring the bell twice: the trigger fires on
  -- every status write, and a desk that gets told repeatedly stops reading.
  update public.bookings set status = 'cancelled' where id = stay;
  select count(*) into n from public.notifications
   where target_user_id is null and title like '%freed up%';
  insert into res values ('9 re-saving the same status',
    case when n = 1 then '1 notification (correct)' else n::text || ' — wrong, wanted 1' end);
end $$;

select * from res order by step;

rollback;
