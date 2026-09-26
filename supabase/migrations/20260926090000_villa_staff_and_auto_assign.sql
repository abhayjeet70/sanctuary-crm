-- Staff belong to a villa, and requests can find their own person.
--
-- ── The rule ────────────────────────────────────────────────────────────
-- With auto-assign on, a new guest request goes to a FREE member of the
-- department that handles it, working at the villa the request came from.
-- "Free" is exact: nobody holding an open (assigned or in-progress) request.
-- Staff with no villa set are floaters — they cover every villa, but only
-- after the villa's own people. If nobody is free the request stays pending,
-- and the moment somebody finishes a job the oldest waiting one for their
-- villa comes to them. So nothing is lost and nobody is double-booked.
--
-- All of it happens in the database, in the same transaction as the insert or
-- the completion, so it works whether or not anybody has the Requests page open.

-- --------------------------------------------------------------- columns --
-- One villa per employee, null meaning "all villas". A person who genuinely
-- works two houses is a floater; a join table would be the next step, but three
-- villas and a roster this size do not need it yet.
alter table public.employees
  add column if not exists villa_id uuid references public.villas (id) on delete set null;
create index if not exists employees_villa_idx on public.employees (villa_id);

comment on column public.employees.villa_id is
  'The villa this person works at. Null means every villa (a floater).';

-- The person on the hook. assigned_user is their LOGIN, which most of the
-- roster does not have, so the roster row is what an assignment points at.
alter table public.guest_requests
  add column if not exists assigned_employee uuid references public.employees (id) on delete set null,
  add column if not exists auto_assigned boolean not null default false;
create index if not exists guest_requests_employee_idx on public.guest_requests (assigned_employee);

alter table public.property_settings
  add column if not exists auto_assign_requests boolean not null default false;

-- ------------------------------------------------------------ assignment --

/** Put a request on a person. The single place that does it. */
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

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (r.booking_id, 'request',
          case when p_auto then 'Request auto-assigned' else 'Request assigned' end,
          r.reference || ' → ' || e.full_name || coalesce(' · ' || v_villa, ''),
          case when p_auto then 'Auto-assign' else
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Staff') end);

  -- Tell them, if they have a login to be told on.
  if e.profile_id is not null then
    insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
    values ('request', 'New job: ' || r.reference,
            left(r.description, 120) || coalesce(' — ' || v_villa, ''),
            false, r.booking_id, e.profile_id);
  end if;
end;
$$;

/**
 * Hand a pending request to the best free person, or nobody.
 * Villa's own staff first; then floaters. Among equals, whoever has been idle
 * longest — so work rotates instead of always landing on the same person.
 */
create or replace function public.auto_assign_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.guest_requests%rowtype;
  v_emp uuid;
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

  if v_emp is null then return null; end if;
  perform public.assign_request_internal(r.id, v_emp, true);
  return v_emp;
end;
$$;

/** A person has just become free: give them the oldest job waiting for them. */
create or replace function public.auto_assign_next_for(p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees%rowtype;
  v_req uuid;
begin
  select * into e from public.employees where id = p_employee_id;
  if not found or e.status <> 'active' or e.department_id is null then return null; end if;

  if exists (select 1 from public.guest_requests g
              where g.assigned_employee = e.id and g.status in ('assigned', 'in_progress')) then
    return null;
  end if;

  select g.id into v_req
  from public.guest_requests g
  where g.status = 'pending' and g.assigned_employee is null
    and g.department_id = e.department_id
    and (e.villa_id is null or e.villa_id = g.villa_id)
  order by case g.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
           g.created_at
  limit 1
  for update skip locked;

  if v_req is null then return null; end if;
  perform public.assign_request_internal(v_req, e.id, true);
  return v_req;
end;
$$;

-- ------------------------------------------------------------- triggers --

create or replace function public.guest_requests_auto_assign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auto_assign_requests from public.property_settings where id), false) then
    if tg_op = 'INSERT' then
      -- The routing trigger has stamped the department by now (it sorts first),
      -- so the row is re-read inside the function rather than trusting NEW.
      perform public.auto_assign_request(new.id);
    elsif new.assigned_employee is not null then
      perform public.auto_assign_next_for(new.assigned_employee);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists guest_requests_zz_auto_insert_trg on public.guest_requests;
create trigger guest_requests_zz_auto_insert_trg
  after insert on public.guest_requests
  for each row execute function public.guest_requests_auto_assign();

drop trigger if exists guest_requests_zz_auto_done_trg on public.guest_requests;
create trigger guest_requests_zz_auto_done_trg
  after update of status on public.guest_requests
  for each row
  when (new.status in ('completed', 'rejected')
        and old.status in ('assigned', 'in_progress')
        and new.assigned_employee is not null)
  execute function public.guest_requests_auto_assign();

-- ------------------------------------------------------------ management --

/** Switch auto-assign on or off. Switching on clears the backlog straight away. */
create or replace function public.set_auto_assign(p_on boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only management can change request assignment' using errcode = '42501';
  end if;
  update public.property_settings set auto_assign_requests = p_on where id;

  if p_on then
    for r in
      select id from public.guest_requests
       where status = 'pending' and assigned_employee is null
       order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
                created_at
    loop
      if public.auto_assign_request(r.id) is not null then n := n + 1; end if;
    end loop;
  end if;
  return n;
end;
$$;

/** Assign by hand — or pass a null employee to take it back. */
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

-- ---------------------------------------------------------------- grants --
revoke all on function public.assign_request_internal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.auto_assign_request(uuid)                    from public, anon, authenticated;
revoke all on function public.auto_assign_next_for(uuid)                   from public, anon, authenticated;
revoke all on function public.set_auto_assign(boolean)                     from public, anon;
revoke all on function public.assign_request_to_employee(uuid, uuid)       from public, anon;
grant execute on function public.set_auto_assign(boolean)                  to authenticated;
grant execute on function public.assign_request_to_employee(uuid, uuid)    to authenticated;
