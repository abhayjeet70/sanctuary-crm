-- Found by the QA pass of 26 Sept.
--
-- 1. A processed full refund left the booking saying "partial" with the whole
--    amount still "paid". process_refund flipped the PAYMENT rows to refunded,
--    which fired recalculate_payment_status, which — knowing nothing about
--    refunds — reset the booking to partial. The guest's booking page and the
--    admin's would both have shown money that had already gone back.
--
-- 2. recalculate_payment_status ran on cancelled bookings too, so any later
--    touch of a payment row could undo whatever a cancellation had set.
--
-- 3. One booking cancelled before refunds were tracked (HOS-1010) has a refunded
--    payment but no refund record, so the Cancellations page and the Bookings
--    report could not see it. Backfilled from its own payments.
--
-- 4. Payment labels that disagree with the money: bookings marked "paid" whose
--    balance is not zero. The label is derived state, so it is recomputed; no
--    amount is changed.

-- ------------------------------------------------ 2. leave closed bookings alone
create or replace function public.recalculate_payment_status(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_paid int;
  v_total int;
  v_status public.booking_status;
begin
  select status into v_status from public.bookings where id = p_booking_id;
  -- A closed booking's payment state is set by what closed it (a cancellation,
  -- a refund), not by re-adding up receipts.
  if v_status in ('cancelled', 'rejected', 'no_show') then return; end if;

  select paid, total into v_paid, v_total
  from public.booking_totals where booking_id = p_booking_id;

  update public.bookings
     set payment_status = case
       when v_paid <= 0       then 'pending'::public.payment_status
       when v_paid >= v_total then 'paid'::public.payment_status
       else 'partial'::public.payment_status
     end
   where id = p_booking_id;
end;
$$;

-- --------------------------------------------------- 1. a full refund says so
create or replace function public.process_refund(
  p_refund_id uuid,
  p_method    text,
  p_reference text default '',
  p_note      text default ''
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.refunds%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can record a refund' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_method, ''))) = 0 then
    raise exception 'Say how it was sent' using errcode = '23514';
  end if;

  update public.refunds
     set status = 'processed', processed_at = now(), processed_by = auth.uid(),
         method = trim(p_method), reference = trim(coalesce(p_reference, '')),
         note = trim(coalesce(p_note, ''))
   where id = p_refund_id and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'That refund is not waiting to be paid' using errcode = '23514';
  end if;

  -- A full refund reverses the receipts it came from, and the booking says so.
  -- Order matters: the payment update runs the recalculation first, and the
  -- booking's label is set after it.
  if v_row.refund_amount >= v_row.amount_paid and v_row.amount_paid > 0 then
    update public.payments set status = 'refunded'
     where booking_id = v_row.booking_id and status = 'approved';
    update public.bookings set payment_status = 'refunded' where id = v_row.booking_id;
  end if;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_row.booking_id, 'payment', 'Refund sent',
          '₹' || v_row.refund_amount || ' by ' || v_row.method ||
            case when v_row.reference <> '' then ' · ' || v_row.reference else '' end,
          'Staff');

  return v_row;
end;
$$;

revoke all on function public.process_refund(uuid, text, text, text) from public, anon;
grant execute on function public.process_refund(uuid, text, text, text) to authenticated;

-- ------------------------------------- 3. cancellations that predate refunds
insert into public.refunds (
  booking_id, customer_id, amount_paid, refund_percent, refund_amount, retained,
  days_before, fee_waived, policy, status, reason, cancelled_by_role, cancelled_at,
  processed_at, method, note
)
select
  b.id, b.customer_id,
  paid.total,
  case when paid.total = 0 then 0 else round(100.0 * paid.refunded / paid.total)::int end,
  paid.refunded,
  paid.total - paid.refunded,
  greatest(0, b.check_in - b.created_at::date),
  false,
  '{"legacy": true}'::jsonb,
  case when paid.refunded > 0 then 'processed' when paid.total > 0 then 'pending' else 'not_due' end,
  'Recorded from the payments, before refunds were tracked',
  'admin',
  b.created_at,
  case when paid.refunded > 0 then b.created_at end,
  case when paid.refunded > 0 then 'Not recorded' end,
  'Backfilled by the 26 Sept QA pass'
from public.bookings b
cross join lateral (
  select coalesce(sum(p.amount) filter (where p.status in ('approved', 'refunded')), 0)::int as total,
         coalesce(sum(p.amount) filter (where p.status = 'refunded'), 0)::int as refunded
  from public.payments p where p.booking_id = b.id
) paid
where b.status = 'cancelled'
  and not exists (select 1 from public.refunds r where r.booking_id = b.id);

-- ----------------------------------------- 4. labels that contradict the money
-- Only bookings still open. Derived state, recomputed the way approve_payment
-- would have; nothing about what was received changes.
select public.recalculate_payment_status(t.booking_id)
from public.booking_totals t
join public.bookings b on b.id = t.booking_id
where b.status not in ('cancelled', 'rejected', 'no_show', 'inquiry')
  and ((b.payment_status = 'paid' and t.balance > 0)
    or (b.payment_status = 'pending' and t.paid > 0));
