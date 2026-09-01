-- Two fixes.
--
-- 1. A notification says what happened but not where. Clicking one should open
--    the thing it is about, which means it has to carry an id.
--
-- 2. The seeded payments have no receipt_path, so three of the four rows in the
--    verification queue render "Receipt unavailable". Nothing is wrong with
--    them — the column was simply never populated when receipts moved from
--    inline URLs to storage paths. A queue that looks broken teaches the desk
--    to ignore the warning, which is worse than the missing image.

-- ---------------------------------------------------------------- targets --
alter table public.notifications
  add column if not exists entity_id uuid;

comment on column public.notifications.entity_id is
  'The booking, order or request this is about, so the tray can link to it.';

-- Rewrite the notifier to carry the id through.
create or replace function public.notify_staff(
  p_kind      public.activity_kind,
  p_title     text,
  p_detail    text,
  p_entity_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (kind, title, detail, read, entity_id)
  values (p_kind, p_title, p_detail, false, p_entity_id);
$$;

create or replace function public.notify_payment_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text;
  v_ref   text;
begin
  if new.status = 'uploaded' and (tg_op = 'INSERT' or old.status is distinct from 'uploaded') then
    select c.name, b.reference into v_guest, v_ref
    from public.bookings b join public.customers c on c.id = b.customer_id
    where b.id = new.booking_id;

    perform public.notify_staff(
      'payment', 'Payment uploaded',
      coalesce(v_guest, 'A guest') || ' - ' || new.amount::text || ' for ' || coalesce(v_ref, ''),
      new.booking_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_food_order_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_villa text;
begin
  select name into v_villa from public.villas where id = new.villa_id;
  perform public.notify_staff(
    'food', 'New kitchen order',
    new.reference || ' - ' || coalesce(v_villa, 'a villa'),
    new.id);
  return new;
end;
$$;

create or replace function public.notify_request_raised()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_villa text;
begin
  select name into v_villa from public.villas where id = new.villa_id;
  perform public.notify_staff(
    'request',
    case when new.priority = 'urgent' then 'Urgent guest request' else 'New guest request' end,
    replace(new.category::text, '_', ' ') || ' - ' || coalesce(v_villa, 'a villa'),
    new.id);
  return new;
end;
$$;

create or replace function public.notify_low_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text;
begin
  if new.rating <= 3 then
    select name into v_guest from public.customers where id = new.customer_id;
    perform public.notify_staff(
      'feedback', 'Feedback needs a reply',
      coalesce(v_guest, 'A guest') || ' rated the stay ' || new.rating::text || ' out of 5',
      new.booking_id);
  end if;
  return new;
end;
$$;

-- Backfill what is already in the tray, by matching the reference in the text.
update public.notifications n
   set entity_id = b.id
  from public.bookings b
 where n.entity_id is null
   and n.kind in ('payment', 'booking', 'feedback')
   and n.detail like '%' || b.reference || '%';

update public.notifications n
   set entity_id = o.id
  from public.food_orders o
 where n.entity_id is null
   and n.kind = 'food'
   and n.detail like '%' || o.reference || '%';

-- --------------------------------------------------------- seed receipts --
-- Placeholder images, so the queue shows a receipt to look at. The viewer
-- passes a full URL through untouched; real uploads are storage paths.
update public.payments p
   set receipt_path = 'https://picsum.photos/seed/receipt-' || left(p.id::text, 8) || '/900/1300'
 where p.receipt_path is null
   and p.status in ('uploaded', 'approved', 'rejected', 'refunded');
