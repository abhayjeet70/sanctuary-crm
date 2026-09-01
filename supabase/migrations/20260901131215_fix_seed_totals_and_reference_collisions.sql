-- I4 — seeded payment_status contradicted the computed balance.
-- I5 — booking references could collide against their unique constraint.

-- ------------------------------------------------------------------- I4 ----
-- HOS-1004 and HOS-1009 were marked 'paid' while still computing to a balance
-- of a few hundred rupees: the fixture amounts were rounded by hand before the
-- tax line existed. Rather than restate the money, settle the two bookings
-- exactly — they are both completed stays, so "paid" is the true state and the
-- amount received is what should move.
update public.bookings b
   set amount_paid = t.total
  from public.booking_totals t
 where t.booking_id = b.id
   and b.payment_status = 'paid'
   and t.balance > 0;

-- Anything still disagreeing is recalculated from the money rather than left
-- to drift. This makes the whole seed obey BR6.
do $$
declare
  r record;
begin
  for r in
    select b.id
    from public.bookings b
    join public.booking_totals t on t.booking_id = b.id
    where (b.payment_status = 'paid'    and t.balance > 0)
       or (b.payment_status = 'partial' and t.balance = 0)
  loop
    perform public.recalculate_payment_status(r.id);
  end loop;
end
$$;

-- ------------------------------------------------------------------- I5 ----
-- Sequential references instead of random digits. Four digits of randomness
-- against a unique constraint is roughly a 1-in-9000 collision per booking,
-- which surfaces as an opaque 23505 in front of the reception desk.
create sequence if not exists public.booking_reference_seq start with 1015;

create or replace function public.next_booking_reference()
returns text
language sql
volatile
as $$
  select 'HOS-' || lpad(nextval('public.booking_reference_seq')::text, 4, '0');
$$;

-- Start the sequence above whatever the seed already used, so the first
-- generated reference cannot clash with HOS-1001..HOS-1014.
select setval(
  'public.booking_reference_seq',
  greatest(
    1015,
    coalesce((
      select max(substring(reference from '\d+')::int)
      from public.bookings
      where reference ~ '^HOS-\d+$'
    ), 1014) + 1
  ),
  false
);

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

  select string_agg(
           reference || ' (' || check_in::text || ' to ' || check_out::text || ')', ', ')
    into v_conflicts
  from public.find_booking_conflicts(p_villa_id, p_room_ids, p_check_in, p_check_out, null);

  if v_conflicts is not null then
    raise exception 'Those dates are already held by %', v_conflicts
      using errcode = '23P01';
  end if;

  v_nights := p_check_out - p_check_in;

  insert into public.bookings (
    reference, customer_id, villa_id, booking_mode,
    check_in, check_out, adults, children, source,
    status, payment_status,
    nightly_rate, nights, discount, tax_rate, amount_paid, special_requests
  ) values (
    public.next_booking_reference(),
    p_customer_id, p_villa_id, v_mode,
    p_check_in, p_check_out, p_adults, p_children, p_source,
    case when p_advance > 0 then 'confirmed' else 'pending_payment' end,
    case when p_advance > 0 then 'partial'   else 'pending' end,
    p_nightly_rate, v_nights, p_discount, p_tax_rate, p_advance, p_special_requests
  )
  returning * into v_booking;

  perform public.sync_booking_rooms(v_booking.id, p_room_ids);

  -- The advance may settle the booking outright; let the money decide (BR6).
  if p_advance > 0 then
    perform public.recalculate_payment_status(v_booking.id);
    select * into v_booking from public.bookings where id = v_booking.id;
  end if;

  return v_booking;
exception
  when exclusion_violation then
    raise exception 'Those dates were taken while you were filling the form — reload and try again'
      using errcode = '23P01';
end;
$$;

-- ------------------------------------------------------------------- I1 ----
-- Reception takes bookings from people who have never stayed before, so the
-- desk needs to create the guest and the booking in one step. Doing it as two
-- client calls would strand a customer row whenever the dates turn out to clash.
create or replace function public.create_booking_with_guest(
  p_name              text,
  p_phone             text,
  p_email             text,
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
  v_customer_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only staff can create bookings' using errcode = '42501';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'The guest needs a name' using errcode = '23514';
  end if;

  -- Returning guests often ring up rather than log in, so match on email or
  -- phone before creating a duplicate customer record.
  select id into v_customer_id
  from public.customers
  where (coalesce(btrim(p_email), '') <> '' and lower(email) = lower(btrim(p_email)))
     or (coalesce(btrim(p_phone), '') <> '' and phone = btrim(p_phone))
  limit 1;

  if v_customer_id is null then
    insert into public.customers (name, phone, email, guest_type)
    values (btrim(p_name), btrim(p_phone), lower(btrim(p_email)), 'new')
    returning id into v_customer_id;
  end if;

  -- Any conflict raised inside here rolls the new customer back with it.
  return public.create_booking(
    v_customer_id, p_villa_id, p_room_ids, p_check_in, p_check_out,
    p_adults, p_children, p_source, p_nightly_rate, p_discount,
    p_tax_rate, p_advance, p_special_requests
  );
end;
$$;

revoke all on function public.create_booking_with_guest from public, anon;
grant execute on function public.create_booking_with_guest to authenticated;

-- ------------------------------------------------------------------- I6 ----
-- Notes were logged by the client, which no longer writes activity rows. A
-- trigger catches them wherever they come from.
create or replace function public.log_booking_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.internal_notes is distinct from old.internal_notes
     and coalesce(new.internal_notes, '') <> '' then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (
      new.id,
      'note',
      'Internal note added',
      -- Only the newly appended part, not the whole accumulated history.
      case
        when old.internal_notes is null then new.internal_notes
        else btrim(replace(new.internal_notes, old.internal_notes, ''))
      end,
      coalesce(auth.email(), 'Staff')
    );
  end if;
  return new;
end;
$$;

create trigger bookings_note_activity_trg
  after update of internal_notes on public.bookings
  for each row execute function public.log_booking_note();
