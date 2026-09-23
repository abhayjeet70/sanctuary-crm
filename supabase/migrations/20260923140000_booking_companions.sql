-- The other people on the booking.
--
-- A group of eight arrives on one reservation and one person's phone. Today
-- that person relays every order and every towel request, and the kitchen has
-- no idea which of the eight cannot eat peanuts.
--
-- ── What a companion is, and is not ──────────────────────────────────────
-- Not a customer: the customer row is the financial party, and duplicating
-- seven of them per booking would corrupt spend, history and the guest list.
-- Not a global role either — "companion" is meaningless without a booking.
--
-- A companion is a BOOKING-SCOPED IDENTITY: a person, a login, and a window
-- of time. They can act on exactly one booking and only while that booking is
-- live. Everything else follows from that one sentence.
--
-- ── On the login ─────────────────────────────────────────────────────────
-- Real Supabase Auth, provisioned the way this project already provisions its
-- demo logins: an auth.users row with a bcrypt hash from pgcrypto and the
-- identity row GoTrue needs. The password is generated here, returned once,
-- and never stored — the column does not exist. The "Guest ID" the guest
-- types is mapped to the account's address by the sign-in form; there is no
-- second authentication system anywhere in this.

create type public.companion_relationship as enum (
  'family',
  'friend',
  'colleague',
  'child',
  'other'
);

create table public.booking_companions (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete cascade,

  full_name     text not null check (length(trim(full_name)) > 1),
  phone         text not null default '',
  email         text not null default '',
  relationship  public.companion_relationship not null default 'other',
  -- Counts against the booking's children rather than its adults. The booking
  -- sold a number of each, and the check below honours that.
  is_child      boolean not null default false,

  -- What the guest is told to type. Unique across the property and readable
  -- down a phone line: no O/0 or I/1.
  guest_code    text not null unique,
  -- Their login. Null would mean a companion recorded but never given access,
  -- which is a state worth allowing.
  profile_id    uuid unique references public.profiles (id) on delete set null,

  -- Revocation is a fact with a time, not a flag. "When did we cut this off"
  -- is a question somebody will ask.
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,

  added_by      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index booking_companions_booking_idx on public.booking_companions (booking_id);
create index booking_companions_profile_idx on public.booking_companions (profile_id);

comment on table public.booking_companions is
  'People staying on somebody else''s booking. A booking-scoped identity with a login and an expiry, never a customer.';

-- --------------------------------------------------------------- helpers --

/**
 * The companion row for whoever is asking, if they are one.
 *
 * Null for the primary guest, for staff and for anonymous callers — which is
 * what makes every policy below read as "or they are the companion".
 */
create or replace function public.current_companion_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.booking_companions where profile_id = auth.uid();
$$;

/**
 * Whether a companion's access is live *right now*.
 *
 * Four conditions, and the last is the one that matters: access ends at the
 * stay's actual departure hour, not when somebody remembers to press
 * "checked out". A booking left in `in_house` for a week does not keep seven
 * strangers inside the portal.
 *
 * The property runs on IST, so the comparison is made there rather than in
 * whatever zone the server happens to think in.
 */
create or replace function public.companion_access_is_live(p_companion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.booking_companions c
    join public.bookings b on b.id = c.booking_id
    where c.id = p_companion_id
      and c.revoked_at is null
      and b.status not in ('cancelled', 'rejected', 'no_show')
      and (now() at time zone 'Asia/Kolkata')
          < (b.check_out + coalesce(b.check_out_time, '11:00'::time) + interval '3 hours')
  );
$$;

/** True when the caller is a live companion of that booking. */
create or replace function public.is_active_companion(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.booking_companions c
    where c.profile_id = auth.uid()
      and c.booking_id = p_booking_id
      and public.companion_access_is_live(c.id)
  );
$$;

/** The booking a companion may act on, or null. One booking, always. */
create or replace function public.companion_booking_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.booking_id
  from public.booking_companions c
  where c.profile_id = auth.uid()
    and public.companion_access_is_live(c.id);
$$;

revoke all on function public.current_companion_id from public, anon;
revoke all on function public.companion_access_is_live from public, anon;
revoke all on function public.is_active_companion from public, anon;
revoke all on function public.companion_booking_id from public, anon;
grant execute on function public.current_companion_id to authenticated;
grant execute on function public.companion_access_is_live to authenticated;
grant execute on function public.is_active_companion to authenticated;
grant execute on function public.companion_booking_id to authenticated;

-- ------------------------------------------------------------------ RLS --

alter table public.booking_companions enable row level security;

create policy "management reads companions" on public.booking_companions
  for select to authenticated using (public.is_admin());

create policy "management manages companions" on public.booking_companions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The desk needs to know who is in the house.
create policy "front desk reads companions" on public.booking_companions
  for select to authenticated
  using (public.has_permission('frontdesk.view') or public.has_permission('requests.work'));

-- The booking holder sees everyone on their own booking. This is the privacy
-- model: a companion's actions are visible to the person who invited them.
create policy "primary guest reads their companions" on public.booking_companions
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_companions.booking_id
        and b.customer_id = public.current_customer_id()
    )
  );

