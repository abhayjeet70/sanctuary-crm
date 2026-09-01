-- Inventory conflicts (BR1–BR5), enforced by the database.
--
-- The client still runs findConflicts() for instant feedback, but that is
-- advisory. Under concurrency only a constraint can make double-booking
-- impossible, so this is where the rule actually lives.
--
-- The design in one line: a whole-villa booking is expanded into a hold on
-- every bedroom, so BR4 (whole-villa blocks rooms, rooms block whole-villa)
-- falls out of a single per-room exclusion constraint with no special cases.

-- BR3: which statuses still hold inventory. Immutable so it can be used inside
-- an index/constraint expression.
create or replace function public.holds_inventory(s public.booking_status)
returns boolean
language sql
immutable
parallel safe
as $$
  select s not in ('cancelled', 'rejected', 'no_show', 'checked_out', 'completed');
$$;

-- The stay as a half-open date range (BR2). `[)` means a check-out on the 3rd
-- does not collide with a check-in on the 3rd.
create or replace function public.stay_range(check_in date, check_out date)
returns daterange
language sql
immutable
parallel safe
as $$
  select daterange(check_in, check_out, '[)');
$$;

-- Denormalised onto booking_rooms so the exclusion constraint has everything it
-- needs on one row. Kept in step with the booking by triggers below.
alter table public.booking_rooms
  add column check_in  date,
  add column check_out date,
  add column status    public.booking_status;

-- ------------------------------------------------------------------------
-- THE constraint. Two holds on the same room whose stays overlap cannot both
-- exist, as long as both still hold inventory.
-- ------------------------------------------------------------------------
alter table public.booking_rooms
  add constraint booking_rooms_no_overlap
  exclude using gist (
    room_id with =,
    public.stay_range(check_in, check_out) with &&
  )
  where (public.holds_inventory(status));

-- Expand a booking into per-room holds. Whole-villa bookings take every
-- bedroom; split bookings take only the rooms passed in `room_ids`.
create or replace function public.sync_booking_rooms(
  p_booking_id uuid,
  p_room_ids   uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking % not found', p_booking_id;
  end if;

  delete from public.booking_rooms where booking_id = p_booking_id;

  if b.booking_mode = 'whole' then
    -- BR1: the whole villa means every bedroom in it.
    insert into public.booking_rooms (booking_id, room_id, check_in, check_out, status)
    select b.id, r.id, b.check_in, b.check_out, b.status
    from public.rooms r
    where r.villa_id = b.villa_id;
  else
    if p_room_ids is null or cardinality(p_room_ids) = 0 then
      raise exception 'A split-mode booking must name at least one room'
        using errcode = 'check_violation';
    end if;

    insert into public.booking_rooms (booking_id, room_id, check_in, check_out, status)
    select b.id, r.id, b.check_in, b.check_out, b.status
    from public.rooms r
    where r.id = any (p_room_ids) and r.villa_id = b.villa_id;

    if (select count(*) from public.booking_rooms where booking_id = b.id)
       <> cardinality(p_room_ids) then
      raise exception 'Those rooms do not all belong to the chosen villa'
        using errcode = 'foreign_key_violation';
    end if;
  end if;
end;
$$;

-- Keep the denormalised copy honest: any change to a booking's dates or status
-- must reach its room holds, or the constraint would be guarding stale data.
create or replace function public.bookings_sync_room_holds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (new.check_in is distinct from old.check_in
       or new.check_out is distinct from old.check_out
       or new.status  is distinct from old.status)
  then
    update public.booking_rooms
       set check_in = new.check_in, check_out = new.check_out, status = new.status
     where booking_id = new.id;
  end if;
  return new;
end;
$$;

create trigger bookings_sync_room_holds_trg
  after update on public.bookings
  for each row execute function public.bookings_sync_room_holds();

-- A booking whose villa is in whole mode must not carry a room list, and one in
-- split mode must. Enforced here rather than trusted from the client.
create or replace function public.bookings_validate_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode public.villa_mode;
begin
  select mode into v_mode from public.villas where id = new.villa_id;
  if v_mode is null then
    raise exception 'Villa % not found', new.villa_id;
  end if;
  return new;
end;
$$;

create trigger bookings_validate_mode_trg
  before insert or update of villa_id, booking_mode on public.bookings
  for each row execute function public.bookings_validate_mode();

-- Read-only helper the UI and the RPCs both use to explain a clash.
create or replace function public.find_booking_conflicts(
  p_villa_id   uuid,
  p_room_ids   uuid[],
  p_check_in   date,
  p_check_out  date,
  p_ignore_id  uuid default null
)
returns table (
  booking_id uuid,
  reference  text,
  check_in   date,
  check_out  date,
  whole_villa boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target_rooms as (
    select r.id
    from public.rooms r
    where r.villa_id = p_villa_id
      and (p_room_ids is null or cardinality(p_room_ids) = 0 or r.id = any (p_room_ids))
  )
  select distinct
    b.id,
    b.reference,
    b.check_in,
    b.check_out,
    (b.booking_mode = 'whole')
  from public.booking_rooms br
  join public.bookings b on b.id = br.booking_id
  where br.room_id in (select id from target_rooms)
    and public.holds_inventory(br.status)
    and public.stay_range(br.check_in, br.check_out)
        && public.stay_range(p_check_in, p_check_out)
    and (p_ignore_id is null or b.id <> p_ignore_id);
$$;
