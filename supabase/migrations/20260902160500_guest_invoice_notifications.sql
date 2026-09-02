-- Guest invoice notifications.
--
-- The notifications table only had staff visibility. Guests now need to be
-- told when their invoice is ready — so they can view it in their portal
-- and download it.
--
-- Design:
--   1. Add target_user_id so a notification can be scoped to one person
--      (admin/staff notifications remain null = everyone with is_staff()).
--   2. Give guests read access to their own notifications.
--   3. Fire a trigger when an invoice moves from draft → issued.
--   4. Add invoices to the Realtime publication so guests see the bell
--      light up without a page refresh.

-- ---------------------------------------------------------------- schema --

alter table public.notifications
  add column if not exists target_user_id uuid references auth.users(id);

comment on column public.notifications.target_user_id is
  'When set, only this user can see the notification. Null = all staff.';

-- ------------------------------------------------------------------ RLS --

-- Guests read only notifications addressed to them.
create policy "guests read own notifications" on public.notifications
  for select to authenticated
  using (target_user_id = auth.uid());

-- ---------------------------------------------------------------- trigger --

create or replace function public.notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number   text;
  v_ref      text;
  v_user_id  uuid;
begin
  -- Only fire when status transitions to 'issued' (not on re-saves)
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then

    v_number := new.number;

    -- Resolve booking reference and the auth user for this guest
    select b.reference, p.id
      into v_ref, v_user_id
      from public.bookings b
      join public.customers c on c.id = b.customer_id
      join public.profiles p  on p.email = c.email
     where b.id = new.booking_id
     limit 1;

    -- Notify the specific guest (target_user_id scopes it)
    insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
    values (
      'invoice',
      'Invoice received',
      'Your invoice ' || coalesce(v_number, '') || ' is ready for ' || coalesce(v_ref, 'your booking') || '. Tap to view and download.',
      false,
      new.booking_id,
      v_user_id
    );
  end if;
  return new;
end;
$$;

create trigger invoices_notify_issued_trg
  after insert or update of status on public.invoices
  for each row execute function public.notify_invoice_issued();

-- ---------------------------------------------------------------- realtime --
-- Invoices already have RLS; subscribing to them is not a hole.
-- The "draft" filter keeps guest clients from polling a draft they cannot
-- see anyway — RLS handles it, but skipping the realtime subscription for
-- drafts is cleaner.

alter publication supabase_realtime add table public.invoices;
