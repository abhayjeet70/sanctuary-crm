-- Manager and kitchen roles, tax permissions, and request resolution.
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/roles_and_requests.sql
--
-- Rolls back, so it is safe against the live database. Any outcome containing
-- "wrong", "MISSING", "NO ", "NOT " or "ALLOWED" is a regression.

-- Roles and request handling, as the roles themselves experience them.
-- Rolls back.
begin;

create temp table res (step text, outcome text) on commit drop;
grant all on res to authenticated;

do $$
declare
  owner_id uuid; mgr_id uuid; kit_id uuid; hk_id uuid;
  rq public.guest_requests%rowtype;
  guest_u uuid; n int;
begin
  select id into owner_id from public.profiles where role = 'admin' limit 1;
  select id into mgr_id  from public.profiles where role = 'manager' limit 1;
  select p.id into kit_id from public.profiles p where p.team = 'kitchen' and p.role = 'staff';
  select p.id into hk_id  from public.profiles p where p.team = 'housekeeping';

  insert into res values ('manager account exists',
    case when mgr_id is null then 'MISSING' else 'yes' end);
  insert into res values ('kitchen account exists',
    case when kit_id is null then 'MISSING' else 'yes' end);

  -- is_admin() must now cover the manager, is_owner() must not.
  perform set_config('request.jwt.claims',
    json_build_object('sub', mgr_id, 'role', 'authenticated')::text, true);
  insert into res values ('manager is management',
    case when public.is_admin() then 'yes' else 'NO — cannot run the property' end);
  insert into res values ('manager is not the owner',
    case when public.is_owner() then 'IS OWNER — wrong' else 'correct' end);

  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  insert into res values ('owner is the owner',
    case when public.is_owner() then 'yes' else 'NO — owner locked out' end);

  perform set_config('request.jwt.claims',
    json_build_object('sub', kit_id, 'role', 'authenticated')::text, true);
  insert into res values ('kitchen is staff, not management',
    case when public.is_staff() and not public.is_admin() then 'correct'
         else 'WRONG' end);

  perform set_config('request.jwt.claims', '', true);

  -- A request, worked through to resolution.
  select p.id into guest_u from public.profiles p
   join public.customers c on c.id = p.customer_id
   where c.email = 'abhayjeet9988@gmail.com';

  insert into public.guest_requests
    (reference, booking_id, customer_id, villa_id, category, description, priority, status)
  select 'ZZ-REQ-9', b.id, b.customer_id, b.villa_id, 'extra_towels',
         'Two more towels please', 'normal', 'pending'
  from public.bookings b
  join public.profiles p on p.customer_id = b.customer_id
  where p.id = guest_u limit 1
  returning * into rq;

  select count(*) into n from public.notifications where target_user_id = guest_u;

  update public.guest_requests set status = 'in_progress' where id = rq.id;
  select * into rq from public.guest_requests where id = rq.id;
  insert into res values ('acknowledged_at stamped',
    case when rq.acknowledged_at is not null then 'yes' else 'NOT STAMPED' end);

  update public.guest_requests
     set status = 'completed', resolution_note = 'Fresh towels delivered.'
   where id = rq.id;
  select * into rq from public.guest_requests where id = rq.id;
  insert into res values ('resolved_at stamped',
    case when rq.resolved_at is not null then 'yes' else 'NOT STAMPED' end);

  insert into res
  select 'guest told what was done',
         coalesce(max(detail), 'NOT NOTIFIED')
  from public.notifications
  where target_user_id = guest_u and title = 'Your request is done';

  -- Reopening must clear the finish, or the row claims to be both.
  update public.guest_requests set status = 'in_progress' where id = rq.id;
  select * into rq from public.guest_requests where id = rq.id;
  insert into res values ('reopening clears resolved_at',
    case when rq.resolved_at is null then 'yes' else 'STILL SET — wrong' end);
end $$;

-- Taxes are readable by everyone who signs in, writable only by the owner.
do $$
declare mgr_id uuid;
begin
  select id into mgr_id from public.profiles where role = 'manager' limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', mgr_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.taxes (name, rate, kind) values ('ZZ Sneaky', 0.99, 'levy');
    insert into res values ('manager adds a tax', 'ALLOWED — wrong');
  exception when others then
    insert into res values ('manager adds a tax', 'refused (correct)');
  end;
  perform set_config('role', 'postgres', true);
end $$;

select * from res order by step;

rollback;
