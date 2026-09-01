-- Guests can check availability and request a stay.
--
-- Until now a guest could sign up and then do nothing: bookings were
-- admin-only, so someone with an account but no booking saw an empty portal
-- and had no way to get one.
--
-- Two things make this safe to open up:
--
--   1. Availability is answered by a function, not by reading `bookings`.
--      A guest must never be able to enumerate other people's stays, so the
--      function returns only free/busy — no names, no references, no dates
--      beyond the window asked about.
--
--   2. The PRICE IS NEVER TAKEN FROM THE CLIENT. It is read from the villa and
--      its rooms inside the function. A booking form that posted its own rate
--      would let a guest book a villa for one rupee.

/**
 * Which villas and rooms are free for a window.
 *
 * Security definer so it can see every hold, but it returns only counts and
 * booleans — never who is staying.
 */
create or replace function public.check_availability(
  p_check_in  date,
  p_check_out date
)
returns table (
  villa_id        uuid,
  villa_name      text,
  villa_mode      public.villa_mode,
  whole_available boolean,
  free_rooms      int,
  total_rooms     int,
  nightly_rate    int
)
language sql
stable
security definer
set search_path = public
as $$
  with held as (
    select br.room_id
    from public.booking_rooms br
    where public.holds_inventory(br.status)
      and public.stay_range(br.check_in, br.check_out)
          && public.stay_range(p_check_in, p_check_out)
  )
  select
    v.id,
    v.name,
    v.mode,
    -- A whole-villa stay needs every bedroom free.
    (count(*) filter (where r.id in (select room_id from held)) = 0) as whole_available,
    count(*) filter (where r.id not in (select room_id from held))::int as free_rooms,
    count(*)::int as total_rooms,
    v.base_rate
  from public.villas v
  join public.rooms r on r.villa_id = v.id
  where v.status = 'active'
  group by v.id, v.name, v.mode, v.base_rate;
$$;

grant execute on function public.check_availability to anon, authenticated;

/** Which individual rooms are free, for a villa sold room by room. */
create or replace function public.check_room_availability(
  p_villa_id  uuid,
  p_check_in  date,
  p_check_out date
)
returns table (
  room_id   uuid,
  name      text,
  capacity  int,
  base_rate int,
  available boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.name,
    r.capacity,
    r.base_rate,
    not exists (
      select 1
      from public.booking_rooms br
      where br.room_id = r.id
        and public.holds_inventory(br.status)
        and public.stay_range(br.check_in, br.check_out)
            && public.stay_range(p_check_in, p_check_out)
    ) as available
  from public.rooms r
  where r.villa_id = p_villa_id
  order by r.name;
$$;

grant execute on function public.check_room_availability to anon, authenticated;

/**
 * A guest requests a stay.
 *
 * Saved as `pending_payment`: it holds the inventory, so the dates cannot be
 * sold twice, but nothing is confirmed until a receipt is approved. The desk
 * can cancel it, which releases the hold.
 *
 * Every number here is derived server-side. The caller chooses a villa, some
 * rooms and dates — nothing else.
 */
create or replace function public.request_booking(
  p_villa_id  uuid,
  p_room_ids  uuid[],
  p_check_in  date,
  p_check_out date,
  p_adults    int,
  p_children  int default 0,
  p_special_requests text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_villa       public.villas%rowtype;
  v_nights      int;
  v_rate        int;
  v_tax         numeric(4,3);
  v_conflicts   text;
  v_booking     public.bookings%rowtype;
  v_capacity    int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Sign in before booking' using errcode = '42501';
  end if;

  -- A guest who signed up without ever having stayed has no customer record
  -- yet. Create one from their account rather than refusing the booking: the
  -- customer row is what every other table hangs off, and requiring an admin
  -- to create it first would put a person in the way of a self-service flow.
  v_customer_id := public.current_customer_id();
  if v_customer_id is null then
    insert into public.customers (name, phone, email, guest_type)
    select
      coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
      '',
      lower(u.email),
      'new'
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
    returning id into v_customer_id;

    update public.profiles set customer_id = v_customer_id where id = auth.uid();
  end if;

  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in' using errcode = '22007';
  end if;
  if p_check_in < current_date then
    raise exception 'That check-in date has already passed' using errcode = '22007';
  end if;
  if p_adults < 1 then
    raise exception 'A booking needs at least one adult' using errcode = '23514';
  end if;

  select * into v_villa from public.villas where id = p_villa_id and status = 'active';
  if v_villa.id is null then
    raise exception 'That villa is not available to book' using errcode = '23503';
  end if;

  v_nights := p_check_out - p_check_in;

  -- The rate comes from the villa or the chosen rooms. Never from the client.
  if v_villa.mode = 'split' then
    if p_room_ids is null or cardinality(p_room_ids) = 0 then
      raise exception 'Choose at least one room' using errcode = '23514';
    end if;
    select coalesce(sum(base_rate), 0), coalesce(sum(capacity), 0)
      into v_rate, v_capacity
    from public.rooms
    where id = any (p_room_ids) and villa_id = p_villa_id;

    if v_rate = 0 then
      raise exception 'Those rooms do not belong to that villa' using errcode = '23503';
    end if;
  else
    v_rate := v_villa.base_rate;
    v_capacity := v_villa.capacity;
  end if;

  if (p_adults + p_children) > v_capacity then
    raise exception 'That sleeps %, and you have asked for %',
      v_capacity, p_adults + p_children using errcode = '23514';
  end if;

  -- Legal GST band follows the tariff (12% up to 7,500 a night, 18% above).
  v_tax := case when v_rate > 7500 then 0.180 else 0.120 end;

  select string_agg(reference, ', ') into v_conflicts
  from public.find_booking_conflicts(
    p_villa_id, case when v_villa.mode = 'split' then p_room_ids else '{}'::uuid[] end,
    p_check_in, p_check_out, null);

  if v_conflicts is not null then
    -- Deliberately does not name the clashing booking: a guest has no business
    -- knowing who else is staying, only that the dates are taken.
    raise exception 'Those dates are no longer available' using errcode = '23P01';
  end if;

  begin
    insert into public.bookings (
      reference, customer_id, villa_id, booking_mode,
      check_in, check_out, adults, children, source,
      status, payment_status, nightly_rate, nights, tax_rate,
      amount_paid, special_requests
    ) values (
      public.next_booking_reference(),
      v_customer_id, p_villa_id, v_villa.mode,
      p_check_in, p_check_out, p_adults, p_children, 'website',
      'pending_payment', 'pending', v_rate, v_nights, v_tax,
      0, left(coalesce(p_special_requests, ''), 1000)
    )
    returning * into v_booking;

    perform public.sync_booking_rooms(
      v_booking.id,
      case when v_villa.mode = 'split' then p_room_ids else null end);
  exception
    when exclusion_violation then
      raise exception 'Those dates were taken a moment ago — please pick others'
        using errcode = '23P01';
  end;

  perform public.notify_staff(
    'booking', 'New booking from the guest portal',
    v_booking.reference || ' - ' || v_villa.name, v_booking.id);

  return v_booking;
end;
$$;

revoke all on function public.request_booking from public, anon;
grant execute on function public.request_booking to authenticated;
