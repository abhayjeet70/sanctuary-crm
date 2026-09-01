-- L1 — editing an existing booking.
--
-- Changing dates, rooms or villa re-opens the inventory question, so this goes
-- through an RPC for the same reason creation does: the conflict check and the
-- room-hold rebuild must be one transaction, and the check must ignore the
-- booking being edited or every stay would collide with itself.

create or replace function public.update_booking(
  p_booking_id        uuid,
  p_villa_id          uuid,
  p_room_ids          uuid[],
  p_check_in          date,
  p_check_out         date,
  p_adults            int,
  p_children          int,
  p_source            public.booking_source,
  p_nightly_rate      int,
  p_weekend_surcharge int default 0,
  p_seasonal_surcharge int default 0,
  p_extra_guest_charge int default 0,
  p_add_ons           int default 0,
  p_discount          int default 0,
  p_tax_rate          numeric default 0.180,
  p_special_requests  text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing  public.bookings%rowtype;
  v_mode      public.villa_mode;
  v_capacity  int;
  v_conflicts text;
  v_booking   public.bookings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can edit bookings' using errcode = '42501';
  end if;

  select * into v_existing from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;

  -- A stay that has already been released is history; re-dating it would
  -- silently resurrect a hold on inventory someone else may now have.
  if not public.holds_inventory(v_existing.status) then
    raise exception 'This booking is % and can no longer be edited',
      replace(v_existing.status::text, '_', ' ') using errcode = '23514';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in' using errcode = '22007';
  end if;

  select mode, capacity into v_mode, v_capacity
  from public.villas where id = p_villa_id;
  if v_mode is null then
    raise exception 'Villa not found' using errcode = '23503';
  end if;

  if (p_adults + p_children) > v_capacity then
    raise exception 'That villa sleeps %, and this booking is for %',
      v_capacity, p_adults + p_children using errcode = '23514';
  end if;

  -- Ignoring itself is the whole difference from create_booking.
  select string_agg(
           reference || ' (' || check_in::text || ' to ' || check_out::text || ')', ', ')
    into v_conflicts
  from public.find_booking_conflicts(
    p_villa_id, p_room_ids, p_check_in, p_check_out, p_booking_id);

  if v_conflicts is not null then
    raise exception 'Those dates are already held by %', v_conflicts
      using errcode = '23P01';
  end if;

  begin
    update public.bookings
       set villa_id           = p_villa_id,
           booking_mode       = v_mode,
           check_in           = p_check_in,
           check_out          = p_check_out,
           nights             = p_check_out - p_check_in,
           adults             = p_adults,
           children           = p_children,
           source             = p_source,
           nightly_rate       = p_nightly_rate,
           weekend_surcharge  = p_weekend_surcharge,
           seasonal_surcharge = p_seasonal_surcharge,
           extra_guest_charge = p_extra_guest_charge,
           add_ons            = p_add_ons,
           discount           = p_discount,
           tax_rate           = p_tax_rate,
           special_requests   = p_special_requests
     where id = p_booking_id
    returning * into v_booking;

    perform public.sync_booking_rooms(p_booking_id, p_room_ids);
  exception
    when exclusion_violation then
      raise exception 'Those dates were taken while you were editing — reload and try again'
        using errcode = '23P01';
  end;

  -- Re-pricing can move a booking either side of settled (BR6).
  perform public.recalculate_payment_status(p_booking_id);
  select * into v_booking from public.bookings where id = p_booking_id;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (
    p_booking_id, 'booking', 'Booking edited',
    case
      when v_existing.check_in <> p_check_in or v_existing.check_out <> p_check_out
        then 'Dates changed to ' || p_check_in::text || ' to ' || p_check_out::text
      when v_existing.villa_id <> p_villa_id then 'Moved to another villa'
      else 'Details updated'
    end,
    coalesce(auth.email(), 'Staff')
  );

  return v_booking;
end;
$$;

revoke all on function public.update_booking from public, anon;
grant execute on function public.update_booking to authenticated;
