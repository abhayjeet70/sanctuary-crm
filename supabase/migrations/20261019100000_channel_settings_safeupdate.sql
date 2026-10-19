-- The project runs pg_safeupdate: an UPDATE without WHERE is refused, which made
-- every channel settings save fail. Same functions, with `where id` (the single row).

create or replace function public.channel_save_settings(
  p_environment   text,
  p_property_id   text,
  p_mapping       jsonb,
  p_sync_enabled  boolean,
  p_functions_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change channel settings' using errcode = '42501';
  end if;
  if p_property_id !~ '^[A-Za-z0-9-]{0,64}$' then
    raise exception 'The property ID should be the UUID shown in Channex' using errcode = '22023';
  end if;
  if jsonb_typeof(p_mapping) <> 'array' then
    raise exception 'Mapping must be a list' using errcode = '22023';
  end if;
  for m in select * from jsonb_array_elements(p_mapping) loop
    if coalesce(m->>'room_type_id', '') !~ '^[A-Za-z0-9-]{1,64}$' then
      raise exception 'Every mapped unit needs a Channex room type ID' using errcode = '22023';
    end if;
    if not exists (select 1 from public.villas where id = (m->>'villa_id')::uuid) then
      raise exception 'A mapped villa no longer exists' using errcode = '23503';
    end if;
    if m->>'room_id' is not null and not exists (
      select 1 from public.rooms where id = (m->>'room_id')::uuid and villa_id = (m->>'villa_id')::uuid
    ) then
      raise exception 'A mapped room does not belong to its villa' using errcode = '23503';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_mapping))
     <> (select count(distinct x->>'room_type_id') from jsonb_array_elements(p_mapping) x) then
    raise exception 'Each Channex room type can be mapped only once' using errcode = '23505';
  end if;
  if p_sync_enabled and not exists (select 1 from vault.secrets where name = 'channel_api_key') then
    raise exception 'Save the API key before turning sync on' using errcode = '22023';
  end if;

  update public.channel_settings set
    environment   = p_environment,
    property_id   = p_property_id,
    mapping       = p_mapping,
    sync_enabled  = p_sync_enabled,
    functions_url = p_functions_url,
    updated_at    = now()
  where id;
end;
$$;

create or replace function public.channel_save_api_key(p_api_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := btrim(coalesce(p_api_key, ''));
  v_id  uuid;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can set the channel key' using errcode = '42501';
  end if;
  if v_key !~ '^[A-Za-z0-9+/=_.-]{20,200}$' then
    raise exception 'That does not look like a Channex API key' using errcode = '22023';
  end if;

  select id into v_id from vault.secrets where name = 'channel_api_key';
  if v_id is null then
    perform vault.create_secret(v_key, 'channel_api_key', 'Channex user API key');
  else
    perform vault.update_secret(v_id, v_key);
  end if;

  update public.channel_settings set
    api_key_last4     = right(v_key, 4),
    keys_updated_at   = now(),
    keys_updated_by   = public.channel_actor(),
    last_test_ok      = null,
    last_test_message = 'Key changed: test the connection again',
    updated_at        = now()
  where id;

  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (auth.uid(), 'channel', 'Channel manager key saved',
          'Ending ' || right(v_key, 4), public.channel_actor());
end;
$$;

create or replace function public.channel_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can disconnect the channel manager' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'channel_api_key';
  update public.channel_settings set
    sync_enabled = false, webhook_id = null, api_key_last4 = null,
    keys_updated_at = now(), keys_updated_by = public.channel_actor(),
    last_test_ok = null, last_test_message = 'Disconnected', updated_at = now()
  where id;
  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (auth.uid(), 'channel', 'Channel manager disconnected', 'Key removed from the vault',
          public.channel_actor());
end;
$$;

create or replace function public.channel_record(
  p_kind text, p_ok boolean, p_message text, p_webhook_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'test' then
    update public.channel_settings set
      last_test_at = now(), last_test_ok = p_ok, last_test_message = left(p_message, 500),
      webhook_id = coalesce(p_webhook_id, webhook_id)
  where id;
  else
    update public.channel_settings set
      last_sync_at = case when p_ok then now() else last_sync_at end,
      last_error   = case when p_ok then '' else left(p_message, 500) end
  where id;
  end if;
end;
$$;