-- A companion sees their own row, and no other companion's.
create policy "companion reads their own row" on public.booking_companions
  for select to authenticated
  using (profile_id = auth.uid());

-- Deliberately no guest INSERT or UPDATE policy: adding and revoking go
-- through the RPCs below, which enforce capacity and own the login.

-- ------------------------------------------------- who did what, exactly --

alter table public.food_orders
  add column companion_id uuid references public.booking_companions (id) on delete set null;
alter table public.guest_requests
  add column companion_id uuid references public.booking_companions (id) on delete set null;
alter table public.feedback
  add column companion_id uuid references public.booking_companions (id) on delete set null;

comment on column public.food_orders.companion_id is
  'The person who ordered, when it was not the booking holder. Billing stays with the booking.';

create index food_orders_companion_idx on public.food_orders (companion_id);
create index guest_requests_companion_idx on public.guest_requests (companion_id);

-- ------------------------------------------- what a companion may look at --

create policy "companions read their booking" on public.bookings
  for select to authenticated
  using (public.is_active_companion(id));

create policy "companions read their booking rooms" on public.booking_rooms
  for select to authenticated
  using (public.is_active_companion(booking_id));

-- Their own orders, not the whole booking's. The primary guest sees all of
-- them through the policy they already have.
create policy "companions read their own orders" on public.food_orders
  for select to authenticated
  using (companion_id = public.current_companion_id());

create policy "companions read their own request" on public.guest_requests
  for select to authenticated
  using (companion_id = public.current_companion_id());

create policy "companions raise their own requests" on public.guest_requests
  for insert to authenticated
  with check (
    companion_id = public.current_companion_id()
    and booking_id = public.companion_booking_id()
    -- The request is billed and filed against the booking holder, exactly as
    -- if they had raised it; the companion is recorded as who asked.
    and customer_id = (
      select b.customer_id from public.bookings b
      where b.id = public.companion_booking_id()
    )
    -- Same rules the guest policy applies: urgency is the property's call.
    and priority in ('low', 'normal')
    and status = 'pending'
    and assigned_to is null
  );

create policy "companions leave feedback" on public.feedback
  for insert to authenticated
  with check (
    companion_id = public.current_companion_id()
    and booking_id = public.companion_booking_id()
    and customer_id = (
      select b.customer_id from public.bookings b
      where b.id = public.companion_booking_id()
    )
  );

create policy "companions read their own feedback" on public.feedback
  for select to authenticated
  using (companion_id = public.current_companion_id());

-- Preferences are the booking's, and a companion is on the stay: they may
-- read what the kitchen has been told, which is how they avoid repeating it.
create policy "companions read the stay preferences" on public.stay_preferences
  for select to authenticated
  using (booking_id is not null and public.is_active_companion(booking_id));

-- Nothing grants a companion payments, invoices, customers or other
-- bookings. There is no policy above that mentions them, and RLS denies by
-- default — which is the point of not giving them a customer_id.

-- ---------------------------------------------------------- adding one ---

/** A code a person can read down a phone line. No O/0, no I/1. */
create or replace function public.generate_guest_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_try      int := 0;
begin
  loop
    v_code := 'HOS-G';
    for i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.booking_companions where guest_code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'Could not allocate a guest code' using errcode = '55000';
    end if;
  end loop;
  return v_code;
end;
$$;

/**
 * Add somebody to a booking, and give them a way in.
 *
 * Only the booking holder or management may call it — a companion adding
 * companions is how a booking for eight quietly becomes a booking for twenty.
 * Capacity is enforced here rather than in the browser, counting the holder
 * as one of the adults the booking sold.
 *
 * Returns the code and a one-time password. The password is bcrypted into
 * auth.users and never stored anywhere else, so this return value is the only
 * time it exists in readable form. Losing it means issuing a new one.
 */
