-- GST must be a rate that actually exists.
--
-- HOS-1020 was created carrying tax_rate = 0.250. There is no 25% GST band on
-- accommodation in India: it is 12% up to a tariff of 7,500 a night and 18%
-- above it, with 5% applying to food billed separately.
--
-- The booking form allowed any number up to 28, so the wrong rate reached the
-- database and produced an invoice charging 14,500 instead of 10,440 — a real
-- overcharge on a real document. The form is now a fixed choice, and this
-- constraint means no client can bypass it.

-- Correct the affected booking first, or the constraint below rejects it.
-- 29,000 a night is above the 7,500 threshold, so 18% is the right band.
update public.bookings
   set tax_rate = 0.180
 where tax_rate not in (0, 0.05, 0.12, 0.18);

alter table public.bookings
  add constraint bookings_tax_rate_is_a_legal_gst_band
  check (tax_rate in (0, 0.05, 0.12, 0.18));

comment on column public.bookings.tax_rate is
  'GST as a fraction. Only 0, 0.05, 0.12 or 0.18 — the bands that exist. '
  '12%% up to a 7,500 nightly tariff, 18%% above it; 5%% for food billed apart.';

-- Invoices carry their own copy of the rate for the historical record, so it
-- gets the same guard.
update public.invoices
   set tax_rate = 0.180
 where tax_rate not in (0, 0.05, 0.12, 0.18);

alter table public.invoices
  add constraint invoices_tax_rate_is_a_legal_gst_band
  check (tax_rate in (0, 0.05, 0.12, 0.18));
