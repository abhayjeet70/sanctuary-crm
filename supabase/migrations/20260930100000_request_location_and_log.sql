-- Requests know where they came from, and the log says how they were handled.
--
-- Three things a shift lead asked for:
--   1. A new request lands in the activity log, with how it will be assigned
--      (auto or by hand).
--   2. Who it was assigned to is in the log too - and, when nobody was free,
--      that is logged rather than left as a silent "pending".
--   3. The person who gets the job is told which villa AND which room.
--
-- The room is copied onto the request at insert time. Staff cannot read
-- bookings (RLS), so looking it up at display time would show them nothing;
-- copying it means the queue works on exactly the rows it is already allowed.

alter table public.guest_requests add column if not exists location text;
comment on column public.guest_requests.location is
  'Where in the villa: "Whole villa" or the rooms the stay holds. Stamped on insert.';

/** "Whole villa", or the booking's rooms - the place a job is done. */
create or replace function public.stay_location(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when b.booking_mode = 'whole' then 'Whole villa'
    else (select string_agg(r.name, ', ' order by r.name)
            from public.booking_rooms br
            join public.rooms r on r.id = br.room_id
           where br.booking_id = b.id)
  end
  from public.bookings b
  where b.id = p_booking_id;
$$;
revoke all on function public.stay_location(uuid) from public, anon, authenticated;

create or replace function public.stamp_request_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Always overwritten: a guest posting straight to the API does not get to
  -- choose what staff are told.
  new.location := public.stay_location(new.booking_id);
  return new;
end;
$$;

drop trigger if exists guest_requests_location_trg on public.guest_requests;
create trigger guest_requests_location_trg
  before insert on public.guest_requests
  for each row execute function public.stamp_request_location();

/** Log the new request, and how it is going to be assigned. */
create or replace function public.log_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_villa text;
  v_who   text;
  v_auto  boolean;
begin
  select name into v_villa from public.villas where id = new.villa_id;
  v_who := coalesce(
    (select full_name from public.booking_companions where id = new.companion_id),
    (select name from public.customers where id = new.customer_id),
    'Guest');
  v_auto := coalesce((select auto_assign_requests from public.property_settings where id), false);

  insert into public.activity_events (entity_id, kind, title, detail, actor, at)
  values (new.booking_id, 'request', 'New guest request',
          concat_ws(' · ',
            new.reference,
            replace(new.category::text, '_', ' '),
            v_villa,
            new.location,
            case when v_auto then 'Mode: auto-assign'
                 else 'Mode: manual - waiting for the desk to assign' end),
          v_who,
          clock_timestamp());
  return null;
end;
$$;

-- Triggers fire alphabetically: "log" sorts before "route" and "zz_auto", so
-- the log reads created, then routed, then assigned.
drop trigger if exists guest_requests_log_trg on public.guest_requests;
create trigger guest_requests_log_trg
  after insert on public.guest_requests
  for each row execute function public.log_new_request();

-- Requests raised before this migration get their place too.
update public.guest_requests
   set location = public.stay_location(booking_id)
 where location is null;

-- The assignment paths, now naming the room and logging every outcome.

create or replace function public.assign_request_internal(
  p_request_id  uuid,
  p_employee_id uuid,
  p_auto        boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees%rowtype;
  r public.guest_requests%rowtype;
  v_villa text;
  v_where text;
begin
  select * into e from public.employees where id = p_employee_id;
  select * into r from public.guest_requests where id = p_request_id;

  update public.guest_requests
     set assigned_employee = e.id,
         assigned_user = e.profile_id,
         auto_assigned = p_auto,
         status = case when status = 'pending' then 'assigned'::public.request_status else status end
   where id = p_request_id;

  select name into v_villa from public.villas where id = r.villa_id;
  -- Villa and room together: the person walking over needs both.
  v_where := concat_ws(' · ', v_villa, r.location);

  -- clock_timestamp(), not now(): inside one transaction now() is frozen, and
  -- an assignment made by the insert trigger would otherwise sort before the
  -- "new request" entry written a moment earlier.
  insert into public.activity_events (entity_id, kind, title, detail, actor, at)
  values (r.booking_id, 'request',
          case when p_auto then 'Request auto-assigned' else 'Request assigned by hand' end,
          r.reference || ' → ' || e.full_name || coalesce(' · ' || nullif(v_where, ''), ''),
          case when p_auto then 'Auto-assign' else
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff') end,
          clock_timestamp());

  -- Tell them, if they have a login to be told on.
  if e.profile_id is not null then
    insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
    values ('request', 'New job: ' || r.reference,
            left(r.description, 120) || coalesce(' — ' || nullif(v_where, ''), ''),
            false, r.booking_id, e.profile_id);
  end if;
end;
$$;

create or replace function public.auto_assign_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.guest_requests%rowtype;
  v_emp uuid;
  v_villa text;
begin
  select * into r from public.guest_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' or r.assigned_employee is not null
     or r.department_id is null then
    return null;
  end if;

  select e.id into v_emp
  from public.employees e
  where e.status = 'active'
    and e.department_id = r.department_id
    and (e.villa_id = r.villa_id or e.villa_id is null)
    and not exists (
      select 1 from public.guest_requests g
       where g.assigned_employee = e.id and g.status in ('assigned', 'in_progress'))
  order by (e.villa_id = r.villa_id) desc nulls last,
           coalesce((select max(g.resolved_at) from public.guest_requests g
                      where g.assigned_employee = e.id), 'epoch'::timestamptz),
           e.employee_code
  limit 1;

  if v_emp is null then
    -- Say so in the log: "pending" alone looks like nobody noticed it.
    select name into v_villa from public.villas where id = r.villa_id;
    insert into public.activity_events (entity_id, kind, title, detail, actor, at)
    values (r.booking_id, 'request', 'Request waiting for staff',
            r.reference || ' · nobody free at ' || coalesce(v_villa, 'this villa')
              || ' — it goes to the next person to finish a job',
            'Auto-assign', clock_timestamp());
    return null;
  end if;
  perform public.assign_request_internal(r.id, v_emp, true);
  return v_emp;
end;
$$;

create or replace function public.assign_request_to_employee(
  p_request_id  uuid,
  p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.guest_requests%rowtype;
  e public.employees%rowtype;
begin
  if not (public.is_admin() or public.has_permission('requests.all')) then
    raise exception 'You cannot assign requests' using errcode = '42501';
  end if;
  select * into r from public.guest_requests where id = p_request_id;
  if not found then
    raise exception 'No such request' using errcode = '23503';
  end if;
  if r.status in ('completed', 'rejected') then
    raise exception 'That request is already closed' using errcode = '23514';
  end if;

  if p_employee_id is null then
    update public.guest_requests
       set assigned_employee = null, assigned_user = null, auto_assigned = false,
           status = case when status = 'assigned' then 'pending'::public.request_status else status end
     where id = p_request_id;
    insert into public.activity_events (entity_id, kind, title, detail, actor, at)
    values (r.booking_id, 'request', 'Request unassigned',
            r.reference || ' is back in the queue',
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff'),
            clock_timestamp());
    return;
  end if;

  select * into e from public.employees where id = p_employee_id;
  if not found or e.status <> 'active' then
    raise exception 'That employee is not active' using errcode = '23514';
  end if;
  if e.villa_id is not null and e.villa_id is distinct from r.villa_id then
    raise exception '% works at another villa', e.full_name using errcode = '23514';
  end if;

  perform public.assign_request_internal(p_request_id, p_employee_id, false);
end;
$$;

revoke all on function public.assign_request_internal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.auto_assign_request(uuid)                    from public, anon, authenticated;
revoke all on function public.log_new_request()                            from public, anon, authenticated;
revoke all on function public.stamp_request_location()                     from public, anon, authenticated;
