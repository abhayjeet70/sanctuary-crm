-- Issuing a companion login after the stay is over.
--
-- The badge said "Stay ended" and the per-person actions were hidden, but
-- "Generate another login" still worked and handed out a password that
-- companion_access_is_live would refuse on the next request. A credential that
-- cannot be used is worse than no button: it is shared, and then it fails in
-- the guest's hands.
--
-- The clock lives in one place now. companion_access_is_live keeps its own
-- extra condition (revoked_at) and borrows the rest.

/** True while the booking is still running, departure plus three hours. */
create or replace function public.booking_stay_is_live(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.status not in ('cancelled', 'rejected', 'no_show')
      and (now() at time zone 'Asia/Kolkata')
          < (b.check_out + coalesce(b.check_out_time, '11:00'::time) + interval '3 hours')
  );
$$;

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
    where c.id = p_companion_id
      and c.revoked_at is null
      and public.booking_stay_is_live(c.booking_id)
  );
$$;

grant execute on function public.booking_stay_is_live(uuid) to authenticated;

-- add_companion, unchanged but for the stay-is-live guard.
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

  -- The stay is over: a login issued now could never be used.
  if not public.is_admin() and not public.booking_stay_is_live(p_booking_id) then
    raise exception 'This stay has ended, so a new login cannot be issued.'
      using errcode = '23514';
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

-- reset_companion_password, unchanged but for the stay-is-live guard.
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

  -- The stay is over: a login issued now could never be used.
  if not public.is_admin() and not public.booking_stay_is_live(v_companion.booking_id) then
    raise exception 'This stay has ended, so a new login cannot be issued.'
      using errcode = '23514';
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
