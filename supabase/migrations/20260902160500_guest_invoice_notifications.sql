-- Guest notifications.
--
-- The notifications table only ever spoke to staff. A guest needs telling when
-- their invoice is ready, when their payment is accepted, and when their
-- booking is confirmed — the same doorbell, addressed to one person.
--
--   1. target_user_id scopes a notification to one account.
--      Null still means "every member of staff".
--   2. Guests read only what is addressed to them, and staff stop seeing
--      guest mail — otherwise the admin tray fills with messages meant for
--      someone else.
--   3. notify_guest() resolves a customer to their login. The link is
--      profiles.customer_id; there is no email column on profiles, and
--      matching on address would break the moment reception corrected a typo.

-- ---------------------------------------------------------------- schema --

alter table public.notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade;

comment on column public.notifications.target_user_id is
  'When set, only this user sees the notification. Null = all staff.';

create index if not exists notifications_target_idx
  on public.notifications (target_user_id);

-- ------------------------------------------------------------------- RLS --

create policy "guests read own notifications" on public.notifications
  for select to authenticated
  using (target_user_id = auth.uid());

create policy "guests mark own notifications read" on public.notifications
  for update to authenticated
  using (target_user_id = auth.uid())
  with check (target_user_id = auth.uid());

-- Staff read the unaddressed ones. Without this an admin would see every
-- guest's mail in their own tray.
drop policy if exists "admins read notifications" on public.notifications;
create policy "admins read staff notifications" on public.notifications
  for select to authenticated
  using (public.is_admin() and target_user_id is null);

drop policy if exists "admins update notifications" on public.notifications;
create policy "admins update staff notifications" on public.notifications
  for update to authenticated
  using (public.is_admin() and target_user_id is null)
  with check (public.is_admin() and target_user_id is null);

-- --------------------------------------------------------------- helpers --

/**
 * Notify the guest who owns a booking, if they have an account.
 *
 * Silent when they have none: a booking taken over the phone belongs to
 * someone who may never sign in, and that is not an error.
 */
create or replace function public.notify_guest(
  p_booking_id uuid,
  p_kind       public.activity_kind,
  p_title      text,
  p_detail     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select p.id into v_user_id
  from public.bookings b
  join public.profiles p on p.customer_id = b.customer_id
  where b.id = p_booking_id
    and p.role = 'guest'
  limit 1;

  if v_user_id is null then return; end if;

  insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
  values (p_kind, p_title, p_detail, false, p_booking_id, v_user_id);
end;
$$;

-- --------------------------------------------------------------- trigger --

create or replace function public.notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  -- Only on the transition into 'issued'. A draft is the property's working
  -- copy; re-saving an issued invoice must not ring the bell again.
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    select b.reference into v_ref from public.bookings b where b.id = new.booking_id;

    perform public.notify_guest(
      new.booking_id,
      'invoice',
      'Your invoice is ready',
      'Invoice ' || new.number || ' for ' || coalesce(v_ref, 'your stay') ||
        '. Open it to view, print or pay the balance.');
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify_issued_trg on public.invoices;
create trigger invoices_notify_issued_trg
  after insert or update of status on public.invoices
  for each row execute function public.notify_invoice_issued();

-- -------------------------------------------------------------- realtime --
-- Invoices carry RLS, so a guest subscribing still receives only their own
-- issued rows. Adding the table is not a hole.
do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception when duplicate_object then null;
end $$;
