-- Lost & Found, from the shelf to the guest's door.
--
-- Five concepts, five places, deliberately apart:
--
--   ITEM    the physical thing someone found           lost_items
--   CLAIM   a guest's assertion that it is theirs      lost_item_claims
--   RETURN  how it goes back — collected or couriered  lost_item_returns
--   REPORT  a guest saying "I left something"          lost_reports
--   TRAIL   who touched it, when                       activity_events (existing)
--
-- One giant table would put a guest's delivery address beside the staff shelf
-- reference and let RLS hand out both or neither. Kept apart, each can be
-- given to exactly the people who need it.
--
-- ── What guests see ─────────────────────────────────────────────────────
-- Never the item row. It carries where the item is stored, who found it and
-- the property's notes, and RLS cannot hide columns. Guests read the
-- `guest_lost_items` view, which has none of those, and act only through RPCs.
--
-- ── Sensitivity ─────────────────────────────────────────────────────────
-- A passport or a watch is not a phone charger. `high_value` and `sensitive`
-- items are visible to management alone, their claims are verified by
-- management alone, and they are never disposed of by anyone else.

-- ================================================================= types ==

create type public.lost_item_category as enum (
  'electronics', 'jewellery', 'watch', 'clothing', 'bag', 'documents',
  'medication', 'cash', 'toiletries', 'books', 'toys', 'accessories', 'other'
);

create type public.lost_item_sensitivity as enum ('normal', 'high_value', 'sensitive');

create type public.lost_item_location as enum (
  'villa', 'room', 'common_area', 'restaurant', 'kitchen', 'pool',
  'garden', 'front_desk', 'parking', 'other'
);

create type public.lost_item_status as enum (
  'found',
  'under_review',
  'guest_identified',
  'guest_contacted',
  'claim_pending',
  'claim_verified',
  'claim_rejected',
  'return_method_selected',
  'return_arranged',
  'ready_for_pickup',
  'in_transit',
  'returned',
  'unclaimed',
  'disposed',
  'closed'
);

create type public.lost_item_disposition as enum (
  'returned', 'donated', 'disposed', 'transferred', 'handed_to_authorities', 'other'
);

create type public.lost_claim_status as enum ('pending', 'verified', 'rejected');

create type public.lost_return_method as enum ('pickup', 'courier');

create type public.courier_status as enum (
  'quote_required', 'awaiting_payment', 'ready_to_ship', 'pickup_scheduled',
  'picked_up', 'in_transit', 'out_for_delivery', 'delivered',
  'delivery_failed', 'returned_to_property'
);

create type public.shipping_payer as enum ('guest', 'property');
create type public.shipping_payment_status as enum ('pending', 'paid', 'waived');

-- ============================================================= settings ==
--
-- Retention is property policy, not law written into code. Different item
-- classes are held for different times, and the owner sets all three.

alter table public.property_settings
  add column lost_found_retention_days            int not null default 90
    check (lost_found_retention_days between 1 and 3650),
  add column lost_found_high_value_retention_days int not null default 180
    check (lost_found_high_value_retention_days between 1 and 3650),
  add column lost_found_sensitive_retention_days  int not null default 30
    check (lost_found_sensitive_retention_days between 1 and 3650);

comment on column public.property_settings.lost_found_retention_days is
  'Property policy: days an ordinary found item is held before disposition. Not a legal minimum.';

-- ================================================================ items ==

