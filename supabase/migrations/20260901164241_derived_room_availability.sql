-- L6 — a room's occupancy is derived, never stored.
--
-- `rooms.status` held 'occupied' as a literal, which meant the seed had to be
-- kept in step with the bookings by hand and drifted the moment anyone checked
-- out. Occupancy is a fact about today's holds, so it should be computed.
--
-- What remains stored is the operational override — 'blocked' for maintenance,
-- 'cleaning' during turnover — because those are decisions a person makes, not
-- facts derivable from the booking table.

-- Clear the stored occupancy FIRST: the view below supplies it, and the
-- constraint that follows would reject these rows.
update public.rooms set status = 'available' where status = 'occupied';

-- Then narrow the column to the states a human actually sets.
alter table public.rooms
  add constraint rooms_status_is_operational
  check (status in ('available', 'blocked', 'cleaning'));

comment on column public.rooms.status is
  'Operational override only: available | blocked | cleaning. Occupancy is '
  'derived — read public.room_availability instead of assuming this means free.';

/**
 * Every room with today's true state.
 *
 * `effective_status` resolves in the order a receptionist would: a guest in the
 * room beats a cleaning flag, which beats a maintenance block, which beats
 * available.
 */
create or replace view public.room_availability as
select
  r.id            as room_id,
  r.villa_id,
  r.name,
  r.capacity,
  r.base_rate,
  r.status        as operational_status,
  hold.booking_id,
  hold.reference  as booking_reference,
  hold.customer_id,
  hold.whole_villa,
  case
    when hold.booking_id is not null then 'occupied'
    when r.status = 'cleaning'       then 'cleaning'
    when r.status = 'blocked'        then 'blocked'
    else 'available'
  end::public.room_status as effective_status
from public.rooms r
left join lateral (
  select b.id as booking_id, b.reference, b.customer_id,
         (b.booking_mode = 'whole') as whole_villa
  from public.booking_rooms br
  join public.bookings b on b.id = br.booking_id
  where br.room_id = r.id
    and public.holds_inventory(br.status)
    and current_date >= br.check_in
    and current_date <  br.check_out
  order by b.check_in
  limit 1
) hold on true;

alter view public.room_availability set (security_invoker = on);
grant select on public.room_availability to anon, authenticated;

-- Turnover housekeeping: a room whose guest has just checked out is dirty
-- until someone says otherwise. Only flips rooms nobody else is holding.
create or replace function public.mark_rooms_for_cleaning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('checked_out', 'completed', 'cancelled', 'no_show')
     and old.status is distinct from new.status then
    update public.rooms r
       set status = 'cleaning'
     where r.id in (select room_id from public.booking_rooms where booking_id = new.id)
       and r.status = 'available'
       and not exists (
         select 1
         from public.booking_rooms br2
         join public.bookings b2 on b2.id = br2.booking_id
         where br2.room_id = r.id
           and b2.id <> new.id
           and public.holds_inventory(br2.status)
           and current_date >= br2.check_in
           and current_date <  br2.check_out
       );
  end if;
  return new;
end;
$$;

create trigger bookings_mark_rooms_for_cleaning_trg
  after update of status on public.bookings
  for each row execute function public.mark_rooms_for_cleaning();

-- Reception clears the flag once the room has been turned over.
create or replace function public.set_room_status(
  p_room_id uuid,
  p_status  public.room_status
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can change a room status' using errcode = '42501';
  end if;
  if p_status = 'occupied' then
    raise exception 'Occupancy comes from the bookings — set it by booking the room'
      using errcode = '23514';
  end if;

  update public.rooms set status = p_status where id = p_room_id
  returning * into v_room;

  if not found then
    raise exception 'Room not found' using errcode = '23503';
  end if;
  return v_room;
end;
$$;

revoke all on function public.set_room_status from public, anon;
grant execute on function public.set_room_status to authenticated;
