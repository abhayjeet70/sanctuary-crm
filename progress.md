# Homes of Sanctuary CRM — Progress

Living status of the build. Updated 1 September 2026.

**Stack:** Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · React Router 7 · Supabase (Postgres + Auth + Storage + Edge Functions)

**Supabase project:** `tufwyptholucfgdrldzh` · region `ap-northeast-1` (Tokyo)
Direct `db.*` host does not resolve (IPv6-only). Use the pooler:
`aws-0-ap-northeast-1.pooler.supabase.com:5432`, user `postgres.tufwyptholucfgdrldzh`.

```bash
npm run dev     # http://localhost:5173
npm run test    # domain rules (money, conflicts) — node assert, no framework
npm run smoke   # renders all 31 routes × 2 roles offline; catches blank pages
npm run build   # tsc -b && vite build
```

**Sign in** - all three with password `demo123`:

| Account | Role | Lands on |
|---|---|---|
| `admin@gmail.com` | admin | `/admin` - the whole CRM |
| `housekeeping@gmail.com` | staff | `/staff` - that team's queue only |
| `user@gmail.com` | guest | `/guest` - Pooja Bothra's stay |

---

## 1. Built

### Design system
- `/design-system` — 12 sections: colour, type, spacing, buttons, forms, status,
  surfaces, tables, overlays, calendar, photography, states.
- Every token lives in `src/index.css`. No hex value in any component.
- Palette: ink `#142731`, sand `#F4EFE8`, stone `#A69C8E`, clay `#B5654A`,
  gold `#C9A961`. Display face Playfair Display, body Inter.
- **Contrast rule:** plain `gold` is decorative only (rules, rings, icons, large
  display type). `gold-700` is the only brass that clears AA on a light ground.
- Status is never colour alone — every badge carries a written label.

### Admin (11 routes)
| Route | State |
|---|---|
| `/admin/dashboard` | Figures, today's movements, occupancy, kitchen + requests |
| `/admin/bookings` | Search + 7 filters, table on desktop, cards below `lg` |
| `/admin/bookings/new` | Manual booking, live conflict check, capacity check |
| `/admin/bookings/:id` | Lifecycle actions, 4 tabs, money rail, timeline |
| `/admin/payments` | Verification queue, receipt viewer, amount-mismatch warning |
| `/admin/villas` · `/:id` | Whole ↔ split toggle, room occupancy, rates, Wi-Fi |
| `/admin/customers` · `/:id` | Spend, history, invoices, requests, feedback |
| `/admin/calendar` | Month grid + multi-villa Gantt timeline |
| `/admin/food` | 7-column kitchen board |
| `/admin/requests` | Assignment + priority board |
| `/admin/feedback` | Ratings, reply, mark reviewed |
| `/admin/invoices` · `/settings` | Invoice list; property config |

### Guest (8 routes)
Mobile-first, thumb-reachable bottom bar, desktop rail at `lg`.
Stay dashboard · booking detail · payment + receipt upload · printable invoice ·
amenities & Wi-Fi · food ordering with cart · requests · feedback.

### Backend — 19 migrations, all applied
- 15 tables, all with RLS. 40 policies across `public` and `storage`.
- **BR1–BR5 enforced structurally.** A whole-villa booking expands by trigger
  into a hold on all four bedrooms; one `btree_gist` exclusion constraint over
  `(room_id, daterange(check_in, check_out, '[)'))` does the rest. BR4 falls
  out of it with no special-case code.
- **BR12 as a trigger** — billing a food order folds its total into the
  booking's food charge, so invoice and kitchen board cannot drift.
- `booking_totals` view is the single source of money truth (BR6).
- RPCs for every multi-row operation: `create_booking`, `approve_payment`,
  `reject_payment`, `place_food_order`, `set_food_order_status`,
  `set_booking_status`, `find_booking_conflicts`, `create_booking_with_guest`.
- Private `payment-receipts` bucket, no DELETE policy for anyone.
- 4 Edge Functions deployed, all using the **caller's JWT, never service-role**:
  `verify-payment`, `create-booking`, `receipt-url`, `send-notification`.
- Realtime on 5 tables; notification triggers for uploaded receipts, new kitchen
  orders, guest requests and feedback of 3 stars or below.