create table public.lost_items (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,

  title             text not null check (length(trim(title)) > 1),
  category          public.lost_item_category not null default 'other',
  sensitivity       public.lost_item_sensitivity not null default 'normal',
  description       text not null default '',
  brand             text not null default '',
  colour            text not null default '',
  -- What would let the real owner describe it and a stranger not. Staff-only:
  -- showing it to a claimant would hand them the answer to the question.
  distinguishing    text not null default '',
  quantity          int not null default 1 check (quantity >= 1),
  -- Paths in the private lost-found bucket, never URLs.
  photo_paths       text[] not null default '{}',

  location          public.lost_item_location not null default 'villa',
  villa_id          uuid references public.villas (id) on delete set null,
  room_id           uuid references public.rooms (id) on delete set null,
  location_note     text not null default '',

  found_at          timestamptz not null default now(),
  found_by_name     text not null default '',
  department_id     uuid references public.departments (id) on delete set null,

  -- The owner, once staff have decided. Never set by a guest, never by a
  -- match suggestion on its own.
  booking_id        uuid references public.bookings (id) on delete set null,
  customer_id       uuid references public.customers (id) on delete set null,
  companion_id      uuid references public.booking_companions (id) on delete set null,

  storage_location  text not null default '',
  storage_ref       text not null default '',
  secured           boolean not null default false,

  status            public.lost_item_status not null default 'found',
  retention_until   date,
  disposition       public.lost_item_disposition,
  disposition_note  text not null default '',
  closed_at         timestamptz,

  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index lost_items_status_idx on public.lost_items (status);
create index lost_items_villa_idx on public.lost_items (villa_id, found_at desc);
create index lost_items_owner_idx on public.lost_items (customer_id);
create index lost_items_companion_idx on public.lost_items (companion_id);
create index lost_items_booking_idx on public.lost_items (booking_id);

comment on table public.lost_items is
  'Things found on the property. Staff-only row: guests read guest_lost_items, which carries no storage or staff detail.';

create sequence public.lost_item_reference_seq start 1001;

-- ================================================================ claims ==

create table public.lost_item_claims (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.lost_items (id) on delete cascade,
  customer_id     uuid references public.customers (id) on delete set null,
  companion_id    uuid references public.booking_companions (id) on delete set null,
  -- The claimant's own description, in their words, checked against the
  -- item's distinguishing detail by a person — never compared by code.
  statement       text not null default '',
  status          public.lost_claim_status not null default 'pending',
  verified_by     uuid references public.profiles (id) on delete set null,
  verified_at     timestamptz,
  rejection_note  text not null default '',
  created_at      timestamptz not null default now(),

  constraint lost_item_claims_one_claimant
    check (num_nonnulls(customer_id, companion_id) >= 1)
);

create index lost_item_claims_item_idx on public.lost_item_claims (item_id);

-- =============================================================== returns ==

create table public.lost_item_returns (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null unique references public.lost_items (id) on delete cascade,
  method            public.lost_return_method not null,

  -- Collection
  pickup_at         timestamptz,
  collected_by      text not null default '',
  id_checked        boolean not null default false,
  released_by       uuid references public.profiles (id) on delete set null,
  released_at       timestamptz,

  -- Courier. Address fields are the guest's; the logistics fields are ours.
  recipient_name    text not null default '',
  recipient_phone   text not null default '',
  address_line1     text not null default '',
  address_line2     text not null default '',
  city              text not null default '',
  state             text not null default '',
  country           text not null default 'India',
  postal_code       text not null default '',
  delivery_notes    text not null default '',

  -- No integration yet, on purpose: the provider is a name and the tracking
  -- number a string, so a real carrier can be wired in later behind them.
  courier_provider  text not null default '',
  tracking_number   text not null default '',
  shipping_cost     int check (shipping_cost is null or shipping_cost >= 0),
  paid_by           public.shipping_payer,
  payment_status    public.shipping_payment_status not null default 'pending',
  payment_reference text not null default '',
  shipping_status   public.courier_status,
  pickup_date       date,
  expected_delivery date,
  delivered_at      timestamptz,
  proof_path        text,

  arranged_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =============================================================== reports ==

create table public.lost_reports (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  customer_id     uuid references public.customers (id) on delete set null,
  companion_id    uuid references public.booking_companions (id) on delete set null,
  booking_id      uuid references public.bookings (id) on delete set null,

  title           text not null check (length(trim(title)) > 1),
  category        public.lost_item_category not null default 'other',
  description     text not null default '',
  colour          text not null default '',
  brand           text not null default '',
  location_note   text not null default '',
  lost_at         timestamptz,
  photo_path      text,
  contact_pref    text not null default 'portal'
                    check (contact_pref in ('portal', 'phone', 'whatsapp', 'email')),

  status          text not null default 'open'
                    check (status in ('open', 'matched', 'closed')),
  -- Set by staff when they tie a report to a found item. Never by the guest.
  matched_item_id uuid references public.lost_items (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint lost_reports_one_reporter
    check (num_nonnulls(customer_id, companion_id) >= 1)
);

create index lost_reports_status_idx on public.lost_reports (status);

create sequence public.lost_report_reference_seq start 1001;

-- ============================================================== helpers ==

/** May log a found item. Any department it has been granted to. */
create or replace function public.can_log_lost_items()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or public.has_permission('lostfound.log')
      or public.has_permission('lostfound.manage');
$$;

/** May work the queue: identify, contact, verify, arrange. */
create or replace function public.can_manage_lost_items()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or public.has_permission('lostfound.manage');
$$;

/**
 * Whether the caller is the guest an item has been tied to.
 *
 * Holder or companion. For a companion this deliberately does NOT require
 * their stay access to be live: recovering something you left behind is the
 * one thing a guest needs *after* the stay, and it is scoped to their own
 * item rather than reopening the portal.
 */
create or replace function public.owns_lost_item(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lost_items i
    where i.id = p_item_id
      and (
        (i.companion_id is not null and i.companion_id = public.current_companion_id())
        or (i.companion_id is null and i.customer_id is not null
            and i.customer_id = public.current_customer_id())
      )
  );
$$;

/**
 * Whether the caller may see a case — a wider question than who acts on it.
 *
 * The booking holder sees every case on their booking, including a
 * companion's: that is the privacy model everywhere else in the portal. A
 * companion sees only their own, never another companion's.
 */
create or replace function public.can_view_lost_item(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.owns_lost_item(p_item_id) or exists (
    select 1 from public.lost_items i
    where i.id = p_item_id
      and i.customer_id is not null
      and i.customer_id = public.current_customer_id()
  );
$$;

revoke all on function public.can_view_lost_item from public, anon;
grant execute on function public.can_view_lost_item to authenticated;

revoke all on function public.can_log_lost_items from public, anon;
revoke all on function public.can_manage_lost_items from public, anon;
revoke all on function public.owns_lost_item from public, anon;
grant execute on function public.can_log_lost_items to authenticated;
grant execute on function public.can_manage_lost_items to authenticated;
grant execute on function public.owns_lost_item to authenticated;

/** Write one link in the chain of custody. */
create or replace function public.log_custody(
  p_item_id uuid,
  p_title   text,
  p_detail  text default ''
)
returns void
language sql security definer set search_path = public
as $$
  insert into public.activity_events (entity_id, kind, title, detail, actor)
  values (
    p_item_id, 'lost_found', p_title, coalesce(p_detail, ''),
    coalesce((select full_name from public.profiles where id = auth.uid()), 'System')
  );
$$;

/** Tell the owner of an item, in their portal. Silent if they have no login,
 *  which is not an error: a phone booking may never sign in. */
create or replace function public.notify_lost_item_owner_of(
  p_item_id uuid,
  p_title   text,
  p_detail  text
)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
  v_sent int := 0;
begin
  select * into v_item from public.lost_items where id = p_item_id;

  if v_item.companion_id is not null then
    insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
    select 'lost_found', p_title, p_detail, false, p_item_id, c.profile_id
    from public.booking_companions c
    where c.id = v_item.companion_id and c.profile_id is not null;
    get diagnostics v_sent = row_count;
  elsif v_item.customer_id is not null then
    insert into public.notifications (kind, title, detail, read, entity_id, target_user_id)
    select 'lost_found', p_title, p_detail, false, p_item_id, p.id
    from public.profiles p
    where p.customer_id = v_item.customer_id and p.role = 'guest';
    get diagnostics v_sent = row_count;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.log_custody from public, anon;
revoke all on function public.notify_lost_item_owner_of from public, anon;

-- ====================================================== the state machine ==
--
-- Enforced by trigger, not by the page: a direct UPDATE through the API is
-- refused the same way as a button. The RPCs below are the only doors, and
-- each moves the item one legal step.

create or replace function public.lost_item_transition_allowed(
  p_from public.lost_item_status,
  p_to   public.lost_item_status
)
returns boolean
language sql immutable
as $$
  select (p_from, p_to) in (
    ('found',                  'under_review'),
    ('found',                  'guest_identified'),
    ('found',                  'unclaimed'),
    ('under_review',           'guest_identified'),
    ('under_review',           'unclaimed'),
    ('guest_identified',       'guest_contacted'),
    ('guest_identified',       'under_review'),
    ('guest_contacted',        'claim_pending'),
    ('guest_contacted',        'under_review'),
    ('guest_contacted',        'unclaimed'),
    ('claim_pending',          'claim_verified'),
    ('claim_pending',          'claim_rejected'),
    ('claim_rejected',         'guest_contacted'),
    ('claim_rejected',         'under_review'),
    ('claim_rejected',         'unclaimed'),
    ('claim_rejected',         'closed'),
    ('claim_verified',         'return_method_selected'),
    ('return_method_selected', 'return_arranged'),
    ('return_arranged',        'ready_for_pickup'),
    ('return_arranged',        'in_transit'),
    ('ready_for_pickup',       'returned'),
    ('in_transit',             'returned'),
    -- A failed delivery comes back to the shelf and is arranged again.
    ('in_transit',             'return_arranged'),
    ('returned',               'closed'),
    ('unclaimed',              'disposed'),
    ('unclaimed',              'guest_contacted'),
    ('unclaimed',              'claim_pending'),
    ('unclaimed',              'under_review'),
    ('disposed',               'closed')
  );
$$;

create or replace function public.guard_lost_item_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if not public.lost_item_transition_allowed(old.status, new.status) then
      raise exception 'A found item cannot go from % to %',
        replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')
        using errcode = '23514';
    end if;
  end if;

  -- Where it is kept, and who can see that, is a custody fact. Moving it is
  -- logged whoever does it.
  if new.storage_location is distinct from old.storage_location
     or new.storage_ref is distinct from old.storage_ref then
    perform public.log_custody(new.id, 'Moved in storage',
      coalesce(nullif(old.storage_location, ''), 'unrecorded') || ' → ' ||
      coalesce(nullif(new.storage_location, ''), 'unrecorded') ||
      case when new.storage_ref <> '' then ' (' || new.storage_ref || ')' else '' end);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger lost_items_guard_status
  before update on public.lost_items
  for each row execute function public.guard_lost_item_status();

-- ================================================================== RLS ==

alter table public.lost_items enable row level security;
alter table public.lost_item_claims enable row level security;
alter table public.lost_item_returns enable row level security;
alter table public.lost_reports enable row level security;

-- Management sees everything, including the passports.
create policy "management reads every found item" on public.lost_items
  for select to authenticated using (public.is_admin());

-- The desk sees the ordinary items. High-value and sensitive stay with
-- management: a list of where the watches are kept is not general reading.
create policy "the desk reads ordinary found items" on public.lost_items
  for select to authenticated
  using (public.has_permission('lostfound.manage') and sensitivity = 'normal');

-- Whoever logged an item can see what they logged — a housekeeper who handed
-- in a ring should be able to say "yes, I logged that" — but no one else's.
create policy "a logger reads what they logged" on public.lost_items
  for select to authenticated
  using (created_by = auth.uid() and public.can_log_lost_items());

-- Storage and notes may be corrected by the people running the queue; the
-- trigger keeps status honest and logs every move.
create policy "the desk updates ordinary found items" on public.lost_items
  for update to authenticated
  using (public.can_manage_lost_items() and (sensitivity = 'normal' or public.is_admin()))
  with check (public.can_manage_lost_items() and (sensitivity = 'normal' or public.is_admin()));

-- Inserts go through log_found_item(), which allocates the reference.

create policy "staff read claims on items they can see" on public.lost_item_claims
  for select to authenticated
  using (exists (select 1 from public.lost_items i where i.id = item_id));

create policy "staff read returns on items they can see" on public.lost_item_returns
  for select to authenticated
  using (public.can_manage_lost_items()
         and exists (select 1 from public.lost_items i where i.id = item_id));

create policy "the desk reads guest reports" on public.lost_reports
  for select to authenticated using (public.can_manage_lost_items());

create policy "the desk links guest reports" on public.lost_reports
  for update to authenticated
  using (public.can_manage_lost_items()) with check (public.can_manage_lost_items());

-- A guest reads their own reports; everything else goes through RPCs.
create policy "a guest reads their own reports" on public.lost_reports
  for select to authenticated
  using (
    (companion_id is not null and companion_id = public.current_companion_id())
    or (companion_id is null and customer_id = public.current_customer_id())
  );

-- ======================================================== the guest's view ==
--
-- What the owner of a case may see, and nothing about storage, who found it,
-- or the distinguishing detail they will be asked to describe. Owned by the
-- migration role, so it reads past RLS; `owns_lost_item` is the whole
-- boundary, and `security_barrier` keeps a crafted filter from being pushed
-- beneath it.

create view public.guest_lost_items
with (security_barrier = true)
as
select
  i.id,
  i.reference,
  i.title,
  i.category,
  i.description,
  i.brand,
  i.colour,
  i.photo_paths,
  i.location,
  i.villa_id,
  i.room_id,
  i.found_at,
  i.status,
  i.booking_id,
  i.companion_id,
  -- The current claim, if any, and what came of it.
  (select c.status from public.lost_item_claims c
    where c.item_id = i.id order by c.created_at desc limit 1)      as claim_status,
  (select c.rejection_note from public.lost_item_claims c
    where c.item_id = i.id order by c.created_at desc limit 1)      as claim_note,
  r.method              as return_method,
  r.courier_provider,
  r.tracking_number,
  r.shipping_status,
  r.shipping_cost,
  r.paid_by,
  r.payment_status      as shipping_payment_status,
  r.expected_delivery,
  r.delivered_at,
  r.pickup_at,
  r.recipient_name,
  r.city                as delivery_city,
  public.owns_lost_item(i.id) as is_mine_to_answer,
  i.updated_at
from public.lost_items i
left join public.lost_item_returns r on r.item_id = i.id
where public.can_view_lost_item(i.id)
  -- Only once the property has decided to tell them. An item quietly tied to
  -- a booking during review is not yet the guest's business.
  and i.status not in ('found', 'under_review', 'guest_identified');

comment on view public.guest_lost_items is
  'A guest''s window onto their own case: the item, their claim, their return. No storage, no finder, no distinguishing detail.';

revoke all on public.guest_lost_items from public, anon;
grant select on public.guest_lost_items to authenticated;

-- ============================================================= storage ==

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lost-found', 'lost-found', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: items/{item_id}/…  and  reports/{report_id}/…
create policy "staff upload found item photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'lost-found' and public.can_log_lost_items()
              and (storage.foldername(name))[1] = 'items');

create policy "staff read found item photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'lost-found' and public.can_log_lost_items());

-- The owner may see the photograph of their own item — that is how they
-- recognise it.
create policy "an owner reads their item photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lost-found'
    and (storage.foldername(name))[1] = 'items'
    and public.can_view_lost_item(((storage.foldername(name))[2])::uuid)
  );

create policy "a guest uploads a photo with their report"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'lost-found' and (storage.foldername(name))[1] = 'reports');

create policy "a guest reads their own report photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lost-found'
    and (storage.foldername(name))[1] = 'reports'
    and exists (
      select 1 from public.lost_reports r
      where r.id::text = (storage.foldername(name))[2]
        and ((r.companion_id is not null and r.companion_id = public.current_companion_id())
             or (r.companion_id is null and r.customer_id = public.current_customer_id()))
    )
  );

