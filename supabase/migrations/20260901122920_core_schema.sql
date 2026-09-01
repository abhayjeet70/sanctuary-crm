-- Core tables.
--
-- Money is stored in whole rupees as integers. The property does not price in
-- paise, and integers keep totals exact — no float drift on an invoice.

-- ---------------------------------------------------------------- profiles --
-- One row per auth user. `role` is mirrored into the JWT by a trigger in
-- 20260901122931 so RLS can read it without a table lookup on every request.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.app_role not null default 'guest',
  full_name   text not null default '',
  customer_id uuid,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- villas ----
create table public.villas (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  description    text not null default '',
  image          text,
  gallery        text[] not null default '{}',
  bedrooms       int  not null check (bedrooms > 0),
  capacity       int  not null check (capacity > 0),
  mode           public.villa_mode   not null default 'whole',
  status         public.villa_status not null default 'active',
  base_rate      int not null check (base_rate >= 0),
  weekend_rate   int not null default 0 check (weekend_rate >= 0),
  seasonal_rate  int not null default 0 check (seasonal_rate >= 0),
  check_in_time  time not null default '14:00',
  check_out_time time not null default '11:00',
  amenities      text[] not null default '{}',
  wifi_network   text not null default '',
  wifi_password  text not null default '',
  created_at     timestamptz not null default now()
);

create table public.rooms (
  id        uuid primary key default gen_random_uuid(),
  villa_id  uuid not null references public.villas (id) on delete cascade,
  name      text not null,
  capacity  int  not null check (capacity > 0),
  status    public.room_status not null default 'available',
  base_rate int  not null default 0 check (base_rate >= 0),
  unique (villa_id, name)
);
create index rooms_villa_id_idx on public.rooms (villa_id);

-- ------------------------------------------------------------- customers ----
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  email       text not null,
  city        text not null default '',
  guest_type  public.guest_type not null default 'new',
  preferences text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now()
);
create index customers_email_idx on public.customers (lower(email));
create index customers_phone_idx on public.customers (phone);

alter table public.profiles
  add constraint profiles_customer_id_fkey
  foreign key (customer_id) references public.customers (id) on delete set null;

-- -------------------------------------------------------------- bookings ----
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  customer_id    uuid not null references public.customers (id) on delete restrict,
  villa_id       uuid not null references public.villas (id)    on delete restrict,
  booking_mode   public.villa_mode     not null default 'whole',
  check_in       date not null,
  check_out      date not null,
  adults         int  not null default 1 check (adults >= 1),
  children       int  not null default 0 check (children >= 0),
  source         public.booking_source not null default 'website',
  status         public.booking_status not null default 'inquiry',
  payment_status public.payment_status not null default 'pending',

  -- BR6: the charge breakdown, never a single "amount".
  nightly_rate       int not null default 0 check (nightly_rate       >= 0),
  nights             int not null default 0 check (nights             >= 0),
  weekend_surcharge  int not null default 0 check (weekend_surcharge  >= 0),
  seasonal_surcharge int not null default 0 check (seasonal_surcharge >= 0),
  extra_guest_charge int not null default 0 check (extra_guest_charge >= 0),
  food               int not null default 0 check (food               >= 0),
  add_ons            int not null default 0 check (add_ons            >= 0),
  discount           int not null default 0 check (discount           >= 0),
  tax_rate           numeric(4,3) not null default 0.180 check (tax_rate >= 0 and tax_rate <= 1),
  amount_paid        int not null default 0 check (amount_paid >= 0),

  special_requests text,
  internal_notes   text,
  created_at       timestamptz not null default now(),

  -- BR2: half-open ranges. A check-out on the 3rd is not a stay on the 3rd.
  constraint bookings_dates_ordered check (check_out > check_in)
);
create index bookings_villa_dates_idx on public.bookings (villa_id, check_in, check_out);
create index bookings_customer_idx    on public.bookings (customer_id);
create index bookings_status_idx      on public.bookings (status);

-- The rooms a booking holds. A whole-villa booking is expanded into a row per
-- bedroom by a trigger (20260901122925), which is what makes BR4 fall out of
-- one exclusion constraint instead of special-case logic.
create table public.booking_rooms (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  room_id    uuid not null references public.rooms (id)    on delete cascade,
  primary key (booking_id, room_id)
);
create index booking_rooms_room_idx on public.booking_rooms (room_id);