create or replace function public.add_companion(
  p_booking_id   uuid,
  p_full_name    text,
  p_phone        text default '',
  p_email        text default '',
  p_relationship public.companion_relationship default 'other',
  p_is_child     boolean default false
)
returns table (companion_id uuid, guest_code text, temporary_password text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking   public.bookings%rowtype;
  v_adults    int;
  v_children  int;
  v_code      text;
  v_password  text;
  v_user      uuid := gen_random_uuid();
  v_email     text;
  v_alphabet  text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_companion uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;

  if not public.is_admin()
     and v_booking.customer_id is distinct from public.current_customer_id() then
    raise exception 'Only the booking holder can add a guest' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Give the guest a name' using errcode = '23514';
  end if;

  -- Capacity. The holder is one of the adults, so the room for companions is
  -- one fewer than the booking sold.
  select
    count(*) filter (where not is_child),
    count(*) filter (where is_child)
  into v_adults, v_children
  from public.booking_companions
  where booking_id = p_booking_id and revoked_at is null;

  if p_is_child then
    if v_children + 1 > v_booking.children then
      raise exception 'This booking covers % children, and % are already listed',
        v_booking.children, v_children using errcode = '23514';
    end if;
  else
    if v_adults + 1 > greatest(v_booking.adults - 1, 0) then
      raise exception 'This booking covers % adults including yourself, and % are already listed',
        v_booking.adults, v_adults + 1 using errcode = '23514';
    end if;
  end if;

  v_code := public.generate_guest_code();
  -- The address is derived from the code, not from the person: most
  -- companions have no email, and the ones who do should not have their real
  -- address turned into a login they never asked for.
  v_email := lower(replace(v_code, 'HOS-', '')) || '@guest.homesofsanctuary.in';

  v_password := '';
  for i in 1..10 loop
    v_password := v_password || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;

  -- Real Supabase Auth, the same shape as the project's other logins. The
  -- empty strings are columns GoTrue scans into non-nullable Go strings; a
  -- NULL in any of them breaks every sign-in with a schema error.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current, reauthentication_token
  ) values (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'guest'),
    jsonb_build_object('full_name', trim(p_full_name), 'role', 'guest', 'companion', true),
    now(), now(),
    '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_user, v_user, v_user::text,
    jsonb_build_object('sub', v_user::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  -- The trigger on auth.users raises the profile; make sure it carries no
  -- customer_id, which is what keeps every guest policy from matching them.
  insert into public.profiles (id, role, full_name, customer_id)
  values (v_user, 'guest', trim(p_full_name), null)
  on conflict (id) do update
    set full_name = excluded.full_name, customer_id = null;

  insert into public.booking_companions (
    booking_id, full_name, phone, email, relationship, is_child,
    guest_code, profile_id, added_by
  ) values (
    p_booking_id, trim(p_full_name), coalesce(p_phone, ''), coalesce(p_email, ''),
    p_relationship, p_is_child, v_code, v_user, auth.uid()
  )
  returning id into v_companion;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (p_booking_id, 'booking', 'Guest added to the booking',
          trim(p_full_name) || ' (' || v_code || ')',
          coalesce((select full_name from public.profiles where id = auth.uid()), 'Guest'));

  return query select v_companion, v_code, v_password;
end;
$$;

revoke all on function public.add_companion from public, anon;
grant execute on function public.add_companion to authenticated;

-- --------------------------------------------------------- taking it away --

/**
 * Cut a companion's access.
 *
 * The row survives, and so does everything they ordered or asked for: the
 * booking's history is the property's record, not the companion's. Banning
 * the login as well means a session already open dies at its next refresh
 * rather than running to the end of its token.
 */
create or replace function public.revoke_companion(p_companion_id uuid)
returns public.booking_companions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companion public.booking_companions%rowtype;
  v_booking   public.bookings%rowtype;
begin
  select * into v_companion from public.booking_companions where id = p_companion_id;
  if not found then
    raise exception 'No such guest' using errcode = '23503';
  end if;

  select * into v_booking from public.bookings where id = v_companion.booking_id;

  if not public.is_admin()
     and v_booking.customer_id is distinct from public.current_customer_id() then
    raise exception 'Only the booking holder can revoke a guest' using errcode = '42501';
  end if;

  update public.booking_companions
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_companion_id
  returning * into v_companion;

  if v_companion.profile_id is not null then
    update auth.users
       set banned_until = now() + interval '100 years'
     where id = v_companion.profile_id;
  end if;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_companion.booking_id, 'booking', 'Guest access revoked',
          v_companion.full_name,
          coalesce((select full_name from public.profiles where id = auth.uid()), 'Guest'));

  return v_companion;
