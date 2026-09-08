-- Three things a live booking exposed.
--
-- 1. A booking raised no invoice. Numbers only ever came from the Invoices
--    screen, so reception taking a stay over the phone produced a guest who
--    owed money and had nothing to pay against. Every stay now gets one.
--
-- 2. Nothing reached the guest. Confirming a booking or accepting a payment
--    wrote a staff notification and stopped there.
--
-- 3. The kitchen took orders from anyone. A guest whose stay ended in July
--    could order dinner in September, and the ticket would print.

-- ================================================================ numbering ==
-- Lifted out of create_invoice so the trigger below allocates numbers the same
-- way. A sequence rather than max(n)+1: two bookings taken in the same second
-- must not land on one number.

create or replace function public.next_invoice_number()
returns text
language sql
as $$
  select coalesce(
           (select invoice_prefix from public.property_settings limit 1),
           'HOS')
         || '/' || public.financial_year()
         || '/' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;

create or replace function public.create_invoice(p_booking_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  rate numeric(4,3);
  result public.invoices;
begin
  if not public.is_admin() then
    raise exception 'Only staff can raise an invoice' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.invoices where booking_id = p_booking_id) then
    raise exception 'That booking already has an invoice.' using errcode = 'unique_violation';
  end if;

  select b.tax_rate into rate from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'No such booking.' using errcode = 'no_data_found';
  end if;

  insert into public.invoices (number, booking_id, issued_at, tax_rate, status)
  values (public.next_invoice_number(), p_booking_id, current_date, coalesce(rate, 0.180), 'draft')
  returning * into result;

  return result;
end;
$$;

-- ========================================================== invoice on book ==

/**
 * Every stay carries an invoice, from the moment it is taken.
 *
 * Draft while the booking is still an enquiry or awaiting money — that is the
 * property's working copy and the guest cannot see it. It issues itself the
 * moment the booking is confirmed, which is also what tells the guest.
 *
 * Deliberately silent on failure paths that are not errors: a cancelled
 * booking gets nothing, and an existing invoice is never duplicated.
 */
create or replace function public.ensure_booking_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settled boolean;
  v_existing public.invoices%rowtype;
begin
  -- Nothing owed on a stay that was never taken.
  if new.status in ('cancelled', 'rejected', 'no_show', 'inquiry') then
    return new;
  end if;

  -- Confirmed or beyond means the guest is coming and the money is real.
  v_settled := new.status in
    ('payment_approved', 'confirmed', 'checked_in', 'in_house', 'checked_out', 'completed');

  select * into v_existing from public.invoices where booking_id = new.id limit 1;

  if not found then
    insert into public.invoices (number, booking_id, issued_at, tax_rate, status)
    values (
      public.next_invoice_number(),
      new.id,
      current_date,
      coalesce(new.tax_rate, 0.180),
      case when v_settled then 'issued' else 'draft' end
    );
  elsif v_settled and v_existing.status = 'draft' then
    -- Confirming the booking publishes the invoice that was waiting.
    update public.invoices set status = 'issued' where id = v_existing.id;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_ensure_invoice_trg on public.bookings;
create trigger bookings_ensure_invoice_trg
  after insert or update of status on public.bookings
  for each row execute function public.ensure_booking_invoice();

-- ====================================================== telling the guest ==

create or replace function public.notify_guest_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_villa text;
  v_balance int;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select name into v_villa from public.villas where id = new.villa_id;
  select balance into v_balance from public.booking_totals where booking_id = new.id;

  if new.status = 'confirmed' then
    perform public.notify_guest(
      new.id, 'booking', 'Your booking is confirmed',
      coalesce(v_villa, 'Your villa') || ', ' || to_char(new.check_in, 'DD Mon') || ' to ' ||
        to_char(new.check_out, 'DD Mon') || '. ' ||
        case when coalesce(v_balance, 0) > 0
             then 'Balance ' || v_balance || ' — pay and upload your receipt.'
             else 'Paid in full. We look forward to having you.' end);

  elsif new.status = 'pending_payment' and tg_op = 'INSERT' then
    perform public.notify_guest(
      new.id, 'booking', 'Your booking is held',
      coalesce(v_villa, 'Your villa') || ', ' || to_char(new.check_in, 'DD Mon') || ' to ' ||
        to_char(new.check_out, 'DD Mon') ||
        '. Pay to confirm it, then upload your receipt.');

  elsif new.status = 'cancelled' then
    perform public.notify_guest(
      new.id, 'booking', 'Your booking was cancelled',
      coalesce(v_villa, 'Your villa') || ', ' || to_char(new.check_in, 'DD Mon') ||
        '. Talk to us if this is unexpected.');
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_notify_guest_trg on public.bookings;
create trigger bookings_notify_guest_trg
  after insert or update of status on public.bookings
  for each row execute function public.notify_guest_booking();

/**
 * The payment decision, told to the person who is waiting for it.
 *
 * The staff notification for an uploaded receipt already exists; this is the
 * other half of that conversation.
 */
create or replace function public.notify_guest_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    perform public.notify_guest(
      new.booking_id, 'payment', 'Payment received',
      'We have confirmed ' || new.amount || '. Thank you.');

  elsif new.status = 'rejected' then
    perform public.notify_guest(
      new.booking_id, 'payment', 'We could not accept that receipt',
      coalesce(new.rejection_note, replace(new.rejection_reason::text, '_', ' '),
               'Please check it and upload again.'));
  end if;

  return new;
end;
$$;

drop trigger if exists payments_notify_guest_trg on public.payments;
create trigger payments_notify_guest_trg
  after insert or update of status on public.payments
  for each row execute function public.notify_guest_payment();

-- ==================================================== the dining window ==

/**
 * True while a guest may order from the kitchen against this booking.
 *
 * The day of arrival through the day of departure, inclusive: breakfast on
 * check-out morning is a real order. Anything outside that is not — the
 * kitchen would cook for someone who is not in the house.
 */
create or replace function public.can_order_food(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and b.status in ('confirmed', 'checked_in', 'in_house')
      and current_date >= b.check_in
      and current_date <= b.check_out
  );
$$;

grant execute on function public.can_order_food(uuid) to authenticated;

-- The rule belongs here, not only in the page. A guest who kept the tab open
-- past check-out, or who posts straight to the API, is refused the same way.
drop policy if exists "guests place own orders" on public.food_orders;
create policy "guests place own orders" on public.food_orders
  for insert to authenticated
  with check (
    status = 'placed'
    and customer_id = public.current_customer_id()
    and exists (
      select 1 from public.bookings b
      where b.id = food_orders.booking_id
        and b.customer_id = public.current_customer_id()
    )
    and public.can_order_food(food_orders.booking_id)
  );

-- ======================================================== catching up ==
-- The bookings taken before this trigger existed have no invoice. They are
-- real stays with real money against them, so they get one now, at the status
-- the booking has already reached.

insert into public.invoices (number, booking_id, issued_at, tax_rate, status)
select
  public.next_invoice_number(),
  b.id,
  current_date,
  coalesce(b.tax_rate, 0.180),
  case
    when b.status in ('payment_approved', 'confirmed', 'checked_in',
                      'in_house', 'checked_out', 'completed')
      then 'issued'::public.invoice_status
    else 'draft'::public.invoice_status
  end
from public.bookings b
where b.status not in ('cancelled', 'rejected', 'no_show', 'inquiry')
  and not exists (select 1 from public.invoices i where i.booking_id = b.id);
