-- CRITICAL — self-signup could grant admin.
--
-- handle_new_user() resolved the new user's role like this:
--
--   coalesce(
--     (new.raw_app_meta_data  ->> 'role')::app_role,
--     (new.raw_user_meta_data ->> 'role')::app_role,   -- <= client controlled
--     'guest')
--
-- `raw_user_meta_data` is whatever the client passed to signUp():
--
--   supabase.auth.signUp({ email, password, options: { data: { role: 'admin' }}})
--
-- so anyone who could reach /auth/v1/signup — a public endpoint, reachable with
-- the anon key regardless of what the UI links to — could mint themselves an
-- admin profile and read every booking, guest and payment in the property.
--
-- Verified against this project before the fix: a signup with
-- data.role = 'admin' produced a profile with role = admin.
--
-- The fix: self-signup is ALWAYS a guest. `raw_app_meta_data` is not settable
-- through the public signup endpoint — only via the Admin API with the
-- service-role key — so it remains a trustworthy source for seeding staff.
-- Everything else is ignored.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  -- app_metadata only. Never user_metadata: the client writes that.
  v_role := coalesce(
    (new.raw_app_meta_data ->> 'role')::public.app_role,
    'guest'
  );

  -- Belt and braces. Even app_metadata should not be able to mint an admin
  -- through this path; staff are created deliberately by a migration or by an
  -- existing admin calling promote_user(), both of which write profiles
  -- directly rather than relying on this trigger.
  if v_role = 'admin' and not exists (select 1 from public.profiles where role = 'admin') then
    -- The very first admin (bootstrap) is allowed, otherwise there would be no
    -- way to create one. After that, this branch is unreachable.
    null;
  elsif v_role = 'admin' then
    v_role := 'guest';
  end if;

  insert into public.profiles (id, role, full_name, customer_id)
  values (
    new.id,
    v_role,
    -- A display name is harmless, so this one field is still taken from the
    -- client, trimmed and length-capped.
    coalesce(
      nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 80), ''),
      split_part(new.email, '@', 1)
    ),
    -- Link the account to an existing customer record by email, so a guest who
    -- booked over the phone sees that stay the moment they sign up.
    (select c.id from public.customers c where lower(c.email) = lower(new.email) limit 1)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Remove the account created while proving the hole.
delete from auth.users where email = 'attacker.test@gmail.com';

/**
 * Promote or demote someone. The only supported way to create staff and admins.
 *
 * Requires an existing admin, so it cannot be used to bootstrap the first one —
 * that is what the seed migration is for.
 */
create or replace function public.set_user_role(
  p_user_id uuid,
  p_role    public.app_role,
  p_team    public.team default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin access' using errcode = '23514';
  end if;

  if p_role = 'staff' and p_team is null then
    raise exception 'A staff member needs a team' using errcode = '23514';
  end if;

  update public.profiles
     set role = p_role,
         team = case when p_role = 'staff' then p_team else null end
   where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'No such user' using errcode = '23503';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.set_user_role from public, anon;
grant execute on function public.set_user_role to authenticated;

/**
 * Attach a signed-up guest to their customer record.
 *
 * Someone who books over the phone and later signs up with the same email is
 * linked automatically by the trigger. This covers the other case: they signed
 * up first, or used a different address, and an admin ties the two together.
 */
create or replace function public.link_guest_to_customer(
  p_user_id     uuid,
  p_customer_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only staff can link a guest account' using errcode = '42501';
  end if;

  update public.profiles
     set customer_id = p_customer_id
   where id = p_user_id and role = 'guest'
  returning * into v_profile;

  if not found then
    raise exception 'No such guest account' using errcode = '23503';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.link_guest_to_customer from public, anon;
grant execute on function public.link_guest_to_customer to authenticated;