end;
$$;

revoke all on function public.revoke_companion from public, anon;
grant execute on function public.revoke_companion to authenticated;

/** Issue a fresh password for somebody who lost theirs. Same rules, same
 *  one-time return, and it lifts a ban so a revoked guest can be let back in
 *  deliberately rather than by accident. */
create or replace function public.reset_companion_password(p_companion_id uuid)
returns table (guest_code text, temporary_password text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companion public.booking_companions%rowtype;
  v_booking   public.bookings%rowtype;
  v_password  text := '';
  v_alphabet  text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select * into v_companion from public.booking_companions where id = p_companion_id;
  if not found then
    raise exception 'No such guest' using errcode = '23503';
  end if;
  if v_companion.profile_id is null then
    raise exception 'That guest has no login' using errcode = '23514';
  end if;

  select * into v_booking from public.bookings where id = v_companion.booking_id;
  if not public.is_admin()
     and v_booking.customer_id is distinct from public.current_customer_id() then
    raise exception 'Only the booking holder can do that' using errcode = '42501';
  end if;

  for i in 1..10 loop
    v_password := v_password || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;

  update auth.users
     set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
         banned_until = null,
         updated_at = now()
   where id = v_companion.profile_id;

  update public.booking_companions
     set revoked_at = null, revoked_by = null
   where id = p_companion_id;

  return query select v_companion.guest_code, v_password;
end;
$$;

revoke all on function public.reset_companion_password from public, anon;
grant execute on function public.reset_companion_password to authenticated;

-- ------------------------------------------------- ordering as a companion --

/**
 * The existing order RPC, taught who is standing there.
 *
 * Billing does not move: the order still hangs off the booking and still
 * folds into the booking's food charge when the kitchen bills it (BR12). All
 * that changes is that the kitchen is told whose dinner it is.
 */
create or replace function public.place_food_order(
  p_booking_id uuid,
  p_lines      jsonb,
  p_notes      text default null
)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking   public.bookings%rowtype;
  v_order     public.food_orders%rowtype;
  v_companion public.booking_companions%rowtype;
  v_actor     text;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = '23503';
  end if;

  select * into v_companion
  from public.booking_companions
  where profile_id = auth.uid() and booking_id = p_booking_id;

  if not public.is_admin()
     and v_booking.customer_id is distinct from public.current_customer_id()
     and not (v_companion.id is not null and public.companion_access_is_live(v_companion.id)) then
    raise exception 'That is not your booking' using errcode = '42501';
  end if;

  if not public.is_admin() and not public.can_order_food(p_booking_id) then
    if current_date < v_booking.check_in then
      raise exception 'The kitchen opens when you arrive on %.',
        to_char(v_booking.check_in, 'DD Mon') using errcode = '23514';
    elsif current_date > v_booking.check_out then
      raise exception 'This stay ended on %. Get in touch if you need anything.',
        to_char(v_booking.check_out, 'DD Mon') using errcode = '23514';
    else
      raise exception 'The kitchen opens once your booking is confirmed.'
        using errcode = '23514';
    end if;
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one item' using errcode = '23514';
  end if;

  insert into public.food_orders (
    reference, booking_id, customer_id, villa_id, room_id, status, notes, companion_id
  ) values (
    'KIT-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'),
    v_booking.id, v_booking.customer_id, v_booking.villa_id,
    (select room_id from public.booking_rooms where booking_id = v_booking.id limit 1),
    'placed', p_notes, v_companion.id
  )
  returning * into v_order;

  insert into public.food_order_lines (order_id, menu_item_id, name, price, quantity)
  select
    v_order.id,
    (line ->> 'menu_item_id')::uuid,
    m.name,
    m.price,
    greatest(1, (line ->> 'quantity')::int)
  from jsonb_array_elements(p_lines) as line
  join public.menu_items m on m.id = (line ->> 'menu_item_id')::uuid
  where m.available;

  if not exists (select 1 from public.food_order_lines where order_id = v_order.id) then
    raise exception 'None of those items are available today' using errcode = '23514';
  end if;

  v_actor := coalesce(v_companion.full_name, 'Guest');
  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (v_booking.id, 'food', 'Kitchen order placed', v_order.reference, v_actor);

  return v_order;
end;
$$;

revoke all on function public.place_food_order from public, anon;
grant execute on function public.place_food_order to authenticated;
