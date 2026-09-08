-- Two more demo logins, so the new roles are reachable.
--
--   manager@gmail.com  / demo123  -> manager, team = manager
--   kitchen@gmail.com  / demo123  -> staff,   team = kitchen
--
-- The manager sees the operations shell: bookings, payments, the calendar,
-- the kitchen board, requests, guests. Not Settings, not the villas, not who
-- else has an account — those stay with the owner, and RLS is what enforces
-- it rather than a hidden menu item.
--
-- Same caveat as the other demo logins: shared weak password, fine while this
-- is a staging project, delete before the property's real data is loaded.
--
-- Token columns are '' rather than NULL: GoTrue scans them into non-nullable
-- Go strings and a NULL breaks every sign-in with an opaque "Database error
-- querying schema". See 20260901123653.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('auth-manager', 'manager@gmail.com', 'Anand (Manager)',  'manager'::public.app_role, 'manager'::public.team),
      ('auth-kitchen', 'kitchen@gmail.com', 'Ravi (Kitchen)',   'staff'::public.app_role,   'kitchen'::public.team)
    ) as t(seed, email, full_name, app_role, team)
  loop
    declare
      v_id uuid := public.seed_id(r.seed);
    begin
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current, reauthentication_token
      ) values (
        v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        r.email, extensions.crypt('demo123', extensions.gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email'],
                           'role', r.app_role::text),
        jsonb_build_object('full_name', r.full_name),
        now(), now(),
        '', '', '', '', '', ''
      )
      on conflict (id) do update
        set encrypted_password = excluded.encrypted_password,
            email_confirmed_at = excluded.email_confirmed_at,
            raw_app_meta_data  = excluded.raw_app_meta_data,
            updated_at         = now();

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_id, v_id, v_id::text,
        jsonb_build_object('sub', v_id::text, 'email', r.email,
                           'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      )
      on conflict (provider_id, provider) do nothing;

      insert into public.profiles (id, role, full_name, team, customer_id)
      values (v_id, r.app_role, r.full_name, r.team, null)
      on conflict (id) do update
        set role = excluded.role,
            full_name = excluded.full_name,
            team = excluded.team;
    end;
  end loop;
end
$$;
