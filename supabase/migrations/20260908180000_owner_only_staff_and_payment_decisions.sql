-- Two things a manager should not hold.
--
-- 1. The roster. Reading who is employed, on what terms, with which emergency
--    contact and ID reference is the owner's business. A manager rosters from
--    the team on each shift, not from personnel records.
--
-- 2. The payment decision. Accepting or refusing money is the classic duty to
--    keep apart from the person who takes the bookings — the same hands
--    creating a booking, discounting it and marking it paid is exactly the
--    arrangement double-entry was invented to prevent.
--
-- Both enforced here, in the database. Hiding a button is not a permission.

-- --------------------------------------------------------------- roster --

drop policy if exists "management reads the roster" on public.employees;

-- "staff read their own record" stays: anyone with a login can see their own
-- row, which is how a person checks the property has their number right.
-- "owners manage employees" already covers the owner for everything else.

-- Pay was owner-only from the start; nothing to change there.

-- ------------------------------------------------------ payment decisions --

create or replace function public.approve_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can approve payments' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = '23503';
  end if;
  if v_payment.status = 'approved' then
    raise exception 'That payment has already been approved' using errcode = '23505';
  end if;

  update public.payments
     set status = 'approved',
         verified_by = auth.uid(),
         verified_at = now(),
         rejection_reason = null,
         rejection_note = null
   where id = p_payment_id
  returning * into v_payment;

  update public.bookings
     set amount_paid = amount_paid + v_payment.amount,
         -- Approving money never drags a stay that has already started back to
         -- "confirmed".
         status = case
           when status in ('pending_payment', 'payment_uploaded', 'inquiry')
             then 'confirmed'::public.booking_status
           else status
         end
   where id = v_payment.booking_id
  returning * into v_booking;

  perform public.recalculate_payment_status(v_payment.booking_id);

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_payment.booking_id, 'payment', 'Payment approved',
          v_payment.reference, coalesce(auth.email(), 'Owner'));

  return v_payment;
end;
$$;

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
  if not public.is_owner() then
    raise exception 'Only the owner can reject payments' using errcode = '42501';
  end if;

  -- BR7: the reason is not optional, and "other" on its own is not a reason.
  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Choosing "other" requires a note explaining what was wrong'
      using errcode = '23514';
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

  -- A stay under way stays under way; refusing a receipt is a money decision,
  -- not a reason to un-arrive someone who is in the house.
  if v_booking.status in ('inquiry', 'pending_payment', 'payment_uploaded', 'payment_approved') then
    update public.bookings set status = 'pending_payment' where id = v_booking.id;
  end if;

  perform public.recalculate_payment_status(v_payment.booking_id);

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_payment.booking_id, 'payment', 'Payment rejected',
          coalesce(p_note, replace(p_reason::text, '_', ' ')),
          coalesce(auth.email(), 'Owner'));

  return v_payment;
end;
$$;

revoke all on function public.approve_payment from public, anon;
revoke all on function public.reject_payment  from public, anon;
grant execute on function public.approve_payment to authenticated;
grant execute on function public.reject_payment  to authenticated;
