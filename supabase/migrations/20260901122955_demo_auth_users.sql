-- The two demo logins.
--
--   admin@gmail.com / demo123  -> admin, sees the whole CRM
--   user@gmail.com  / demo123  -> guest, mapped to Pooja Bothra's customer row
--
-- These are DEMO ACCOUNTS with a six-character shared password. They are fine
-- for a staging project and must never exist in production: delete this
-- migration (or the two rows) before the property's real data is loaded.
--
-- Passwords are hashed with bcrypt via pgcrypto, the same scheme GoTrue uses,
-- so signInWithPassword accepts them.

do $$
declare
  v_admin_id uuid := public.seed_id('auth-admin');
  v_guest_id uuid := public.seed_id('auth-guest');
begin
  -- ------------------------------------------------------------- admin ----
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- GoTrue scans these into non-nullable Go strings; a NULL here makes every
    -- sign-in fail with "Database error querying schema".
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current, reauthentication_token
  ) values (
    v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@gmail.com', extensions.crypt('demo123', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'admin'),
    jsonb_build_object('full_name', 'Anjali Rao', 'role', 'admin'),
    now(), now(),
    '', '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password,
        email_confirmed_at = excluded.email_confirmed_at,
        raw_app_meta_data  = excluded.raw_app_meta_data,
        updated_at         = now();

  -- ------------------------------------------------------------- guest ----
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current, reauthentication_token
  ) values (
    v_guest_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'user@gmail.com', extensions.crypt('demo123', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'guest'),
    jsonb_build_object('full_name', 'Pooja Bothra', 'role', 'guest'),
    now(), now(),
    '', '', '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password,
        email_confirmed_at = excluded.email_confirmed_at,
        raw_app_meta_data  = excluded.raw_app_meta_data,
        updated_at         = now();

  -- GoTrue expects an identity row per provider, or password sign-in 400s.
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (v_admin_id, v_admin_id, v_admin_id::text,
     jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@gmail.com', 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now()),
    (v_guest_id, v_guest_id, v_guest_id::text,
     jsonb_build_object('sub', v_guest_id::text, 'email', 'user@gmail.com', 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  -- The handle_new_user trigger creates the profiles, but it only fires on
  -- INSERT. Set them explicitly so re-running this migration is safe.
  insert into public.profiles (id, role, full_name, customer_id) values
    (v_admin_id, 'admin', 'Anjali Rao',   null),
    (v_guest_id, 'guest', 'Pooja Bothra', public.seed_id('c-pooja'))
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        customer_id = excluded.customer_id;
end
$$;