-- -------------------------------------------------------------- payments ----
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  amount           int  not null check (amount > 0),
  method           public.payment_method not null,
  reference        text not null,
  -- A path inside the private `payment-receipts` bucket, never a public URL.
  receipt_path     text,
  status           public.payment_status not null default 'uploaded',
  rejection_reason public.payment_rejection_reason,
  rejection_note   text,
  verified_by      uuid references auth.users (id),
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),

  -- BR7: a rejection always carries a reason.
  constraint payments_rejection_has_reason
    check (status <> 'rejected' or rejection_reason is not null)
);
create index payments_booking_idx on public.payments (booking_id);
create index payments_status_idx  on public.payments (status) where status = 'uploaded';

-- -------------------------------------------------------------- invoices ----
create table public.invoices (
  id         uuid primary key default gen_random_uuid(),
  number     text not null unique,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  issued_at  date not null default current_date,
  tax_rate   numeric(4,3) not null default 0.180,
  status     public.invoice_status not null default 'draft',
  created_at timestamptz not null default now()
);
create index invoices_booking_idx on public.invoices (booking_id);

-- ------------------------------------------------------------------ food ----
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  price       int  not null check (price >= 0),
  image       text,
  category    public.menu_category not null,
  is_veg      boolean not null default true,
  available   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.food_orders (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  booking_id  uuid not null references public.bookings (id)  on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  villa_id    uuid not null references public.villas (id)    on delete restrict,
  room_id     uuid references public.rooms (id) on delete set null,
  status      public.food_order_status not null default 'placed',
  notes       text,
  placed_at   timestamptz not null default now()
);
create index food_orders_booking_idx on public.food_orders (booking_id);
create index food_orders_status_idx  on public.food_orders (status);

create table public.food_order_lines (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.food_orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  -- Name and price are copied, not joined: an order is a record of what was
  -- charged, and must not change when the menu is repriced.
  name         text not null,
  price        int  not null check (price >= 0),
  quantity     int  not null check (quantity > 0)
);
create index food_order_lines_order_idx on public.food_order_lines (order_id);

-- -------------------------------------------------------------- requests ----
create table public.guest_requests (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  booking_id  uuid not null references public.bookings (id)  on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  villa_id    uuid not null references public.villas (id)    on delete restrict,
  category    public.request_category not null,
  description text not null,
  priority    public.request_priority not null default 'normal',
  status      public.request_status   not null default 'pending',
  assigned_to public.team,
  created_at  timestamptz not null default now()
);
create index guest_requests_status_idx  on public.guest_requests (status);
create index guest_requests_booking_idx on public.guest_requests (booking_id);

-- -------------------------------------------------------------- feedback ----
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id)  on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  villa_id    uuid not null references public.villas (id)    on delete restrict,
  rating      int  not null check (rating between 1 and 5),
  comment     text not null default '',
  reviewed    boolean not null default false,
  reply       text,
  created_at  timestamptz not null default now()
);
create index feedback_booking_idx on public.feedback (booking_id);

-- -------------------------------------------------------------- activity ----
create table public.activity_events (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null,
  kind       public.activity_kind not null,
  title      text not null,
  detail     text,
  actor      text not null default 'System',
  at         timestamptz not null default now()
);
create index activity_events_entity_idx on public.activity_events (entity_id, at desc);

create table public.notifications (
  id      uuid primary key default gen_random_uuid(),
  kind    public.activity_kind not null,
  title   text not null,
  detail  text not null default '',
  at      timestamptz not null default now(),
  read    boolean not null default false
);

-- ----------------------------------------------------------------- money ----
-- BR6 in one place. Every screen and every RPC reads totals from here, so the
-- client and the server can never disagree about what a booking costs.
create view public.booking_totals as
select
  b.id as booking_id,
  (b.nightly_rate * b.nights)                                       as room_charge,
  (b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge) as surcharges,
  (b.food + b.add_ons)                                              as extras,
  b.discount,
  ((b.nightly_rate * b.nights)
    + b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge
    + b.food + b.add_ons - b.discount)                              as subtotal,
  round(((b.nightly_rate * b.nights)
    + b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge
    + b.food + b.add_ons - b.discount) * b.tax_rate)::int            as tax,
  (((b.nightly_rate * b.nights)
    + b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge
    + b.food + b.add_ons - b.discount)
    + round(((b.nightly_rate * b.nights)
      + b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge
      + b.food + b.add_ons - b.discount) * b.tax_rate)::int)         as total,
  b.amount_paid as paid,
  greatest(0,
    (((b.nightly_rate * b.nights)
      + b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge
      + b.food + b.add_ons - b.discount)
      + round(((b.nightly_rate * b.nights)
        + b.weekend_surcharge + b.seasonal_surcharge + b.extra_guest_charge
        + b.food + b.add_ons - b.discount) * b.tax_rate)::int)
    - b.amount_paid)                                                 as balance
from public.bookings b;
