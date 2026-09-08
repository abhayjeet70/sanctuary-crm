-- Rejecting a receipt threw a guest out of their own stay.
--
-- reject_payment set the booking to 'pending_payment' and 'rejected'
-- unconditionally. So a guest already checked in, who uploaded one bad
-- receipt for an extra, was dragged back to "awaiting payment": the check-in
-- undone, the arrival gone from the board, and — since today — the kitchen
-- closed on them mid-stay.
--
-- approve_payment already guards the same edge ("approving money never drags a
-- stay that has already started back to confirmed"). The rejection path was
-- simply never given the matching care.
--
-- Two corrections:
--   1. Only a booking that has not yet started goes back to pending_payment.
--   2. payment_status is recomputed from the money that is actually approved,
--      not stamped 'rejected'. A booking with an approved advance and one bad
--      receipt is still part paid.

create or replace function public.reject_payment(
  p_payment_id uuid,
  p_reason     public.payment_rejection_reason,
  p_note       text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can reject payments' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = '23503';
  end if;
  if v_payment.status = 'approved' then
    raise exception 'That payment has already been approved' using errcode = '23505';
  end if;

  update public.payments
     set status = 'rejected',
         rejection_reason = p_reason,
         rejection_note = p_note,
         verified_by = auth.uid(),
         verified_at = now()
   where id = p_payment_id
  returning * into v_payment;

  select * into v_booking from public.bookings where id = v_payment.booking_id;

  -- A stay that is under way stays under way. Refusing a receipt is a money
  -- decision, not a reason to un-arrive someone who is in the house.
  if v_booking.status in ('inquiry', 'pending_payment', 'payment_uploaded', 'payment_approved') then
    update public.bookings set status = 'pending_payment' where id = v_booking.id;
  end if;

  -- Recomputed, never assumed: money already approved is still received.
  perform public.recalculate_payment_status(v_payment.booking_id);

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_payment.booking_id, 'payment', 'Payment rejected',
          coalesce(p_note, replace(p_reason::text, '_', ' ')),
          coalesce(auth.email(), 'Staff'));

  return v_payment;
end;
$$;

revoke all on function public.reject_payment from public, anon;
grant execute on function public.reject_payment to authenticated;
