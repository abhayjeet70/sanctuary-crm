-- A guest could not raise a request at all.
--
-- My bug, from 20260908140000. Two rules that each look right and cannot both
-- hold:
--
--   the insert policy   with check (... assigned_to is null ...)
--   route_request_to_team()   before insert, sets assigned_to
--
-- A BEFORE INSERT trigger runs first, and WITH CHECK is evaluated against the
-- row as the trigger left it. So every guest insert arrived at the check with
-- a team already on it, and every one was refused:
--
--   new row violates row-level security policy for table "guest_requests"
--
-- The policy is the one that is right. `assigned_to is null` is what stops a
-- guest posting straight to the API and putting their own job at the front of
-- the maintenance queue — so routing has to happen after the check, not
-- before it.
--
-- AFTER INSERT, and security definer because the update it performs would
-- otherwise be judged by the UPDATE policies, which a guest has none of.

create or replace function public.route_request_to_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null then
    update public.guest_requests
       set assigned_to = case new.category
             when 'housekeeping'  then 'housekeeping'::public.team
             when 'extra_towels'  then 'housekeeping'::public.team
             when 'room_setup'    then 'housekeeping'::public.team
             when 'food'          then 'kitchen'::public.team
             when 'maintenance'   then 'maintenance'::public.team
             when 'wifi'          then 'maintenance'::public.team
             -- Transport and anything unclassified is the desk's to place.
             else 'manager'::public.team
           end
     where id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists guest_requests_route_trg on public.guest_requests;

create trigger guest_requests_route_trg
  after insert on public.guest_requests
  for each row execute function public.route_request_to_team();