-- ============================================================ permissions ==
--
-- Two new keys, granted as ordinary rows so the owner can move them without a
-- migration. Housekeeping and the kitchen may log; the desk may run the
-- queue; management holds everything through is_admin().

insert into public.department_permissions (department_id, permission)
select d.id, p.permission
from public.departments d
join (values
  ('housekeeping', 'lostfound.log'),
  ('kitchen',      'lostfound.log'),
  ('maintenance',  'lostfound.log'),
  ('front_desk',   'lostfound.log'),
  ('front_desk',   'lostfound.manage'),
  ('manager',      'lostfound.log'),
  ('manager',      'lostfound.manage')
) as p(slug, permission) on p.slug = d.slug
on conflict do nothing;

-- ================================================================= RPCs ==

/**
 * Log a found item. Photo-first: a title, where, and where it is kept is
 * enough to make a reliable record; the rest can follow.
 */
create or replace function public.log_found_item(
  p_title          text,
  p_category       public.lost_item_category,
  p_location       public.lost_item_location,
  p_villa_id       uuid default null,
  p_room_id        uuid default null,
  p_location_note  text default '',
  p_description    text default '',
  p_brand          text default '',
  p_colour         text default '',
  p_distinguishing text default '',
  p_quantity       int default 1,
  p_sensitivity    public.lost_item_sensitivity default 'normal',
  p_found_at       timestamptz default now(),
  p_found_by_name  text default '',
  p_storage        text default '',
  p_storage_ref    text default '',
  p_secured        boolean default false,
  p_booking_id     uuid default null
)
returns public.lost_items
language plpgsql security definer set search_path = public
as $$
declare
  v_item      public.lost_items%rowtype;
  v_days      int;
  v_dept      uuid;
