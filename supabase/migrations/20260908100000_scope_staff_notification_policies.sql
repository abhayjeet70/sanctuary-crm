-- Guest mail was still landing in the staff tray.
--
-- The previous migration scoped the two "admins ..." policies to
-- target_user_id is null, but a later migration had added "staff ..."
-- siblings using is_staff(). Policies are OR'd, so the unscoped sibling let
-- every admin read every guest's notifications regardless.
--
-- Scoping one policy and leaving its sibling is not a fix. Both now agree.

drop policy if exists "staff read notifications" on public.notifications;
create policy "staff read staff notifications" on public.notifications
  for select to authenticated
  using (public.is_staff() and target_user_id is null);

drop policy if exists "staff update notifications" on public.notifications;
create policy "staff update staff notifications" on public.notifications
  for update to authenticated
  using (public.is_staff() and target_user_id is null)
  with check (public.is_staff() and target_user_id is null);
