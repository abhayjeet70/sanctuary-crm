# Cancellations, refunds, reports and the marketplace-style booking flow

Written 24 Sept 2026. Status of each phase is at the bottom.

## 1. Goals

1. The booking popup reads like a marketplace listing (Goibibo / MakeMyTrip): a
   large card per villa with photo, name, highlights, cancellation terms and a
   price panel — and every step of the popup is the same large size.
2. The admin decides the **cancellation policy**: free cancellation yes/no, how
   many days before check-in it stays free, and what is deducted after that.
3. A guest can **cancel their own stay**, sees exactly what they will get back
   before confirming, and sees the consequences as a warning.
4. Staff get a **Cancellations & refunds** section: every cancelled booking, what
   was paid, what is owed back, what was retained, and a way to record the
   refund once the money has been sent.
5. A cancelled stay **releases its dates**; guests on the waiting list for those
   dates are surfaced to staff immediately.
6. **Finances stay in step** everywhere — booking page, guest payment page,
   invoices list, dashboard, reports — from a single source of truth.
7. **Reports**: bookings with billed / collected / cancelled / refunded / net
   revenue, over 1, 3, 6, 12 months or custom dates, downloadable.

## 2. Rules (modelled on how established travel brands do it)

| Rule | Decision |
|---|---|
| What is refunded | A percentage of **what the guest actually paid** (GST included). |
| Free cancellation = Yes | 100 % back until *N* days before check-in. After that, the tier table applies. |
| Free cancellation = No | The tier table applies from the moment of booking. |
| Tier table | Rows of "cancelled ≥ *D* days before check-in → refund *P* %", evaluated top-down; below the last row the refund is 0 %. Default matches the property's printed policy: ≥ 10 days → 50 %, otherwise 0 %. |
| Nothing paid yet | Cancels for free; there is nothing to refund or retain. |
| After check-in | Not cancellable by the guest. Staff use check-out / no-show. |
| Who decides the amount | **The server.** The guest's warning and the staff's dialog both ask `cancellation_quote()`; `cancel_booking()` recomputes and stores a **snapshot** of the policy used, so a later policy change never rewrites history. |
| Staff override | Staff can cancel on the guest's behalf and choose "waive the fee" (full refund) with a reason. |
| Refund lifecycle | `pending` (owed) → `processed` (sent: method + reference + date). `not_due` when nothing is owed. |
| Money kept | `retained = paid − refund`. Reported as cancellation income; the cancelled stay itself is never room revenue. |

## 3. Data model (`20260924140000_cancellation_and_refunds.sql`)

* `property_settings` += `cancellation_free`, `cancellation_free_days`,
  `cancellation_tiers jsonb`, `cancellation_note`.
* `public_stay_info()` also returns those, so the pre-login popup can print
  "Free cancellation until 12 Sep" on each villa card.
* `refunds` — one row per cancelled booking: amounts, percent, policy snapshot,
  who cancelled (guest/admin) and why, status, processed method/reference/date.
  RLS: staff all; guests read their own; **no direct writes** — RPCs only.
* `cancellation_quote(booking, on_date)` — pure read, callable by staff and the
  booking holder.
* `cancel_booking(booking, reason, waive_fee)` — validates who and when, writes
  the refund row, sets the booking `cancelled` (which frees the rooms and fires
  the existing waitlist trigger), logs activity, notifies staff.
* `process_refund(refund, method, reference, note)` — staff only; marks paid
  out, and flips the booking's approved payments to `refunded` on a full refund.

## 4. Screens

**Guest**
* Booking page: *Cancel this stay* → dialog with the refund breakdown, the
  warning list (dates released, voucher void, fee retained, cannot be undone),
  reason, and a typed-confirmation button.
* After cancelling: status card with the refund amount and its state.
* Dashboard / payment prompts are suppressed for cancelled stays.

**Admin**
* Settings → **Cancellation**: yes/no toggle, free-days, editable tier table,
  guest-facing note, and a live "what would a guest get" preview.
* Booking detail: the existing cancel button now opens the same dialog, plus
  *waive fee*, plus a list of guests waiting for these dates with a link to the
  waiting list to offer them the villa.
* **Cancellations & refunds** page: filters (status, period), totals (paid,
  refunded, retained, still owed), *Mark refunded* dialog, CSV download.
* Reports → new **Bookings** tab: every booking in the range with billed,
  collected, cancelled, refunded, retained and net; totals row; CSV. Presets
  gain **3 months** and **6 months** beside 12 months and custom dates.

**Booking popup**
* Every step uses the wide layout.
* Villa results become Goibibo-style cards: photo strip, name, "Entire villa /
  rooms free", highlight chips from the villa's amenities, cancellation line,
  and a right-hand price panel (per night, GST note, total for the stay).

## 5. Out of scope here (needs a payment gateway or a decision)

* Sending money back automatically. Refunds are *recorded* by staff after they
  transfer the money; there is no gateway in this product by design.
* Emailing the guest on refund. The status is visible in their portal; email
  can reuse `send-notification` once a `refund_processed` kind is wanted.
* Automatically giving the villa to the first waiting guest. Staff are
  notified and one click opens the waiting list; auto-offer changes who gets a
  booking and should be a deliberate choice.

## 6. Delivery phases

1. Plan (this file) — done
2. Migration + types + provider (data layer)
3. Admin: Cancellation settings tab
4. Shared cancel dialog + guest cancel + admin cancel
5. Admin: Cancellations & refunds page
6. Reports: Bookings tab + 3/6-month presets
7. Booking popup: wide layout + marketplace cards
8. Verify (typecheck, build) and apply migration
