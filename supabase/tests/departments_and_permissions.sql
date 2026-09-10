-- Departments end to end: create one, staff it, grant and revoke, and check
-- an employee's access follows — with no RLS failure anywhere in the flow.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/departments_and_permissions.sql
--
-- Rolls back. Any outcome containing "wrong", "REFUSED", "ALLOWED", "NOT " or
-- "FAILED" is a regression.
begin;

create temp table res (step text, outcome text) on commit drop;
grant all on res to authenticated;

do $$
declare
  owner_id uuid; dept uuid; emp uuid; person uuid; n int;
begin
  select id into owner_id from public.profiles where role = 'admin' limit 1;

  -- ---- The owner invents a department, as Settings does.
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.departments (name, slug, description, designations, sort_order)
    values ('ZZ Front Desk', 'zz-front-desk', 'Arrivals and the phone.',
            array['Front desk executive'], 99)
    returning id into dept;
    insert into res values ('owner creates a department', 'ok');
  exception when others then
    insert into res values ('owner creates a department', 'FAILED: ' || sqlerrm);
  end;

  insert into public.department_permissions (department_id, permission)
  values (dept, 'requests.work');

  -- ---- And puts someone in it.
  begin
    insert into public.employees (employee_code, full_name, designation, department_id,
                                  email, employment_type, status)
    values ('', 'ZZ Desk Person', 'Front desk executive', dept,
            'zz-desk@example.invalid', 'full_time', 'active')
    returning id into emp;
    insert into res values ('owner adds an employee to it', 'ok');
  exception when others then
    insert into res values ('owner adds an employee to it', 'FAILED: ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);

  -- ---- That employee gets a login. (The Edge Function does this with the
  --      service key; here it is written directly, which is the same rows.)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'zz-desk@example.invalid', '', now(), now(), now(),
          '', '', '', '')
  returning id into person;

  -- The signup trigger already wrote a guest profile for this user; the
  -- Edge Function upserts over it, so the test does the same.
  insert into public.profiles (id, role, full_name, department_id)
  values (person, 'staff', 'ZZ Desk Person', dept)
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        department_id = excluded.department_id,
        customer_id = null;
  update public.employees set profile_id = person where id = emp;

  -- ---- What can they see? Their department grants requests.work only.
  perform set_config('request.jwt.claims',
    json_build_object('sub', person, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.bookings;
  insert into res values ('new staff sees bookings', n::text || ' (want 0)');

  select count(*) into n from public.customers;
  insert into res values ('new staff sees guests', n::text || ' (want 0)');

  select count(*) into n from public.food_orders;
  insert into res values ('new staff sees kitchen orders', n::text || ' (want 0)');

  perform set_config('role', 'postgres', true);

  -- ---- The owner grants two more.
  insert into public.department_permissions (department_id, permission)
  values (dept, 'bookings.view'), (dept, 'guests.view');

  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.bookings;
  insert into res values ('after granting bookings.view',
    case when n > 0 then n::text || ' rows (correct)' else 'ZERO — grant did not reach RLS' end);
  select count(*) into n from public.customers;
  insert into res values ('after granting guests.view',
    case when n > 0 then n::text || ' rows (correct)' else 'ZERO — grant did not reach RLS' end);
  perform set_config('role', 'postgres', true);

  -- ---- A request in their category must route to them and be workable.
  insert into public.guest_requests (reference, booking_id, customer_id, villa_id,
                                     category, description, priority, status, department_id)
  select 'ZZ-DEPT-1', b.id, b.customer_id, b.villa_id, 'other', 'Airport pickup',
         'normal', 'pending', dept
  from public.bookings b limit 1;

  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.guest_requests where reference = 'ZZ-DEPT-1';
  insert into res values ('sees a request routed to them',
    case when n = 1 then 'yes' else 'NOT VISIBLE — wrong' end);

  begin
    update public.guest_requests set status = 'in_progress' where reference = 'ZZ-DEPT-1';
    insert into res values ('can work that request', 'ok');
  exception when others then
    insert into res values ('can work that request', 'REFUSED: ' || sqlerrm);
  end;

  -- ---- But not another department's.
  select count(*) into n from public.guest_requests
   where department_id is distinct from dept;
  insert into res values ('sees other departments'' requests', n::text || ' (want 0)');

  perform set_config('role', 'postgres', true);

  -- ---- Retiring the department closes everything it granted.
  update public.departments set active = false where id = dept;
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.bookings;
  insert into res values ('after retiring the department',
    case when n = 0 then '0 (correct)' else n::text || ' — STILL OPEN' end);
  perform set_config('role', 'postgres', true);
end $$;

select * from res order by step;

rollback;
