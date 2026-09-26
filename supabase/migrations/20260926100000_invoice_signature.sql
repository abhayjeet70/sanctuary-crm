-- The authorised signatory's signature, printed on every invoice.
--
-- A signature is a thing worth forging, so it is not put in a public bucket the
-- way villa photographs are. It lives in a private bucket and is shown through
-- a short-lived signed URL; any signed-in user may read it (a guest has to, to
-- see their own invoice) but only the owner may put one there or change which
-- file is in use.
--
-- The limits are repeated here on purpose. The form checks them for a friendly
-- message; the bucket is what actually refuses a file that broke them.

alter table public.property_settings
  add column if not exists signature_path text not null default '';

comment on column public.property_settings.signature_path is
  'Path inside the invoice-signature bucket. Empty means print the signatory''s name only.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-signature',
  'invoice-signature',
  false,
  1048576,  -- 1 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "signed-in users read the signature"
  on storage.objects for select to authenticated
  using (bucket_id = 'invoice-signature');

create policy "owner adds the signature"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-signature' and public.is_owner());

create policy "owner replaces the signature"
  on storage.objects for update to authenticated
  using (bucket_id = 'invoice-signature' and public.is_owner())
  with check (bucket_id = 'invoice-signature' and public.is_owner());

create policy "owner removes the signature"
  on storage.objects for delete to authenticated
  using (bucket_id = 'invoice-signature' and public.is_owner());

-- Settings are writable by management, and the owner alone decides whose
-- signature goes on a tax invoice. Storage RLS already stops a manager
-- uploading; this stops one pointing the setting at a file that is already there.
create or replace function public.guard_signature_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.signature_path is distinct from old.signature_path and not public.is_owner() then
    raise exception 'Only the owner can change the invoice signature' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists property_settings_signature_guard_trg on public.property_settings;
create trigger property_settings_signature_guard_trg
  before update on public.property_settings
  for each row execute function public.guard_signature_path();