begin
  if not public.can_log_lost_items() then
    raise exception 'Your department cannot log found items' using errcode = '42501';
  end if;

  select case p_sensitivity
           when 'high_value' then lost_found_high_value_retention_days
           when 'sensitive'  then lost_found_sensitive_retention_days
           else lost_found_retention_days
         end
    into v_days
  from public.property_settings limit 1;

  select department_id into v_dept from public.profiles where id = auth.uid();

  insert into public.lost_items (
    reference, title, category, sensitivity, description, brand, colour,
    distinguishing, quantity, location, villa_id, room_id, location_note,
    found_at, found_by_name, department_id, storage_location, storage_ref,
    secured, booking_id, retention_until, created_by
  ) values (
    'LF-' || nextval('public.lost_item_reference_seq'),
    trim(p_title), p_category,
    p_sensitivity,
    coalesce(p_description, ''), coalesce(p_brand, ''), coalesce(p_colour, ''),
    coalesce(p_distinguishing, ''), greatest(coalesce(p_quantity, 1), 1),
    p_location, p_villa_id, p_room_id, coalesce(p_location_note, ''),
    coalesce(p_found_at, now()),
    coalesce(nullif(trim(p_found_by_name), ''),
             (select full_name from public.profiles where id = auth.uid()), ''),
    v_dept,
    coalesce(p_storage, ''), coalesce(p_storage_ref, ''),
    -- Anything valuable or sensitive is secured, whatever the form said.
    p_secured or p_sensitivity <> 'normal',
    p_booking_id,
    (coalesce(p_found_at, now()) at time zone 'Asia/Kolkata')::date + coalesce(v_days, 90),
    auth.uid()
  )
  returning * into v_item;

  perform public.log_custody(v_item.id, 'Found and logged',
    v_item.title || coalesce(' — ' || nullif(v_item.storage_location, ''), ''));

  -- Management hears about anything valuable at once.
  if v_item.sensitivity <> 'normal' then
    perform public.notify_staff('lost_found',
      'Valuable item logged', v_item.reference || ' — ' || v_item.title, null::uuid);
  end if;

  return v_item;
