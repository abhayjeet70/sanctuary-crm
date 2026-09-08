-- The kitchen was being shown housekeeping's work.
--
-- Two faults, one visible symptom:
--
--   1. The read policy added in 20260908120000 was `using (is_staff())` —
--      every member of staff could read every request. That was mine: I
--      widened the read from management-only so the staff screen could work
--      its queue, and forgot to scope it while doing so.
--
--   2. A request could be raised with no team at all. REQ-4004 (a cab to the
--      airport) had been sitting unassigned, which under a scoped policy
--      would mean nobody sees it rather than everybody.
--
-- So: route on the way in, then scope the read. Routing first, because
-- tightening the policy without it would hide live work.

/**
 * Where a request goes when nobody has said.
 *
 * Only ever fills a blank — an assignment someone made by hand is a
 * decision, and a trigger has no business overruling it.
 */
create or replace function public.route_request_to_team()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_to is null then
    new.assigned_to := case new.category
      when 'housekeeping'  then 'housekeeping'::public.team
      when 'extra_towels'  then 'housekeeping'::public.team
      when 'room_setup'    then 'housekeeping'::public.team
      when 'food'          then 'kitchen'::public.team
      when 'maintenance'   then 'maintenance'::public.team
      when 'wifi'          then 'maintenance'::public.team
      -- Transport and anything unclassified is the desk's to place.
      else 'manager'::public.team
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists guest_requests_route_trg on public.guest_requests;
create trigger guest_requests_route_trg
  before insert on public.guest_requests
  for each row execute function public.route_request_to_team();

-- Anything already sitting without a team, placed by the same rule.
update public.guest_requests
   set assigned_to = case category
         when 'housekeeping' then 'housekeeping'::public.team
         when 'extra_towels' then 'housekeeping'::public.team
         when 'room_setup'   then 'housekeeping'::public.team
         when 'food'         then 'kitchen'::public.team
         when 'maintenance'  then 'maintenance'::public.team
         when 'wifi'         then 'maintenance'::public.team
         else 'manager'::public.team
       end
 where assigned_to is null;

-- The scoped policies were already there, from 20260901164249:
--
--   staff read their team's requests     assigned_to = current_team()
--   staff advance their team's requests  assigned_to = current_team()
--
-- Last commit added "staff read requests" using (is_staff()) beside them.
-- Policies are OR'd, so the broad one simply overrode the correct one and
-- every member of staff could read every request. The same mistake as the
-- notification policies earlier today: adding a policy without checking what
-- was already on the table.
--
-- So these are dropped rather than replaced. Management keeps the whole board
-- through "admins manage requests", which is a FOR ALL policy.

drop policy if exists "staff read requests" on public.guest_requests;
drop policy if exists "staff work their queue" on public.guest_requests;
