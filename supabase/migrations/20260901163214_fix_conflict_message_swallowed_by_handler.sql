-- I10 — the useful conflict message never reached the reception desk.
--
-- create_booking pre-checks for clashes and raises
--   "Those dates are already held by HOS-1018 (2026-11-10 to 2026-11-13)"
-- with errcode 23P01, so the client can map it to a 409.
--
-- But the function also carried `exception when exclusion_violation` to catch a
-- genuine race on the constraint — and 23P01 *is* exclusion_violation. The
-- handler therefore caught the function's own pre-check and replaced it with
-- "Those dates were taken while you were filling the form", telling the desk it
-- had lost a race when in fact it had simply picked busy dates, and hiding
-- which booking was in the way.
--
-- The fix is to scope the handler to the statements that can actually race:
-- the INSERT and the room-hold expansion. The pre-check now propagates intact.

create or replace function public.create_booking(
  p_customer_id       uuid,
  p_villa_id          uuid,
  p_room_ids          uuid[],
  p_check_in          date,
  p_check_out         date,
  p_adults            int,
  p_children          int,
  p_source            public.booking_source,
  p_nightly_rate      int,
  p_discount          int default 0,
  p_tax_rate          numeric default 0.180,
  p_advance           int default 0,
  p_special_requests  text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode      public.villa_mode;
  v_capacity  int;
  v_nights    int;
  v_booking   public.bookings%rowtype;
  v_conflicts text;
begin
  if not public.is_admin() then
    raise exception 'Only staff can create bookings' using errcode = '42501';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in' using errcode = '22007';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'That guest does not exist yet — create the customer first'
      using errcode = '23503';
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

  -- Name every clash, not just the first.
  select string_agg(
           reference || ' (' || check_in::text || ' to ' || check_out::text || ')', ', ')
    into v_conflicts
  from public.find_booking_conflicts(p_villa_id, p_room_ids, p_check_in, p_check_out, null);

  if v_conflicts is not null then
    raise exception 'Those dates are already held by %', v_conflicts
      using errcode = '23P01';
  end if;

  v_nights := p_check_out - p_check_in;

  -- Only these two statements can lose a race, so only these are guarded.
  begin
    insert into public.bookings (
      reference, customer_id, villa_id, booking_mode,
      check_in, check_out, adults, children, source,
      status, payment_status,
      nightly_rate, nights, discount, tax_rate, amount_paid, special_requests
    ) values (
      public.next_booking_reference(),
      p_customer_id, p_villa_id, v_mode,
      p_check_in, p_check_out, p_adults, p_children, p_source,
      case when p_advance > 0
        then 'confirmed'::public.booking_status
        else 'pending_payment'::public.booking_status
      end,
      case when p_advance > 0
        then 'partial'::public.payment_status
        else 'pending'::public.payment_status
      end,
      p_nightly_rate, v_nights, p_discount, p_tax_rate, p_advance, p_special_requests
    )
    returning * into v_booking;

    perform public.sync_booking_rooms(v_booking.id, p_room_ids);
  exception
    when exclusion_violation then
      raise exception 'Those dates were taken while you were filling the form — reload and try again'
        using errcode = '23P01';
  end;

  -- The advance may settle the booking outright; let the money decide (BR6).
  if p_advance > 0 then
    perform public.recalculate_payment_status(v_booking.id);
    select * into v_booking from public.bookings where id = v_booking.id;
  end if;

  return v_booking;
end;
$$;