end;
$$;

/** Attach the photograph paths after upload. The upload needs the item id
 *  for its path, so it cannot happen inside log_found_item. */
create or replace function public.add_lost_item_photos(p_item_id uuid, p_paths text[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.can_log_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.lost_items
     set photo_paths = photo_paths || p_paths
   where id = p_item_id
     and (created_by = auth.uid() or public.can_manage_lost_items());
end;
$$;

/**
 * Who might own this — suggestions, never conclusions.
 *
 * Stays at the same villa (and the same room, when there is one) that were in
 * the house when it was found or left in the week before. The desk decides;
 * nothing here ties an item to anyone.
 */
create or replace function public.suggest_lost_item_owners(p_item_id uuid)
returns table (
  booking_id    uuid,
  reference     text,
  customer_id   uuid,
  guest_name    text,
  check_in      date,
  check_out     date,
  same_room     boolean,
  companion_names text[]
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
  v_day  date;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.villa_id is null then return; end if;

  v_day := (v_item.found_at at time zone 'Asia/Kolkata')::date;

  return query
  select
    b.id, b.reference, b.customer_id, c.name, b.check_in, b.check_out,
    (v_item.room_id is not null and exists (
       select 1 from public.booking_rooms br
       where br.booking_id = b.id and br.room_id = v_item.room_id)),
    coalesce(array(
      select bc.full_name from public.booking_companions bc
      where bc.booking_id = b.id order by bc.created_at), '{}')
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.villa_id = v_item.villa_id
    and b.status not in ('cancelled', 'rejected', 'no_show', 'inquiry')
    and b.check_in <= v_day
    and b.check_out >= v_day - 7
  order by
    -- The room it was found in first, then whoever left most recently.
    (v_item.room_id is not null and exists (
       select 1 from public.booking_rooms br
       where br.booking_id = b.id and br.room_id = v_item.room_id)) desc,
    b.check_out desc
  limit 8;
end;
$$;

/**
 * Staff decide whose it probably is. The item moves to "guest identified";
 * the guest is not told yet — that is a separate, deliberate step.
 */
create or replace function public.identify_lost_item_owner(
  p_item_id      uuid,
  p_booking_id   uuid,
  p_companion_id uuid default null
)
returns public.lost_items
language plpgsql security definer set search_path = public
as $$
declare
  v_item    public.lost_items%rowtype;
  v_booking public.bookings%rowtype;
  v_name    text;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.sensitivity <> 'normal' and not public.is_admin() then
    raise exception 'Valuable and sensitive items are handled by management'
      using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'No such booking' using errcode = '23503';
  end if;

  if p_companion_id is not null and not exists (
    select 1 from public.booking_companions
    where id = p_companion_id and booking_id = p_booking_id
  ) then
    raise exception 'That guest is not on that booking' using errcode = '23514';
  end if;

  update public.lost_items
     set booking_id = p_booking_id,
         customer_id = v_booking.customer_id,
         companion_id = p_companion_id,
         status = case when status in ('found', 'under_review') then 'guest_identified'
                       else status end
   where id = p_item_id
  returning * into v_item;

  select coalesce(
    (select full_name from public.booking_companions where id = p_companion_id),
    (select name from public.customers where id = v_booking.customer_id))
    into v_name;

  perform public.log_custody(p_item_id, 'Possible owner identified',
    coalesce(v_name, 'Guest') || ' · ' || v_booking.reference);

  return v_item;
end;
$$;

/**
 * Tell the guest — carefully. "May belong to you", never "is yours".
 * Returns how many portal notifications went out, so the page never claims to
 * have reached somebody it did not.
 */
create or replace function public.contact_lost_item_owner(p_item_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_item  public.lost_items%rowtype;
  v_villa text;
  v_sent  int;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.customer_id is null then
    raise exception 'Identify who it may belong to first' using errcode = '23514';
  end if;
  if v_item.sensitivity <> 'normal' and not public.is_admin() then
    raise exception 'Valuable and sensitive items are handled by management'
      using errcode = '42501';
  end if;

  update public.lost_items set status = 'guest_contacted' where id = p_item_id;

  select name into v_villa from public.villas where id = v_item.villa_id;

  v_sent := public.notify_lost_item_owner_of(
    p_item_id,
    'We found something',
    'Our team found an item that may belong to you after your stay' ||
      coalesce(' at ' || v_villa, '') || ': ' || v_item.title ||
      '. Please let us know whether it is yours.');

  perform public.log_custody(p_item_id, 'Guest contacted',
    case when v_sent > 0 then 'Portal notification sent'
         else 'No portal login — contact them by phone' end);

  return v_sent;
end;
$$;

/**
 * The guest answers. "Mine" opens a claim with their own description, which a
 * person checks against the item. "Not mine" is recorded and sends the item
 * back for review. Neither releases anything.
 */
create or replace function public.respond_to_lost_item(
  p_item_id   uuid,
  p_is_mine   boolean,
  p_statement text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
begin
  if not public.owns_lost_item(p_item_id) then
    raise exception 'That is not your item' using errcode = '42501';
  end if;

  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.status not in ('guest_contacted', 'claim_rejected', 'unclaimed') then
    raise exception 'There is nothing to answer on this item right now'
      using errcode = '23514';
  end if;

  if p_is_mine then
    if length(trim(coalesce(p_statement, ''))) < 10 then
      raise exception 'Describe it in your own words — a mark, what was in it, where you left it'
        using errcode = '23514';
    end if;

    insert into public.lost_item_claims (item_id, customer_id, companion_id, statement)
    values (
      p_item_id,
      case when v_item.companion_id is null then v_item.customer_id end,
      v_item.companion_id,
      trim(p_statement)
    );
    update public.lost_items set status = 'claim_pending' where id = p_item_id;
    perform public.log_custody(p_item_id, 'Guest claimed it', 'Awaiting verification');
    perform public.notify_staff('lost_found', 'Lost item claimed',
      v_item.reference || ' — ' || v_item.title, null::uuid);
  else
    -- Wrong guest. Untie it so it can be offered to somebody else.
    update public.lost_items
       set status = 'under_review', booking_id = null, customer_id = null, companion_id = null
     where id = p_item_id;
    perform public.log_custody(p_item_id, 'Guest said it is not theirs', '');
  end if;
end;
$$;

/**
 * Verify or reject a claim. A person decides; high-value and sensitive items
 * are management's decision alone.
 */
create or replace function public.decide_lost_item_claim(
  p_claim_id uuid,
  p_approve  boolean,
  p_note     text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.lost_item_claims%rowtype;
  v_item  public.lost_items%rowtype;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_claim from public.lost_item_claims where id = p_claim_id;
  select * into v_item from public.lost_items where id = v_claim.item_id;

  if v_item.sensitivity <> 'normal' and not public.is_admin() then
    raise exception 'Only management can verify a claim on a valuable or sensitive item'
      using errcode = '42501';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'That claim has already been decided' using errcode = '23514';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why, so the guest is not left guessing' using errcode = '23514';
  end if;

  update public.lost_item_claims
     set status = case when p_approve then 'verified' else 'rejected' end::public.lost_claim_status,
         verified_by = auth.uid(), verified_at = now(),
         rejection_note = case when p_approve then '' else trim(p_note) end
   where id = p_claim_id;

  update public.lost_items
     set status = case when p_approve then 'claim_verified' else 'claim_rejected' end::public.lost_item_status
   where id = v_item.id;

  perform public.log_custody(v_item.id,
    case when p_approve then 'Claim verified' else 'Claim rejected' end,
    coalesce(nullif(trim(p_note), ''), ''));

  perform public.notify_lost_item_owner_of(v_item.id,
    case when p_approve then 'Your item is confirmed as yours'
         else 'We could not confirm the item' end,
    case when p_approve
         then v_item.title || ' — tell us whether you would like to collect it or have it sent.'
         else v_item.title || ': ' || trim(p_note) end);
end;
$$;

/**
 * The guest chooses how it comes back. Pickup, or a courier to an address
 * they give. The logistics — carrier, cost, tracking — are then the desk's.
 */
create or replace function public.choose_lost_item_return(
  p_item_id        uuid,
  p_method         public.lost_return_method,
  p_pickup_at      timestamptz default null,
  p_collected_by   text default '',
  p_recipient_name text default '',
  p_recipient_phone text default '',
  p_address_line1  text default '',
  p_address_line2  text default '',
  p_city           text default '',
  p_state          text default '',
  p_country        text default 'India',
  p_postal_code    text default '',
  p_delivery_notes text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
begin
  if not public.owns_lost_item(p_item_id) then
    raise exception 'That is not your item' using errcode = '42501';
  end if;

  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.status <> 'claim_verified' then
    raise exception 'We need to confirm the item is yours first' using errcode = '23514';
  end if;

  if p_method = 'courier' and (
       length(trim(coalesce(p_recipient_name, ''))) < 2
    or length(trim(coalesce(p_recipient_phone, ''))) < 6
    or length(trim(coalesce(p_address_line1, ''))) < 3
    or length(trim(coalesce(p_city, ''))) < 2
    or length(trim(coalesce(p_postal_code, ''))) < 3) then
    raise exception 'A courier needs a name, a phone number and a full address'
      using errcode = '23514';
  end if;

  insert into public.lost_item_returns (
    item_id, method, pickup_at, collected_by,
    recipient_name, recipient_phone, address_line1, address_line2,
    city, state, country, postal_code, delivery_notes,
    shipping_status
  ) values (
    p_item_id, p_method, p_pickup_at, coalesce(p_collected_by, ''),
    coalesce(p_recipient_name, ''), coalesce(p_recipient_phone, ''),
    coalesce(p_address_line1, ''), coalesce(p_address_line2, ''),
    coalesce(p_city, ''), coalesce(p_state, ''), coalesce(p_country, 'India'),
    coalesce(p_postal_code, ''), coalesce(p_delivery_notes, ''),
    case when p_method = 'courier' then 'quote_required'::public.courier_status end
  )
  on conflict (item_id) do update
    set method = excluded.method,
        pickup_at = excluded.pickup_at,
        collected_by = excluded.collected_by,
        recipient_name = excluded.recipient_name,
        recipient_phone = excluded.recipient_phone,
        address_line1 = excluded.address_line1,
        address_line2 = excluded.address_line2,
        city = excluded.city, state = excluded.state,
        country = excluded.country, postal_code = excluded.postal_code,
        delivery_notes = excluded.delivery_notes,
        shipping_status = excluded.shipping_status,
        updated_at = now();

  update public.lost_items set status = 'return_method_selected' where id = p_item_id;

  perform public.log_custody(p_item_id,
    case when p_method = 'courier' then 'Guest asked for a courier' else 'Guest will collect' end,
    case when p_method = 'courier'
         then trim(coalesce(p_city, '')) || ' ' || trim(coalesce(p_postal_code, ''))
         else coalesce(nullif(trim(p_collected_by), ''), '') end);

  perform public.notify_staff('lost_found', 'Return method chosen',
    v_item.reference || ' — ' ||
      case when p_method = 'courier' then 'courier' else 'collection' end, null::uuid);
end;
$$;

/**
 * The desk arranges the return: a collection slot, or the courier's details.
 * Moves the item to "return arranged" and then to ready-for-pickup or
 * in-transit as the facts arrive.
 */
create or replace function public.arrange_lost_item_return(
  p_item_id           uuid,
  p_courier_provider  text default null,
  p_tracking_number   text default null,
  p_shipping_cost     int default null,
  p_paid_by           public.shipping_payer default null,
  p_payment_status    public.shipping_payment_status default null,
  p_payment_reference text default null,
  p_shipping_status   public.courier_status default null,
  p_pickup_date       date default null,
  p_expected_delivery date default null,
  p_pickup_at         timestamptz default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item   public.lost_items%rowtype;
  v_return public.lost_item_returns%rowtype;
  v_before public.courier_status;
  v_note   text;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.lost_items where id = p_item_id;
  select * into v_return from public.lost_item_returns where item_id = p_item_id;
  if not found then
    raise exception 'The guest has not chosen how to receive it yet' using errcode = '23514';
  end if;
  v_before := v_return.shipping_status;

  update public.lost_item_returns
     set courier_provider  = coalesce(p_courier_provider, courier_provider),
         tracking_number   = coalesce(p_tracking_number, tracking_number),
         shipping_cost     = coalesce(p_shipping_cost, shipping_cost),
         paid_by           = coalesce(p_paid_by, paid_by),
         payment_status    = coalesce(p_payment_status, payment_status),
         payment_reference = coalesce(p_payment_reference, payment_reference),
         shipping_status   = coalesce(p_shipping_status, shipping_status),
         pickup_date       = coalesce(p_pickup_date, pickup_date),
         expected_delivery = coalesce(p_expected_delivery, expected_delivery),
         pickup_at         = coalesce(p_pickup_at, pickup_at),
         arranged_by       = coalesce(arranged_by, auth.uid()),
         delivered_at      = case when p_shipping_status = 'delivered'
                                  then coalesce(delivered_at, now()) else delivered_at end,
         updated_at        = now()
   where item_id = p_item_id
  returning * into v_return;

  -- Walk the item forward only as far as the facts allow.
  if v_item.status = 'return_method_selected' then
    update public.lost_items set status = 'return_arranged' where id = p_item_id;
    v_item.status := 'return_arranged';
  end if;

  if v_return.method = 'pickup' and v_item.status = 'return_arranged'
     and v_return.pickup_at is not null then
    update public.lost_items set status = 'ready_for_pickup' where id = p_item_id;
    perform public.notify_lost_item_owner_of(p_item_id, 'Ready for you to collect',
      v_item.title || ' is at reception from ' ||
        to_char(v_return.pickup_at at time zone 'Asia/Kolkata', 'DD Mon, HH24:MI') ||
        '. Please bring photo ID.');
  end if;

  if v_return.method = 'courier' and v_return.shipping_status is distinct from v_before then
    -- Once it has left, it is in transit — including when the desk records
    -- "delivered" without ever recording it leaving. Each step is a legal
    -- transition on its own, so the trigger is satisfied both times.
    if v_return.shipping_status in ('picked_up', 'in_transit', 'out_for_delivery', 'delivered')
       and v_item.status = 'return_arranged' then
      update public.lost_items set status = 'in_transit' where id = p_item_id;
      v_item.status := 'in_transit';
    end if;

    if v_return.shipping_status = 'delivered' and v_item.status = 'in_transit' then
      update public.lost_items set status = 'returned', disposition = 'returned'
       where id = p_item_id;
    elsif v_return.shipping_status in ('delivery_failed', 'returned_to_property')
       and v_item.status = 'in_transit' then
      update public.lost_items set status = 'return_arranged' where id = p_item_id;
    end if;

    v_note := case v_return.shipping_status
      when 'awaiting_payment'     then 'Shipping is ' || coalesce(v_return.shipping_cost::text, '?') ||
                                       ' rupees, payable by ' || coalesce(v_return.paid_by::text, 'you') || '.'
      when 'ready_to_ship'        then 'Packed and ready to go.'
      when 'pickup_scheduled'     then 'The courier collects it ' ||
                                       coalesce(to_char(v_return.pickup_date, 'DD Mon'), 'soon') || '.'
      when 'picked_up'            then 'On its way with ' || coalesce(nullif(v_return.courier_provider, ''), 'the courier') || '.'
      when 'in_transit'           then 'In transit' || coalesce(', tracking ' || nullif(v_return.tracking_number, ''), '') || '.'
      when 'out_for_delivery'     then 'Out for delivery today.'
      when 'delivered'            then 'Delivered. We hope it found you well.'
      when 'delivery_failed'      then 'The courier could not deliver it. We will be in touch.'
      when 'returned_to_property' then 'It came back to us. We will arrange it again.'
      else null end;

    if v_note is not null then
      perform public.notify_lost_item_owner_of(p_item_id, 'Your return: ' ||
        replace(v_return.shipping_status::text, '_', ' '), v_item.title || ' — ' || v_note);
    end if;
  end if;

  perform public.log_custody(p_item_id, 'Return updated',
    concat_ws(' · ',
      nullif(v_return.courier_provider, ''),
      nullif(v_return.tracking_number, ''),
      v_return.shipping_status::text));
end;
$$;

/**
 * Hand it over at the desk. The one step that needs a person, an ID check and
 * a name — which is why the guest can never mark an item returned.
 */
create or replace function public.release_lost_item(
  p_item_id      uuid,
  p_collected_by text,
  p_id_checked   boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.sensitivity <> 'normal' and not public.is_admin() then
    raise exception 'Only management can release a valuable or sensitive item'
      using errcode = '42501';
  end if;
  if not p_id_checked then
    raise exception 'Check the collector''s photo ID before releasing it' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_collected_by, ''))) < 2 then
    raise exception 'Record who collected it' using errcode = '23514';
  end if;

  update public.lost_item_returns
     set collected_by = trim(p_collected_by), id_checked = true,
         released_by = auth.uid(), released_at = now(), updated_at = now()
   where item_id = p_item_id;

  update public.lost_items set status = 'returned', disposition = 'returned'
   where id = p_item_id;

  perform public.log_custody(p_item_id, 'Released at the desk',
    'Collected by ' || trim(p_collected_by) || ', photo ID checked');
  perform public.notify_lost_item_owner_of(p_item_id, 'Collected',
    v_item.title || ' was collected by ' || trim(p_collected_by) || '.');
end;
$$;

/**
 * The end of the line for something nobody claimed. Management alone for
 * valuable and sensitive items — a passport is handed to the authorities,
 * not binned.
 */
create or replace function public.dispose_lost_item(
  p_item_id     uuid,
  p_disposition public.lost_item_disposition,
  p_note        text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.sensitivity <> 'normal' and not public.is_admin() then
    raise exception 'Only management can decide what happens to a valuable or sensitive item'
      using errcode = '42501';
  end if;
  if p_disposition = 'returned' then
    raise exception 'Returning an item goes through the return, not disposal'
      using errcode = '23514';
  end if;

  if v_item.status not in ('unclaimed') then
    update public.lost_items set status = 'unclaimed' where id = p_item_id;
  end if;
  update public.lost_items
     set status = 'disposed', disposition = p_disposition,
         disposition_note = coalesce(p_note, '')
   where id = p_item_id;

  perform public.log_custody(p_item_id, 'Final disposition',
    replace(p_disposition::text, '_', ' ') || coalesce(' — ' || nullif(trim(p_note), ''), ''));
end;
$$;

/** Move an item one legal step that none of the RPCs above covers —
 *  under review, unclaimed, closed. The trigger still has the last word. */
create or replace function public.set_lost_item_status(
  p_item_id uuid,
  p_status  public.lost_item_status,
  p_note    text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item public.lost_items%rowtype;
begin
  if not public.can_manage_lost_items() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_item from public.lost_items where id = p_item_id;
  if v_item.sensitivity <> 'normal' and not public.is_admin() then
    raise exception 'Valuable and sensitive items are handled by management'
      using errcode = '42501';
  end if;
  if p_status not in ('under_review', 'unclaimed', 'closed') then
    raise exception 'Use the step for that — claims, returns and disposal each have their own'
      using errcode = '23514';
  end if;

  update public.lost_items
     set status = p_status,
         closed_at = case when p_status = 'closed' then now() else closed_at end
   where id = p_item_id;

  perform public.log_custody(p_item_id,
    'Marked ' || replace(p_status::text, '_', ' '), coalesce(p_note, ''));
end;
$$;

/**
 * A guest reports something missing. Their own report, tied to them; the
 * desk matches it to a found item — the guest is never shown the found list.
 */
create or replace function public.report_lost_item(
  p_title         text,
  p_category      public.lost_item_category default 'other',
  p_description   text default '',
  p_colour        text default '',
  p_brand         text default '',
  p_location_note text default '',
  p_lost_at       timestamptz default null,
  p_contact_pref  text default 'portal'
)
returns public.lost_reports
language plpgsql security definer set search_path = public
as $$
declare
  v_report    public.lost_reports%rowtype;
  v_companion uuid := public.current_companion_id();
  v_customer  uuid := public.current_customer_id();
  v_booking   uuid;
begin
  if v_companion is null and v_customer is null then
    raise exception 'Sign in as a guest to report something' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then
    raise exception 'What did you lose?' using errcode = '23514';
  end if;

  if v_companion is not null then
    select booking_id into v_booking from public.booking_companions where id = v_companion;
  else
    select id into v_booking from public.bookings
     where customer_id = v_customer
       and status not in ('cancelled', 'rejected', 'inquiry')
     order by check_out desc limit 1;
  end if;

  insert into public.lost_reports (
    reference, customer_id, companion_id, booking_id, title, category,
    description, colour, brand, location_note, lost_at, contact_pref
  ) values (
    'LR-' || nextval('public.lost_report_reference_seq'),
    case when v_companion is null then v_customer end,
    v_companion, v_booking, trim(p_title), p_category,
    coalesce(p_description, ''), coalesce(p_colour, ''), coalesce(p_brand, ''),
    coalesce(p_location_note, ''), p_lost_at, coalesce(p_contact_pref, 'portal')
  )
  returning * into v_report;

  perform public.notify_staff('lost_found', 'A guest reported something lost',
    v_report.reference || ' — ' || v_report.title, null::uuid);

  return v_report;
end;
$$;

/** How many open found items loosely resemble a report. A number, never the
 *  items: a guest must not be able to browse what other people left behind. */
create or replace function public.lost_report_possible_matches(p_report_id uuid)
returns int
language plpgsql stable security definer set search_path = public
as $$
declare
  v_report public.lost_reports%rowtype;
  v_count  int;
begin
  select * into v_report from public.lost_reports where id = p_report_id;
  if not found then return 0; end if;
  if not public.can_manage_lost_items()
     and not ((v_report.companion_id is not null and v_report.companion_id = public.current_companion_id())
              or (v_report.companion_id is null and v_report.customer_id = public.current_customer_id())) then
    raise exception 'Not your report' using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.lost_items i
  where i.status in ('found', 'under_review', 'unclaimed')
    and i.category = v_report.category
    and (v_report.colour = '' or i.colour ilike '%' || v_report.colour || '%'
         or i.title ilike '%' || v_report.colour || '%');
  return v_count;
end;
$$;

-- Grants. Everything is authenticated-only; each function checks the caller.
do $$
declare f text;
begin
  foreach f in array array[
    'log_found_item', 'add_lost_item_photos', 'suggest_lost_item_owners',
    'identify_lost_item_owner', 'contact_lost_item_owner', 'respond_to_lost_item',
    'decide_lost_item_claim', 'choose_lost_item_return', 'arrange_lost_item_return',
    'release_lost_item', 'dispose_lost_item', 'set_lost_item_status',
    'report_lost_item', 'lost_report_possible_matches'
  ] loop
    execute format('revoke all on function public.%I from public, anon', f);
    execute format('grant execute on function public.%I to authenticated', f);
  end loop;
end $$;
