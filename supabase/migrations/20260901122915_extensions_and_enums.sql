-- Extensions and the domain enums.
--
-- The enums mirror src/types/index.ts exactly. Keeping them as real Postgres
-- types (rather than text + check) means an invalid status is rejected by the
-- database, not just by TypeScript.

create extension if not exists "pgcrypto" with schema extensions;
-- btree_gist lets an exclusion constraint mix equality (villa_id) with overlap
-- (daterange). It is what makes double-booking impossible under concurrency.
create extension if not exists "btree_gist" with schema extensions;

create type public.app_role as enum ('admin', 'guest');

create type public.villa_mode as enum ('whole', 'split');
create type public.villa_status as enum ('active', 'maintenance', 'inactive');
create type public.room_status as enum ('available', 'occupied', 'blocked', 'cleaning');

create type public.guest_type as enum ('new', 'returning', 'vip', 'corporate');

create type public.booking_status as enum (
  'inquiry',
  'pending_payment',
  'payment_uploaded',
  'payment_approved',
  'confirmed',
  'checked_in',
  'in_house',
  'checked_out',
  'completed',
  'cancelled',
  'rejected',
  'no_show'
);

create type public.payment_status as enum (
  'pending', 'uploaded', 'approved', 'rejected', 'refunded', 'partial', 'paid'
);

create type public.booking_source as enum (
  'website', 'phone', 'whatsapp', 'goibibo', 'walk_in', 'referral', 'other'
);

create type public.payment_method as enum ('upi', 'bank_transfer', 'card', 'cash', 'gateway');

create type public.payment_rejection_reason as enum (
  'wrong_amount',
  'unreadable_receipt',
  'duplicate_receipt',
  'wrong_bank_account',
  'invalid_transaction',
  'other'
);

create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void');

create type public.menu_category as enum (
  'breakfast', 'south_indian', 'continental', 'lunch', 'dinner', 'snacks', 'beverages'
);

create type public.food_order_status as enum (
  'placed', 'confirmation_pending', 'confirmed', 'cooking', 'ready', 'served', 'billed', 'cancelled'
);

create type public.request_category as enum (
  'housekeeping', 'extra_towels', 'food', 'maintenance', 'transport', 'wifi', 'room_setup', 'other'
);

create type public.request_status as enum (
  'pending', 'assigned', 'in_progress', 'completed', 'rejected'
);

create type public.request_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.team as enum ('housekeeping', 'kitchen', 'maintenance', 'manager');

create type public.activity_kind as enum (
  'booking', 'payment', 'food', 'request', 'feedback', 'note', 'invoice'
);
