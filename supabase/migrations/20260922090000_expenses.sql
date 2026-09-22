-- What the property spends.
--
-- Revenue has had a home since the first migration; the other side of the
-- ledger has been kept in somebody's notebook. Reports can only ever be half
-- a picture until spend is a row.
--
-- Owner-only, like pay. A manager runs the day and does not need to see what
-- the property paid its electrician, and RLS is the only place that can be
-- enforced — hiding the nav item is presentation, not access control.

create type public.expense_category as enum (
  'salaries',
  'utilities',
  'supplies',
  'maintenance',
  'food_and_beverage',
  'marketing',
  'commission',
  'taxes_and_fees',
  'other'
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  -- The villa it belongs to, when it belongs to one. A generator service is
  -- Villa Maaya's; the accountant's fee is nobody's in particular.
  villa_id     uuid references public.villas (id) on delete set null,
  spent_on     date not null,
  category     public.expense_category not null default 'other',
  -- Whole rupees, like every other money column here.
  amount       int not null check (amount >= 0),
  payee        text not null default '',
  note         text not null default '',
  -- How it was settled, as the property would say it: UPI, bank, cash.
  method       text not null default '',
  reference    text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index expenses_spent_on_idx on public.expenses (spent_on desc);
create index expenses_villa_idx on public.expenses (villa_id);

comment on table public.expenses is
  'Money out. Owner-only — a manager may run the property without seeing its costs.';

alter table public.expenses enable row level security;

create policy "owner reads expenses" on public.expenses
  for select using (public.is_owner());

create policy "owner writes expenses" on public.expenses
  for all using (public.is_owner()) with check (public.is_owner());