- Three roles: `admin` (everything), `staff` (their team's queue only),
  `guest` (their own records only).

### Verified against the live database
| Check | Result |
|---|---|
| Duplicate whole-villa booking | Refused — `booking_rooms_no_overlap` |
| Different room, same dates | Allowed |
| Check-in on another's check-out day | Allowed (half-open range) |
| Guest inserts payment as `approved` | Refused by RLS |
| Guest calls `approve_payment` | Refused — "Only staff can approve payments" |
| Guest edits own booking rate | Refused (no UPDATE policy) |
| Guest raises `urgent` request | Refused by RLS |
| Anon reads bookings | Empty |
| Guest visibility | 2 bookings, 1 customer (vs admin's 14 and 6) |

---

## 2. Left to build

| # | Item | Status |
|---|---|---|
| L1 | Edit an existing booking | DONE - `/admin/bookings/:id/edit` + `update_booking` RPC |
| L2 | Payment gateway | **NOT WANTED.** See "Payment model" below - this is the design, not a gap |
| L3 | Email / WhatsApp | DONE - `send-notification` deployed; needs provider keys to deliver |
| L4 | Realtime notifications | DONE - Realtime subscription + 4 notification triggers |
| L5 | PDF invoice export | DONE - browser print-to-PDF |
| L6 | Room status derivation | DONE - `room_availability` view; occupancy is computed |
| L7 | Staff accounts | DONE - `staff` role, teams, `/staff` queue, RLS-isolated |

### Payment model - settled

**There is no payment gateway, by decision.** The flow is: guest transfers by
UPI or bank transfer, uploads the receipt in their portal, and an admin opens it
in the verification queue and approves or rejects it. That is the product, not a
placeholder, and the earlier "Pay now" button implying a card option has been
removed from the guest portal.

What this buys: no gateway fees, no PCI surface, no chargebacks, and the desk
keeps the final say on whether money actually arrived. What it costs: somebody
has to look at each receipt. At three villas that is a few minutes a day, which
is why the verification queue is built for speed - mismatched amounts are
flagged rather than left to the eye.

`payment_method` still carries a `gateway` value in the enum, unused. Removing
an enum value in Postgres is disruptive; it is left in place and unreferenced.

---

## 3. Issues found in audit

Ordered by severity. Resolution status updated in §4.

| # | Severity | Issue |
|---|---|---|
| I1 | **High** | ✅ Creating a booking for a **new guest is broken.** `NewBookingPage` fabricates `c-${Date.now()}` as the customer id — not a UUID, and no customer row exists — so `create_booking` fails on a foreign-key violation. Only bookings for existing guests work. |
| I2 | **High** | ✅ **Receipts do not render for admins.** After the Supabase swap `payment.receiptImage` holds a storage *path*, but `ReceiptViewer` puts it straight into `<img src>`. The payment queue — the daily-use screen — shows a broken image. |
| I3 | **High** | ✅ **Receipt upload never reaches storage.** The guest form creates a local object URL and stores that. The file never leaves the browser, and the URL is dead on reload. |
| I4 | Medium | ✅ **Seed money contradicts itself.** HOS-1004 and HOS-1009 are marked `paid` but compute to a balance of ₹708 and ₹710 — rounding carried over from the fixtures. Violates BR6's own consistency. |
| I5 | Medium | ✅ **`create_booking` reference collisions.** References are `HOS-` + 4 random digits against a unique constraint. ~1 in 9000 per booking, surfacing as an opaque 23505. |
| I6 | Medium | ✅ **Timeline entries silently lost.** `logActivity` is a no-op in the Supabase provider, so adding an internal note leaves no trace. Status changes still log via trigger; notes do not. |
| I7 | Low | ✅ **The dev badge lies.** It says "Dev / mock login" on every screen, but authentication is real now. |
| I8 | Low | ✅ **Dead link.** "Edit booking" points at a route that does not exist (see L1). |

Three more surfaced **while fixing the first eight** — all three were invisible
until the success paths were actually exercised:

| # | Severity | Issue |
|---|---|---|
| I9 | **Critical** | ✅ **`create_booking` had never worked.** `ERROR 42804: column "status" is of type booking_status but expression is of type text`. A `CASE` whose branches are all bare literals resolves to `text`, and `text → enum` needs an explicit cast. It went unnoticed because the only end-to-end test of that path used clashing dates on purpose and returned 409 from the conflict check *before reaching the INSERT*. A test that only exercises the failure path proves nothing about the success path. |
| I10 | Medium | ✅ **The useful conflict message never reached the desk.** The pre-check raised "already held by HOS-1018…" with errcode `23P01` — but the function's own `exception when exclusion_violation` handler caught it (23P01 *is* exclusion_violation) and rewrote it as "taken while you were filling the form". Reception was told it had lost a race when it had simply picked busy dates. |
| I11 | Medium | ✅ **`npm run smoke` broke.** Fixing I2 made `ReceiptViewer` import the Supabase client, which evaluates `import.meta.env` at module load — undefined in Node, so the harness died before rendering a single route. The client is now created lazily behind a `Proxy`, keeping the import side-effect free. |

---

## 4. Resolutions

All eleven are fixed and verified against the live database.

### I1 — new-guest booking (migrations `..._131215`, `..._163007`, `..._163214`)
`create_booking_with_guest` RPC creates the customer and the booking in **one
transaction**, matching on email or phone first so a returning guest who rings
up does not get a duplicate record. The form no longer fabricates an id.

*Verified:* booking for "Meera Raghavan" created (HOS-1018, whole villa, 4 room
holds, advance applied). Then the same call with clashing dates was refused —
and the customer count stayed at 7, so **no stranded customer row**. That
rollback is the reason it is one RPC rather than two client calls.

### I2 — receipts render (`ReceiptViewer`, `services/supabase/receipts.ts`)
`receipt_path` is resolved to a 5-minute signed URL on mount. PDFs get a
document affordance and an `<object>` viewer rather than a broken `<img>`.
Legacy full URLs pass through untouched, so the seeded fixtures still display.

### I3 — receipt upload reaches storage (`GuestPaymentPage`)
`uploadReceipt()` writes to the private bucket at `{booking_id}/{timestamp}.{ext}`
— that first path segment is what the storage RLS policy checks ownership
against. The upload happens **before** the payment row is written: no row is
created pointing at a file that failed to upload.

### I4 — money consistency (migration `..._131215`)
HOS-1004 and HOS-1009 were marked `paid` with balances of ₹708 and ₹710. Both
are completed stays, so `paid` was the true state and the amount received moved.
Anything still disagreeing is recalculated by `recalculate_payment_status`.
*Verified:* zero bookings now disagree with their computed balance.

### I5 — reference collisions (migration `..._131215`)
`booking_reference_seq` replaces 4 random digits, seeded above the highest
existing reference. *Verified:* HOS-1015, 1016, 1017 issued in sequence.

### I6 — note timeline (migration `..._131215`)
`bookings_note_activity_trg` fires on `internal_notes`, logging only the newly
appended text rather than the whole accumulated history. Works regardless of
which client writes the note. *Verified:* the row appears with the appended
sentence alone.

### I7 — honest badge (`components/common`)
"Dev / mock login" → **"Demo data"**, with a tooltip naming exactly what is real
(auth, database, storage) and what is not (gateway, email, WhatsApp). A badge
that overstates what is fake misleads as much as one that understates it.

### I8 — dead link (`BookingDetailPage`)
The "Edit booking" button is removed rather than left pointing at nothing. The
capability stays on the backlog as **L1**.

### I9 — enum casts (migration `..._163007`)
Both `CASE` expressions now cast explicitly to their enum types.
*Verified:* HOS-1018 created with `status=confirmed`, `payment=partial`.

### I10 — conflict message (migration `..._163214`)
The `exclusion_violation` handler is scoped to just the INSERT and the room-hold
expansion — the only statements that can actually race. The pre-check
propagates intact.
*Verified:* a clash now returns **"Those dates are already held by HOS-1018
(2026-11-10 to 2026-11-13)"**, and a free window still succeeds.

### I11 — smoke harness (`services/supabase/client.ts`)
The client is built on first property access behind a `Proxy`, so importing the
module does nothing. *Verified:* all 31 routes × 2 roles render offline again.

---

## 5. Verification

```
npm run test    domain rules ............................ pass
npm run smoke   31 routes x 2 roles ..................... all render
npm run build   tsc -b && vite build .................... clean
```

Database: 14 migrations applied · 14 bookings · 6 customers · 3 receipts
awaiting verification · zero money inconsistencies.

Test rows (HOS-1018, HOS-1019, Meera Raghavan) were removed after verification.

### Standing security note
The database password and a personal access token were both shared in plain
text during setup. **Both should be rotated:**
- Database → Settings → Database → Reset database password
- PAT → https://supabase.com/dashboard/account/tokens

Neither is stored in this repo; `.gitignore` covers `.env*` and `supabase/.temp`.
The anon key in `.env.local` is safe to commit-adjacent — it is protected by RLS,
which is enforced in the database rather than by hiding the key.



---

## 6. Round two - backlog cleared

Everything in section 2 except the gateway is now built and verified live.

### L1 - Edit a booking
`update_booking` re-runs the conflict check **ignoring the booking itself** -
otherwise every stay would collide with its own existing hold - and rebuilds the
room holds in the same transaction. A booking that no longer holds inventory
(cancelled, checked out, no-show) refuses the edit outright: re-dating it would
resurrect a claim on nights that may since have been sold.

The guest is deliberately not editable here. Moving a booking to a different
person is a different operation, and far too easy to do by accident on a form
full of dates and prices.

*Verified:* editing HOS-1001 onto 1-3 Sep was refused with **"already held by
HOS-1012 (2026-09-01 to 2026-09-03)"**; editing onto free dates succeeded and
re-priced. Test edit reverted.

### L3 - Email and WhatsApp
`send-notification` composes four message types and sends via Resend.

**Providers are optional, on purpose.** With no `RESEND_API_KEY` it returns
`200` with `delivered: false, reason: "no email provider configured"`. A missing
provider is a deployment state, not an error - and it must never turn a
successful payment approval into a failed request.

*Verified:* returns 200 with both channels reporting unconfigured.

To go live:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx --project-ref tufwyptholucfgdrldzh
npx supabase secrets set NOTIFY_FROM="Homes of Sanctuary <stay@yourdomain.com>"
```

WhatsApp additionally needs `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID`, plus
**pre-approved message templates** - business-initiated messages cannot be free
text outside a 24-hour window. That is a lead-time task, not an engineering one,
so the code path exists and is stubbed rather than faked.

### L4 - Realtime
Realtime on `notifications`, `bookings`, `payments`, `food_orders`,
`guest_requests`. **Realtime respects RLS**, so a guest subscribed to `bookings`
still receives only their own rows - subscribing to a table is not a hole.

Every event triggers a debounced (250 ms) full refetch rather than patching from
the payload. At this size that is simpler *and* safer: a payload says a booking
row changed, not what its recomputed balance now is, and money is derived. The
debounce means a payment approval - which touches three tables - costs one round
trip, not three.

Four triggers now write notifications: receipt uploaded, kitchen order placed,
request raised, and feedback rated 3 or below.

### L5 - PDF
`window.print()`, labelled **"Save as PDF"** - which is what the browser dialog
actually does. Print styles already strip the chrome. No dependency, no
server-side renderer, and the output is the same document you see.

### L6 - Derived room occupancy
`rooms.status` held `occupied` as a literal, so the seed had to be hand-synced
with the bookings and drifted the moment anyone checked out.

Occupancy is now computed by the `room_availability` view from live holds. What
remains stored is only the **operational override** a person sets - `blocked`
for maintenance, `cleaning` during turnover - because those are decisions, not
derivable facts. A check constraint now rejects `occupied` in the column, and
`set_room_status` refuses it with an explanation.

A trigger flags rooms for cleaning on check-out, but only rooms nobody else is
already holding.

*Verified:* all 12 rooms report correctly - Maaya and Nirvaana fully occupied by
whole-villa holds, Praana A-1 occupied, B-1/C-1 available, D-1 cleaning.

### L7 - Staff accounts
`staff` role plus `profiles.team`. A team is now something a person belongs to,
so the housekeeper opens the app and sees their own queue.

Deliberately **not** a full permission system. Staff get exactly two powers:
read their team's requests (kitchen also sees orders), and move those along.
They cannot reassign work to another team - that stays a manager's call. Money,
bookings and guest records are unreachable.

`/staff` is its own screen, not the admin shell with items hidden: a housekeeper
on a phone mid-shift wants the next job, not a navigation tree - and since RLS
makes the rest unreachable anyway, showing it greyed out would only mislead.

*Verified as `housekeeping@gmail.com`:* 1 request (their team's), **0** bookings,
**0** payments, **0** customers, 5 notifications. Calling `update_booking` is
refused with "Only staff can edit bookings".

---

## 7. Verification (round two)

```
npm run test    domain rules ............................ pass
npm run smoke   34 routes x 3 roles ..................... all render
npm run build   tsc -b && vite build .................... clean
```

19 migrations applied, 4 Edge Functions deployed, 3 roles isolated by RLS.
All test rows removed; HOS-1001 restored to its seeded dates.

### One bug found and fixed during this round
`send-notification` tried to embed `booking_totals` in a PostgREST query.
PostgREST can only embed across a **foreign key**, and `booking_totals` is a
view - so it returned *"Could not find a relationship between bookings and
booking_totals in the schema cache"*. It now fetches the totals separately
rather than recomputing the money inline, where it would inevitably drift from
the view that is supposed to be the single source of truth (BR6).


---

## 8. Round three - reported by testing, plus two found alongside

All six fixed and verified live.

| # | Severity | Issue |
|---|---|---|
| R1 | **High** | **GST charged at 25%.** The rate box accepted any number up to 28. 25% is not a GST band that exists - accommodation is 12% up to a 7,500 nightly tariff and 18% above it. HOS-1020 was invoiced 14,500 instead of 10,440. |
| R2 | **High** | **Split-room bookings billed the whole-villa rate.** Selecting two rooms at Villa Praana kept the villa base rate of 29,000 a night, when the two rooms are 8,500 each. HOS-1020 was charged 29,000 for 17,000 of inventory. |
| R3 | **High** | **A phone guest had no way in.** Reception takes a booking; the guest has no account and no reason to know they should make one. |
| R4 | Medium | **"Email to guest" did nothing** but show a toast saying it would. |
| R5 | Medium | **Print produced a screenshot of the page**, header and buttons included, not the invoice. |
| R6 | Low | The invoice footer still called itself "a mock invoice ... not a valid tax document". |

### R1 - GST
The rate is now a fixed choice - 0, 5, 12 or 18 - on both the create and edit
forms, and the form suggests the right band from the nightly tariff. A check
constraint on `bookings.tax_rate` and `invoices.tax_rate` means no client can
store anything else, whatever the UI does.

HOS-1020 corrected to 18%.

### R2 - Split-room pricing
Ticking rooms now prices from those rooms - the sum of their base rates - rather
than leaving the whole-villa figure the villa picker set. The form also states
what the rate covers ("Rate covers 2 rooms at Villa Praana" against "the whole
of Villa Praana - all 4 bedrooms"), so a wrong rate is visible before saving.

HOS-1020 corrected to 17,000 a night. Combined with R1 its total went from
**72,500 to 40,120** - the original figure overcharged on two counts at once.

### R3 - Guest access
`invite-guest` creates the guest account, links it to the customer record, and
returns a one-time link that signs them in and lets them set a password. The
admin sends it from a panel on the booking - copy the link, copy a ready-made
message, or open WhatsApp with it prefilled.

**Why a link rather than an email:** email needs SMTP configured and this
property already talks to its guests on WhatsApp. A link that can be pasted
works today; an email that silently fails to send does not.

**This is the only function that uses the service-role key**, because creating
an auth user needs it. So the caller is authorised first, with their own JWT,
before the privileged client is constructed. The service-role client never
decides who may do what - it only carries out what was already authorised.
*Verified:* a guest calling it gets "Only staff can give a guest portal access".

### R4 - Email
Both buttons now call `send-notification`. When no provider is configured they
report **"Nothing was sent - add RESEND_API_KEY to the project secrets"** rather
than claiming success. An honest failure beats a false confirmation.

### R5 - Print
Hiding `aside` and `nav` was not enough: the booking header, the action bar and
the page shell are plain divs, so they printed. Everything is now hidden and
only `[data-print-root]` - the invoice - is revealed, lifted to the top of the
page, with page margins and no rows split across a break.

### R6 - Invoice footer
Replaced with the property address. The invoice is real now; describing it as a
mock on a document a guest receives was simply wrong.
