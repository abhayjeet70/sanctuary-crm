-- Cancellation policy, cancelling, and the money that goes back.
--
-- One rule above the others: the SERVER decides the refund. The guest's warning
-- and the staff dialog both ask cancellation_quote(); cancel_booking()
-- recomputes it and stores a snapshot of the policy it used, so changing the
-- policy next month never rewrites what a guest was promised today.

-- ------------------------------------------------------------------ policy --
alter table public.property_settings
  add column if not exists cancellation_free      boolean not null default false,
  add column if not exists cancellation_free_days int     not null default 15
    check (cancellation_free_days >= 0),
  -- [{ "days": 10, "refundPercent": 50 }, { "days": 0, "refundPercent": 0 }]
  -- Read top-down by days: cancelled at least `days` before check-in earns that
  -- percentage. Below the last row the refund is nothing.
  add column if not exists cancellation_tiers     jsonb   not null default
    '[{"days":10,"refundPercent":50},{"days":0,"refundPercent":0}]'::jsonb,
  add column if not exists cancellation_note      text    not null default '';

-- A villa may carry its own policy. Null means "use the property's", which is
-- the common case, so nothing has to be copied to three villas and kept in step.
-- Shape: {"free": bool, "freeDays": int, "tiers": [...], "note": text}
alter table public.villas
  add column if not exists cancellation_policy jsonb;

-- The policy that actually governs a villa: its own, else the property's.
create or replace function public.effective_cancellation_policy(p_villa_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select v.cancellation_policy from public.villas v where v.id = p_villa_id),
    (select jsonb_build_object(
        'free', s.cancellation_free,
        'freeDays', s.cancellation_free_days,
        'tiers', s.cancellation_tiers,
        'note', s.cancellation_note)
       from public.property_settings s where s.id)
  );
$$;

grant execute on function public.effective_cancellation_policy(uuid) to anon, authenticated;

-- The pre-login booking popup prints the terms on each villa card.
create or replace function public.public_stay_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trading_name', trading_name,
    'legal_name', legal_name,
    'address_line1', address_line1,
    'city', city,
    'state', state,
    'contact_phone', contact_phone,
    'contact_email', contact_email,
    'website', website,
    'instagram', instagram,
    'dining_menu', dining_menu,
    'addons', addons,
    'stay_terms', stay_terms,
    'booking_policy', booking_policy,
    'pet_policy', pet_policy,
    'important_info', important_info,
    'breakfast_line', breakfast_line,
    'cancellation_free', cancellation_free,
    'cancellation_free_days', cancellation_free_days,
    'cancellation_tiers', cancellation_tiers,
    'cancellation_note', cancellation_note
  )
  from public.property_settings
  where id;
$$;

-- ----------------------------------------------------------------- refunds --
create table if not exists public.refunds (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.bookings (id) on delete cascade,
  customer_id    uuid not null references public.customers (id) on delete restrict,

  amount_paid    int  not null check (amount_paid >= 0),
  refund_percent int  not null check (refund_percent between 0 and 100),
  refund_amount  int  not null check (refund_amount >= 0),
  -- What the property keeps: paid - refunded. Cancellation income, never room revenue.
  retained       int  not null check (retained >= 0),
  days_before    int  not null,
  fee_waived     boolean not null default false,
  policy         jsonb not null,

  status         text not null default 'pending'
                 check (status in ('not_due', 'pending', 'processed')),
  reason         text not null default '',
  cancelled_by   uuid references auth.users (id),
  cancelled_by_role text not null check (cancelled_by_role in ('guest', 'admin')),
  cancelled_at   timestamptz not null default now(),

  processed_at   timestamptz,
  processed_by   uuid references auth.users (id),
  method         text,
  reference      text,
  note           text
);
create index if not exists refunds_status_idx on public.refunds (status);
create index if not exists refunds_customer_idx on public.refunds (customer_id);

alter table public.refunds enable row level security;

drop policy if exists "staff read refunds" on public.refunds;
create policy "staff read refunds" on public.refunds
  for select to authenticated using (public.is_admin());

drop policy if exists "guests read their own refunds" on public.refunds;
create policy "guests read their own refunds" on public.refunds
  for select to authenticated using (customer_id = public.current_customer_id());
-- No insert/update/delete policy on purpose: only the functions below write.

