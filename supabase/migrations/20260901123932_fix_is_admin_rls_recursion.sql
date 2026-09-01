-- is_admin() must not be subject to RLS, or it recurses forever.
--
-- The loop: a policy calls is_admin() -> is_admin() selects from profiles ->
-- the profiles policy fires -> it calls is_admin() -> ...
--
-- Postgres reports this as "stack depth limit exceeded" (54001) rather than a
-- recursion error, which makes it easy to misread as a query-size problem.
--
-- Admins never hit it because their profiles policy is
-- `id = auth.uid() or is_admin()` and the first branch short-circuits. Guests
-- fail the first branch, so every guest read of any table died. Marking the
-- helper SECURITY DEFINER makes it read profiles with the owner's rights,
-- bypassing RLS and breaking the cycle.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Same hazard, same fix: this reads profiles from inside profiles policies too.
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select customer_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_customer_id() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_customer_id() to authenticated;

-- Belt and braces on the table that starts the cycle: a plain self-read needs
-- no function call at all, so the admin branch is moved to its own policy.
drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());
