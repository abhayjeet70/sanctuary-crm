-- Payment receipts live in a private bucket.
--
-- These files carry bank details, phone numbers and account names. The bucket
-- is never public; admins read through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,  -- 5 MB, matching the client-side guard
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {booking_id}/{filename}. That first segment is what makes
-- ownership expressible as a prefix check.
create policy "guests upload receipts for their own bookings"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = public.current_customer_id()
    )
  );

create policy "guests read their own receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = public.current_customer_id()
    )
  );

create policy "admins read every receipt"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-receipts' and public.is_admin());

-- Deliberately no DELETE policy for anyone. A verified receipt is a financial
-- record; removing one is a support task, not a button.
