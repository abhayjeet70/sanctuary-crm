-- Rooms become editable from the admin UI in this pass, which introduces two
-- ways to lose data quietly. Both are closed here rather than in the UI,
-- because the UI is not the boundary.

-- 1. booking_rooms.room_id cascades on delete. Removing a room a live booking
--    holds would therefore delete the hold — silently freeing inventory that
--    someone has paid for, and taking the overlap constraint's evidence with
--    it. A room with a hold that has not ended cannot be deleted at all.
create or replace function public.guard_room_delete()
returns trigger
language plpgsql
as $$
declare
  held int;
  siblings int;
begin
  select count(*) into held
  from public.booking_rooms br
  where br.room_id = old.id
    and public.holds_inventory(br.status)
    and br.check_out >= current_date;

  if held > 0 then
    raise exception
      'That room is held by % booking(s) that have not ended. Move or cancel them first.', held
      using errcode = 'restrict_violation';
  end if;

  -- 2. villas.bedrooms is `check (bedrooms > 0)`, and the count below keeps it
  --    in step with the rooms — so emptying a villa would fail on the check
  --    with an error nobody can act on. Say the useful thing instead.
  select count(*) into siblings from public.rooms where villa_id = old.villa_id;
  if siblings <= 1 then
    raise exception 'A villa must keep at least one room.'
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

drop trigger if exists guard_room_delete on public.rooms;
create trigger guard_room_delete
  before delete on public.rooms
  for each row execute function public.guard_room_delete();

-- villas.bedrooms was a hand-maintained number. Now that rooms can be added and
-- removed it would drift from the truth within a day, so it follows the count.
create or replace function public.sync_villa_bedrooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.villa_id, old.villa_id);
begin
  update public.villas v
  set bedrooms = greatest(1, (select count(*) from public.rooms r where r.villa_id = target))
  where v.id = target;
  return null;
end;
$$;

drop trigger if exists sync_villa_bedrooms on public.rooms;
create trigger sync_villa_bedrooms
  after insert or delete on public.rooms
  for each row execute function public.sync_villa_bedrooms();

-- Correct any drift that already exists.
update public.villas v
set bedrooms = greatest(1, (select count(*) from public.rooms r where r.villa_id = v.id));