-- ------------------------------------------------------------------- quote --
create or replace function public.cancellation_quote(
  p_booking_id uuid,
  p_on         date default current_date
)
returns table (
  days_before    int,
  refund_percent int,
  amount_paid    int,
  refund_amount  int,
  retained       int,
  is_free        boolean,
  can_cancel     boolean,
  blocked_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b        public.bookings%rowtype;
  v_pol    jsonb;
  v_days   int;
  v_pct    int := 0;
  v_tier   jsonb;
  v_free   boolean := false;
  v_paid   int;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;
  if not public.is_admin() and b.customer_id is distinct from public.current_customer_id() then
    raise exception 'Not your booking' using errcode = '42501';
  end if;

  v_pol  := public.effective_cancellation_policy(b.villa_id);
  v_days := b.check_in - p_on;
  v_paid := b.amount_paid;

  if coalesce((v_pol->>'free')::boolean, false)
     and v_days >= coalesce((v_pol->>'freeDays')::int, 0) then
    v_pct := 100;
    v_free := true;
  else
    -- Highest threshold first; the first tier the guest clears wins.
    for v_tier in
      select t from jsonb_array_elements(coalesce(v_pol->'tiers', '[]'::jsonb)) t
      order by (t->>'days')::int desc
    loop
      if v_days >= (v_tier->>'days')::int then
        v_pct := (v_tier->>'refundPercent')::int;
        exit;
      end if;
    end loop;
  end if;

  return query select
    v_days,
    v_pct,
    v_paid,
    (round(v_paid * v_pct / 100.0))::int,
    v_paid - (round(v_paid * v_pct / 100.0))::int,
    v_free,
    b.status in ('inquiry', 'pending_payment', 'payment_uploaded', 'payment_approved', 'confirmed'),
    case
      when b.status in ('checked_in', 'in_house') then 'The stay has already started.'
      when b.status in ('checked_out', 'completed') then 'The stay is over.'
      when b.status in ('cancelled', 'rejected', 'no_show') then 'This booking is already closed.'
      else null
    end;
end;
$$;

grant execute on function public.cancellation_quote(uuid, date) to authenticated;

-- ------------------------------------------------------------------ cancel --
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason     text default '',
  p_waive_fee  boolean default false
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.bookings%rowtype;
  q       record;
  v_admin boolean := public.is_admin();
  v_pct   int;
  v_refund int;
  v_row   public.refunds%rowtype;
  v_guest text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;
  if not v_admin and b.customer_id is distinct from public.current_customer_id() then
    raise exception 'Only the booking holder or staff can cancel' using errcode = '42501';
  end if;
  if p_waive_fee and not v_admin then
    raise exception 'Only staff can waive the fee' using errcode = '42501';
  end if;

  select * into q from public.cancellation_quote(p_booking_id);
  if not q.can_cancel then
    raise exception '%', coalesce(q.blocked_reason, 'This booking cannot be cancelled')
      using errcode = '23514';
  end if;

  v_pct := case when p_waive_fee then 100 else q.refund_percent end;
  v_refund := case when p_waive_fee then q.amount_paid else q.refund_amount end;

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  insert into public.refunds (
    booking_id, customer_id, amount_paid, refund_percent, refund_amount, retained,
    days_before, fee_waived, policy, status, reason, cancelled_by, cancelled_by_role
  ) values (
    p_booking_id, b.customer_id, q.amount_paid, v_pct, v_refund, q.amount_paid - v_refund,
    q.days_before, p_waive_fee,
    public.effective_cancellation_policy(b.villa_id),
    case when v_refund > 0 then 'pending' else 'not_due' end,
    coalesce(trim(p_reason), ''), auth.uid(), case when v_admin then 'admin' else 'guest' end
  )
  returning * into v_row;

  select name into v_guest from public.customers where id = b.customer_id;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (
    p_booking_id, 'booking', 'Booking cancelled',
    b.reference || ' — refund ₹' || v_refund || ' of ₹' || q.amount_paid ||
      ' (' || v_pct || '%)' || case when p_reason <> '' then '. ' || p_reason else '' end,
    case when v_admin then 'Staff' else coalesce(v_guest, 'Guest') end
  );

  perform public.notify_staff(
    'booking',
    'Booking cancelled — ' || b.reference,
    coalesce(v_guest, 'A guest') || ' · ' ||
      case when v_refund > 0 then '₹' || v_refund || ' to refund' else 'no refund due' end,
    p_booking_id
  );

  return v_row;
end;
$$;

grant execute on function public.cancel_booking(uuid, text, boolean) to authenticated;

-- ----------------------------------------------------------- pay it back --
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

  -- A full refund reverses the receipts it came from.
  if v_row.refund_amount >= v_row.amount_paid then
    update public.payments set status = 'refunded'
     where booking_id = v_row.booking_id and status = 'approved';
  end if;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_row.booking_id, 'payment', 'Refund sent',
          '₹' || v_row.refund_amount || ' by ' || v_row.method ||
            case when v_row.reference <> '' then ' · ' || v_row.reference else '' end,
          'Staff');

  return v_row;
end;
$$;

grant execute on function public.process_refund(uuid, text, text, text) to authenticated;
