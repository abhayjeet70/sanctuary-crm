-- A staff demo account, so the new role is reachable.
--
--   housekeeping@gmail.com / demo123  -> staff, team = housekeeping
--
-- Same caveat as the other two demo logins: shared weak password, fine for a
-- staging project, delete before the property's real data is loaded.
--
-- The token columns are written as '' rather than left NULL — GoTrue scans them
-- into non-nullable Go strings and a NULL breaks every sign-in with an opaque
-- "Database error querying schema". See 20260901123653.

do $$
declare
  v_staff_id uuid := public.seed_id('auth-housekeeping');
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current, reauthentication_token
  ) values (
    v_staff_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'housekeeping@gmail.com', extensions.crypt('demo123', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'staff'),
    jsonb_build_object('full_name', 'Lakshmi (Housekeeping)', 'role', 'staff'),
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
    v_staff_id, v_staff_id, v_staff_id::text,
    jsonb_build_object(
      'sub', v_staff_id::text, 'email', 'housekeeping@gmail.com',
      'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, role, full_name, team, customer_id)
  values (v_staff_id, 'staff', 'Lakshmi (Housekeeping)', 'housekeeping', null)
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        team = excluded.team;
end
$$;
