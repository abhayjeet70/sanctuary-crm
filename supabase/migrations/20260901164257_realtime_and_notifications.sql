-- L4 — live notifications, and the rows that feed them.
--
-- The tray was a static fixture. Now the events that need someone's attention
-- write a notification row, and Realtime pushes it to whoever is logged in.

-- Realtime respects RLS, so a guest subscribing to `bookings` still only
-- receives their own rows. Adding a table here is not a hole.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.food_orders;
alter publication supabase_realtime add table public.guest_requests;

-- The old-row image is needed for UPDATE payloads to be useful (knowing a
-- status changed *from* something is half the message).
alter table public.notifications  replica identity full;
alter table public.food_orders    replica identity full;
alter table public.guest_requests replica identity full;

/**
 * One place that decides what deserves a notification.
 *
 * Kept deliberately narrow: things a person must act on, not an activity feed.
 * The timeline in activity_events is the audit trail; this is the doorbell.
 */
create or replace function public.notify_staff(
  p_kind   public.activity_kind,
  p_title  text,
  p_detail text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (kind, title, detail, read)
  values (p_kind, p_title, p_detail, false);
$$;

-- A receipt landing in the verification queue.
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
      coalesce(v_guest, 'A guest') || ' - ' || new.amount::text || ' for ' || coalesce(v_ref, ''));
  end if;
  return new;
end;
$$;

create trigger payments_notify_uploaded_trg
  after insert or update of status on public.payments
  for each row execute function public.notify_payment_uploaded();

-- A new kitchen ticket.
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
    new.reference || ' - ' || coalesce(v_villa, 'a villa'));
  return new;
end;
$$;

create trigger food_orders_notify_placed_trg
  after insert on public.food_orders
  for each row execute function public.notify_food_order_placed();

-- A guest asking for something.
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
    replace(new.category::text, '_', ' ') || ' - ' || coalesce(v_villa, 'a villa'));
  return new;
end;
$$;

create trigger guest_requests_notify_raised_trg
  after insert on public.guest_requests
  for each row execute function public.notify_request_raised();

-- Feedback worth reading, i.e. the disappointed kind.
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
      coalesce(v_guest, 'A guest') || ' rated the stay ' || new.rating::text || ' out of 5');
  end if;
  return new;
end;
$$;

create trigger feedback_notify_low_trg
  after insert on public.feedback
  for each row execute function public.notify_low_feedback();

-- Staff need the tray too, not just admins.
drop policy if exists "admins read notifications" on public.notifications;
drop policy if exists "admins update notifications" on public.notifications;

create policy "staff read notifications" on public.notifications
  for select to authenticated using (public.is_staff());
create policy "staff update notifications" on public.notifications
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
