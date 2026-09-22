-- Villa photographs live in a public bucket.
--
-- The opposite call to receipts and guest IDs, and deliberately: these are the
-- pictures the marketing site and the guest portal render in an <img>. A
-- signed URL expires, and a villa whose photograph vanishes after an hour is
-- worse than no access control on a picture of a verandah.
--
-- Nothing private is ever put here. Writing is management-only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'villa-photos',
  'villa-photos',
  true,
  5242880,  -- 5 MB, matching the client-side guard
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "anyone reads villa photos"
  on storage.objects for select
  using (bucket_id = 'villa-photos');

create policy "management uploads villa photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'villa-photos' and public.is_admin());

create policy "management replaces villa photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'villa-photos' and public.is_admin())
  with check (bucket_id = 'villa-photos' and public.is_admin());

-- A replaced photograph is not a record anyone needs to keep, unlike a
-- receipt, so this bucket does allow a delete.
create policy "management removes villa photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'villa-photos' and public.is_admin());
