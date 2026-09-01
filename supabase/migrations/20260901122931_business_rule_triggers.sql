-- Business rules that must hold no matter which client writes.

-- ------------------------------------------------------- role in the JWT ----
-- RLS reads the role from the token rather than joining profiles on every
-- request. This hook keeps the claim in step with the profiles table.
create or replace function public.sync_role_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
     set raw_app_meta_data =
       coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
   where id = new.id;
  return new;
end;
$$;

create trigger profiles_sync_role_claim_trg
  after insert or update of role on public.profiles
  for each row execute function public.sync_role_claim();

-- Convenience readers used throughout the RLS policies.
create or replace function public.current_role_name()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    'guest'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- The customer row behind the signed-in guest. Every guest policy hangs off it.
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select customer_id from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------ new auth user -> profile ---
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  v_role := coalesce(
    (new.raw_app_meta_data ->> 'role')::public.app_role,
    (new.raw_user_meta_data ->> 'role')::public.app_role,
    'guest'
  );

  insert into public.profiles (id, role, full_name, customer_id)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- A guest is matched to their existing customer record by email, so signing
    -- up does not orphan the bookings already taken over the phone.
    (select c.id from public.customers c where lower(c.email) = lower(new.email) limit 1)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------- BR12: billed food -> booking --
-- Moving an order to `billed` folds its value into the booking's food charge,
-- so the invoice and the balance cannot drift from the kitchen board.
create or replace function public.food_order_bill_to_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if new.status = 'billed' and old.status is distinct from 'billed' then
    select coalesce(sum(price * quantity), 0) into v_total
    from public.food_order_lines where order_id = new.id;

    update public.bookings
       set food = food + v_total
     where id = new.booking_id;

    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (new.booking_id, 'food', 'Order billed to the room',
            new.reference || ' — ' || v_total::text, 'Kitchen');

  elsif old.status = 'billed' and new.status is distinct from 'billed' then
    -- Un-billing has to give the money back, or the total silently inflates.
    select coalesce(sum(price * quantity), 0) into v_total
    from public.food_order_lines where order_id = new.id;

    update public.bookings
       set food = greatest(0, food - v_total)
     where id = new.booking_id;
  end if;

  return new;
end;
$$;

create trigger food_orders_bill_trg
  after update of status on public.food_orders
  for each row execute function public.food_order_bill_to_booking();

-- -------------------------------------------- payment status after a write ---
-- Mirrors settledPaymentStatus() in src/services/domain.ts: paying the last
-- rupee settles a booking rather than leaving it on "part paid".
create or replace function public.recalculate_payment_status(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid int;
  v_total int;
begin
  select paid, total into v_paid, v_total
  from public.booking_totals where booking_id = p_booking_id;

  update public.bookings
     set payment_status = case
       when v_paid <= 0     then 'pending'::public.payment_status
       when v_paid >= v_total then 'paid'::public.payment_status
       else 'partial'::public.payment_status
     end
   where id = p_booking_id;
end;
$$;

-- ------------------------------------------------- activity from bookings ----
create or replace function public.log_booking_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (new.id, 'booking', 'Booking created', 'Source: ' || new.source::text, 'System');
  elsif new.status is distinct from old.status then
    insert into public.activity_events (entity_id, kind, title, detail, actor)
    values (new.id, 'booking',
            'Status changed to ' || replace(new.status::text, '_', ' '),
            'From ' || replace(old.status::text, '_', ' '), 'System');
  end if;
  return new;
end;
$$;

create trigger bookings_activity_trg
  after insert or update of status on public.bookings
  for each row execute function public.log_booking_activity();
