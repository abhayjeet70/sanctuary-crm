# Homes of Sanctuary CRM — Progress

Living status of the build. Updated 26 September 2026 (round seventeen — the QA pass).

**Stack:** Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · React Router 7 · Supabase (Postgres + Auth + Storage + Edge Functions)

**Supabase project:** `tufwyptholucfgdrldzh` · region `ap-northeast-1` (Tokyo)
Direct `db.*` host does not resolve (IPv6-only). Use the pooler:
`aws-0-ap-northeast-1.pooler.supabase.com:5432`, user `postgres.tufwyptholucfgdrldzh`.

```bash
npm run dev     # http://localhost:5173
npm run test    # domain rules (money, tax, KPIs, CSV) — node assert, no framework
npm run smoke   # renders every route × 3 roles offline; catches blank pages
npm run viz     # renders the charts and statements; catches NaN in a report
npm run build   # tsc -b && vite build
npm run lint    # oxlint — warnings only at present

# SQL checks — each wrapped in a transaction that rolls back, so they are
# safe against the live database.
psql "$SUPABASE_DB_URL" -f supabase/tests/<file>.sql
```

**Sign in** - all with password `demo123`:

| Account | Role | Lands on |
|---|---|---|
| `admin@gmail.com` | owner | `/admin` - everything, including Finances and Employees |
| `manager@gmail.com` | manager | `/admin` - operations, no settings/roster/payment decisions |
| `housekeeping@gmail.com` | staff | `/staff` - that department's queue only |
| `kitchen@gmail.com` | staff | `/staff` - the order board |
| `user@gmail.com` | guest | `/guest` - Pooja Bothra's stay |

The demo panel on the login page only appears when `VITE_DEMO_PASSWORD` is set,
so the shared password is not in a deployed bundle.

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

### Admin (26 routes)
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
| `/admin/housekeeping` · `/maintenance` · `/amenities` | Room readiness, repairs, what each villa offers |
| `/admin/enquiries` · `/quotes` · `/followups` | The sales pipeline — see §14 |
| `/admin/expenses` · `/reports` | Money out (owner-only) and money in |
| `/admin/employees` · `/roles` · `/activity` | Roster, department permissions, event log |

### Guest (8 routes)
Mobile-first, thumb-reachable bottom bar, desktop rail at `lg`.
Stay dashboard · booking detail · payment + receipt upload · printable invoice ·
amenities & Wi-Fi · food ordering with cart · requests · feedback.

### Backend — 47 migrations, all applied
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
- Private `payment-receipts` and `guest-ids` buckets, no DELETE policy for anyone.
- Public `villa-photos` bucket — see §14 for why that one is public.
- 6 Edge Functions deployed. Four run on the **caller's JWT, never service-role**:
  `verify-payment`, `create-booking`, `receipt-url`, `send-notification`. Two hold
  the service key (`manage-staff`, `invite-guest`) and authorise the caller with
  their own JWT before the privileged client is touched.
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

---

## 9. Rounds four to nine — 2 to 10 September

Nine sessions of reported bugs and new work. **43 migrations, 6 edge functions,
6 SQL check files, 36 routes.**

### Reported and fixed

| | Symptom | Cause |
|---|---|---|
| **Bookings raised no invoice** | A second stay for an existing guest had none | Numbers only ever came from the Invoices screen. A trigger now raises one with every billable booking — draft until confirmed, issued the moment it is. 16 existing bookings backfilled |
| **Nothing reached the guest** | No notification for anything | `notifications` only spoke to staff. `target_user_id` scopes a message to one account; booking, payment and invoice events now tell the person waiting |
| **Kitchen took orders any time** | A stay ended in July could order in September | Arrival day to departure day, on a confirmed stay, enforced inside `place_food_order` |
| **Kitchen saw housekeeping's jobs** | Wrong queue | Mine: I added a broad `is_staff()` read policy beside the correctly-scoped one. Policies are OR'd |
| **Guest could not raise a request** | `new row violates row-level security policy` | Mine: a BEFORE INSERT trigger set `assigned_to` before `WITH CHECK` ran, and the policy requires it null |
| **Tabs laid out sideways** | Every tab strip | `data-horizontal:` compiles to `[data-horizontal]`; Radix sets `data-orientation` |
| **No tab ever highlighted** | Settings, bookings, villas, guests | Same class of bug two lines below: `data-active:` versus `data-state="active"` |
| **Phone fields took letters** | `dsdsds` saved as a number | `type="tel"` is a keyboard hint, not a constraint |
| **Sign-in links opened the login page** | Magic links did nothing | The route guard redirected during the async moment before the session loaded, discarding the URL |

### Built

- **Invoice** — a proper Indian tax invoice: CGST + SGST within the state, IGST
  across it, decided by place of supply. GSTIN, PAN, SAC, total in words,
  declaration and signature block.
- **Taxes** — Settings tab. Name, rate, and whether it splits like GST. The sum
  is what a new booking is offered; existing bookings keep the rate they were
  quoted.
- **Departments** — replaced the four-value `team` enum with rows the owner
  defines: name, description, job titles, and permissions. Requests route
  themselves by category.
- **Employees** — the roster, with logins the owner can issue. Passwords are
  generated server-side and shown once. Pay is a separate table so RLS can keep
  it to the owner; a salary *column* would be readable by any manager who can
  read the roster.
- **Manager and kitchen roles** — `is_admin()` became "management" (one
  definition governing 27 policies) with the owner-only tables moved to a new
  `is_owner()`.
- **Finances & reports** — Overview, Analysis and Statements. Hotel KPIs,
  "Bookings by / Revenue by" dimension pickers, a donut, date ranges with an
  Indian-financial-year preset, CSV and PDF export.
- **Account settings**, **guest portal notifications**, **request resolution
  notes**, **villa room management**.

### What the manager cannot do

Enforced in the database, checked by attempting each one as them:

- approve or reject a payment
- read the employee roster or anyone's pay
- change settings, villas, rooms or who has an account
- see combined financial figures — total billed, outstanding across the book,
  lifetime spend per guest

### Finance section — what is measured, and what is deliberately absent

Laid out the way the lodging industry lays it out, and stopping where the data
stops.

**Present:** occupancy, ADR, RevPAR, TRevPAR, ALOS, cancellation rate, F&B
capture rate and spend per night, discount rate, collection rate, DSO, aged
receivables, and — when salaries are recorded — payroll to revenue and the
labour component of CPOR.

**Absent on purpose:** GOP, GOPPAR, EBITDA and everything below the gross
operating line. Those need departmental and undistributed operating expenses —
food cost, utilities, laundry, commissions — which this system does not hold. A
GOP computed from revenue and payroll alone would be an invented number wearing
an industry name. The statement says so on its face.

### Chart colours

The brand palette was tried first and **failed the categorical checks**: ink,
sand, stone, clay and gold read as grey (below the chroma floor), separate at
ΔE 1.5 against a floor of 8 under protanopia, and 7.4 against a floor of 15 for
full colour vision. A reader with protanopia would have seen one series.

The validated slots are used for categorical identity only; surfaces, type,
rules and the ink/gold bars stay brand. Three slots pass all-pairs (ΔE 9.2 CVD,
24.0 normal) which is what caps the donut at three segments; five pass adjacent
(9.1 / 19.6). Three sit under 3:1 on white, so every chart direct-labels its
values — identity never rests on colour.

## 10. Round ten — the front desk

Six things, five of them reception's and one of them the roster's.

### Small fixes

- **Download an uploaded receipt.** The receipts bucket is private, so a link
  to it is a signed URL that expires in minutes. Saving rather than opening
  needs a `Content-Disposition` header, which only the server can set — so the
  viewer asks Storage for a second, download-flavoured signature. `<a download>`
  alone does nothing across an origin. The button sits on `ReceiptViewer`, so
  the payment queue and the booking record both got it from one change.
- **Agreed check-in and check-out times.** New columns on `bookings`, and
  **nullable on purpose**: null means "the villa's standard hours". Defaulting
  every row to 14:00 would erase the difference between a guest who asked for a
  late arrival and one who never mentioned it — which is precisely the
  difference the front desk needs. `stayTimes()` resolves the fallback on read,
  and flags an arrangement so the desk knows which rows to look at twice.
- **Department before designation** on the employee form. The job titles come
  *from* the department, so asking for the title first was asking a question
  whose options were not on screen yet.

### Guest identification

`customers` gained `id_type`, `id_number` and `id_image_path`; the scan itself
goes to a new private `guest-ids` bucket, management-only in both directions.
Reception photographs the ID while adding someone who has no id yet, so the
upload is keyed on a folder minted client-side rather than the customer id —
the bucket policy carries the authorisation, not the path. A guest arriving with
no ID on file is flagged on the arrivals list.

### Front desk

A new department (`front_desk`) and a new screen at `/admin/frontdesk`, in four
parts: **Today** (arrivals and departures sorted by the time they are actually
expected, with balance due and missing-ID flags), the **room rack**, **On
shift**, and the **waiting list**.

The rack is deliberately *today* rather than a date range — the Calendar
already draws the tape chart, and the desk's question is "what is free this
minute", which a fortnight-wide grid answers badly. A whole-villa house is one
cell because that is how it sells; a split house is four. A whole-villa hold
greys every bedroom under it, or reception sells a room twice.

Reception reaches the same screen from `/staff` when their department holds
`frontdesk.view`. Checking guests in stays with management, and the page does
not offer the button to anyone RLS would refuse — offering an action that fails
teaches people to distrust every other button on the page.

**"On shift" is honestly named.** There is no rota and no hours in the system,
so it says "on the books", not "on the clock". Free means no open job assigned
to that person; a request only routed to a department is shown against the
department, because nobody has picked it up yet.

### Waiting list

`waitlist` — a request for dates that were already sold. First come, first
served on `created_at`.

**Position is not a column.** It is arrival order among everyone still waiting
for the same villa, computed on read. A stored number has to be rewritten for
every row behind one that leaves, and a renumbering that half-runs is a queue
nobody trusts again.

- The booking form offers it instead of a dead end: when the conflict check
  refuses the dates, "add them to the waiting list" reuses everything already
  typed.
- A row says on its own face when the dates it wants have come free, rather
  than announcing it somewhere the desk has to go and look.
- Cancelling a stay fires a trigger that counts who overlaps those dates and
  tells the desk. Overlap, not equality — someone waiting for the 3rd to the
  6th cares about a cancellation of the 1st to the 5th.
- Converting goes through the booking form, which is where the conflict check,
  the rate and the tax already live.
- `waitlistOpenings()` asks whether the villa is free *as a whole*, which is
  conservative in split mode: it will not promise a queue a single bedroom.

Two new grantable permissions — `frontdesk.view` and `waitlist.manage` — both
ordinary rows, so the owner can move them to another department without a
migration.

### Verification (round ten)

`supabase/tests/front_desk_and_waitlist.sql`, nine checks, all passing:

| Check | Result |
|---|---|
| A guest joins the queue | ok |
| A guest queues as somebody else | refused |
| A guest withdraws and rejoins | ok |
| A guest marks themselves converted | refused |
| Rows one guest can see | 1 of 2 |
| Housekeeping sees the waiting list | 0 rows |
| …after granting `waitlist.manage` | 2 rows |
| Cancelling tells the desk | notified |
| Re-saving the same status | still one notification |

The fourth is the one that matters, and it was **proved to bite**: with the
`status in ('waiting','cancelled')` clause removed from the policy's WITH
CHECK, the same update succeeds. The refusal is the policy doing its job, not
an accident of something else.

`domain.test.ts` gained the time fallback, the queue and the openings —
including the half-open boundary (a check-out on the 5th does not occupy the
5th) and the case where the person in front withdraws. One of those assertions
caught a wrong expectation of mine before it caught anything else.

### Standing gaps

1. **Transactional email** — needs SMTP or a Resend key. Custom SMTP was tried
   with Gmail and rejected the credentials; it is currently off, so signup
   confirmation and password resets run on Supabase's built-in sender (2/hour,
   project members only). Guest access by **invite link and WhatsApp needs none
   of this** and works today.
2. **Vercel** — needs the deployed domain added to Supabase's redirect
   allow-list, or reset links point at `localhost:5173`.
3. **Demo accounts** — delete the five before real guest data.
4. **Expenses** — no cost data anywhere, hence no true P&L. The largest single
   thing standing between this and a complete finance module.
5. **Point-in-time recovery** — not enabled.
6. **Credential rotation** — the database password and personal access token
   have been pasted in chat and should be rotated.
7. **Reception cannot check guests in.** Moving a stay through its lifecycle is
   management's write. A receptionist who needs it has to be given a manager
   role today; a `bookings.move` permission would be the proper fix.
8. **No rota.** "On shift" lists who is active on the roster, not who is
   working this afternoon. Shifts and hours are not modelled.

---

## 11. Round eleven — demo data visibility toggle

### What was built

A **Demo Data** tab in Admin Settings (`/admin/settings`) with a single toggle
switch. Flipping it off hides all seeded sample records across every screen;
flipping it back on restores them instantly. Nothing is deleted from the
database.

**Why a toggle instead of a delete button.** A delete would be irreversible and
would break any link or bookmark pointing at a seeded record. A toggle costs
nothing and can be undone in one click — the correct tool for "I'm showing
this to a client and don't want sample stays cluttering the dashboard".

### How demo records are identified

Seed bookings have references `HOS-1001` → `HOS-1020`. The code compares the
numeric part of each booking's `reference` against a threshold of `1025`
(giving a buffer for any test rows created during development). A booking at
or below that number is considered demo; everything above is real.

Derived from demo booking IDs:

- **Customers** — those whose *every* booking is a demo booking are also
  hidden; a customer who has one demo stay and one real stay remains visible.
- **Payments, invoices, food orders, requests, feedback** — filtered by
  `booking_id` membership in the demo set.
- **Waitlist entries** — filtered by `customer_id` membership in the demo
  customer set.
- **Activity and notifications** — not filtered (they carry no reliable
  booking reference and are low-stakes to show).

No schema change. No migration. No Supabase write of any kind.

### Persistence

Stored in `localStorage` as `sanctuary-demo-data-visible` (default: `true`).
Survives page reloads. Per-browser — different staff on different machines are
unaffected by each other's choice.

### Files changed

| File | Change |
|---|---|
| `src/services/mock/MockDataProvider.tsx` | `demoDataVisible: true` stub; `setDemoDataVisible` no-op (offline harness is all demo anyway) |
| `src/services/supabase/SupabaseDataProvider.tsx` | `demoDataVisible` state initialised from localStorage; `isDemoRef()` identifies seed references; filtered views derived before the value memo; `setDemoDataVisible` writes back to localStorage |
| `src/hooks/useData.ts` | `useDemoData()` convenience hook |
| `src/pages/admin/SettingsPage.tsx` | "Demo Data" tab added; `DemoDataSection` component — toggle switch, status pill, live count grid, "How it works" explainer |

---

## 12. Round twelve — brighter surfaces, and a welcome before the door

Two requests: the product looked dull, and a welcome film should play before
sign-in.

### The dullness was measurable

Before changing anything, the palette was measured rather than judged by eye.
Body text at `stone-600` (`#7e756a`) scored **3.96 against the sand ground** —
under the 4.5 AA needs. So the app was not merely *styled* washed out; the
contrast numbers said it was washed out, and the two complaints were the same
complaint.

| Pairing | Before | After | Note |
|---|---|---|---|
| `stone-600` on the page ground | 3.96 ✗ | **5.59** ✓ | secondary text, used everywhere |
| `gold-700` on the page ground | 4.26 ✗ | **4.56** ✓ | eyebrows and section labels |
| clay **as text** | 3.99 ✗ | **5.34** ✓ | swept to `clay-600`, same hue |
| white on the clay count badges | 4.26 ✗ | **5.71** ✓ | 10px semibold — never "large text" |

What changed, in tokens:

- `--color-sand` `#f4efe8` → `#faf7f3`, and `sand-200`/`sand-300` with it. The
  ground was a heavy beige field; lifting it raises every pairing above at once.
- `--color-stone-600` `#7e756a` → `#6b6259`.
- `--card` / `--popover` `#fbf8f4` → **pure white**, so cards genuinely lift.

### Restraint, which is what the reference sites actually do

The research on luxury hospitality sites is unanimous and unglamorous: white
space, restrained palette, editorial type, one high-contrast CTA. Not more
ornament — less.

- **88 cards** carried `ring-gold/12`. A brown-gold hairline on every surface,
  over a warm ground, is precisely what read as muddy. Swept to
  `ring-ink/[0.06]`: the card is white, the shadow lifts it, the edge is an
  edge and nothing more.
- The global default border (`* { border-color }`) was stone at 35% — a brown
  line on every table rule and divider. Now ink at a tenth.
- Gold is **kept** where it is brand and reads as brass: rules, eyebrows,
  the active rail, and anything sitting on ink.

The compiled stylesheet was checked for `.ring-ink\/\[0\.06\]{--tw-ring-color:#1427310f}`
rather than assumed — an arbitrary-opacity class that silently matches nothing
is the same class of bug as `data-active:` twice before.

`DesignSystemPage` was corrected too. A living style guide printing `#F4EFE8`
beside a swatch that is no longer that colour is worse than no style guide.

### Verification (round twelve)

139 smoke checks green, six of them new and specific to the reel. `test`,
`viz` and `build` all pass.

### The welcome reel — built, then withdrawn

A welcome film over the sign-in page was built and then removed at the
owner's request. Nothing of it remains: component, asset, keyframes, smoke
checks and the `video` export are all gone. Recorded here only so the commits
in between are legible.

### Controls and tables

Form fields were `bg-transparent` at 32px. A transparent field on a warm
ground is an outline people scan past rather than something that reads as
somewhere to type. Inputs, selects and textareas are now white at 36px with
the existing border doing the defining — which works both on the page ground
and inside a white card. The dark sign-in panel already overrides the fill, so
it was unaffected.

Table cells went from `p-2` to `px-3 py-2.5`, and the header row from plain
ink body text to the brand's own tracked small caps — a column heading that
looks like data is one people misread as data.

Dividers and rules were `stone` — a warm brown line. Same reasoning as the
card hairlines: swept to ink at a low alpha.

### One bug the palette work uncovered

Round ten added per-booking arrival and departure times, and the front desk
honoured them. **Five other screens did not** — they still quoted the villa's
standard hours:

- the dashboard figures and the movements feed,
- the guest's booking page, dashboard and amenities page,
- and `SendBookingDetails`, which is the message actually sent to the guest.

So a guest who arranged a 22:30 arrival was told, in writing, that check-in
was at 14:00. All five now read `stayTimes()`.

Guarded rather than remembered: fixture booking `b-1001` arrives at 22:30 at a
villa that opens at 14:00, and a smoke check renders three guest screens and
fails if any of them prints the villa's standard instead. Proved to bite by
putting the old expression back and watching it fail. The check deliberately
ignores the 11:00 departure — only the arrival was arranged on that booking,
so the standard is the right answer there.

### Verification (round twelve)

`tsc`, `smoke` (142 checks), `test`, `viz` and `build` all green.

---

## 13. Round thirteen — patterns from the reference sites

Researched hospitality and booking UX, then applied only the findings that
this product actually has a surface for. Sources are in the commit trail;
the useful ones were Baymard's travel-accommodations topic list, an Agoda
room-list teardown, and Designmodo's hotel UX write-up.

**Nothing was copied from anyone.** These are conventions — a sticky booking
panel, an editorial gallery grid, listing-card anatomy — not another
property's identity, imagery or wording.

### What the research actually changed

| Finding | Where it landed |
|---|---|
| Remove redundant elements from listing cards | The villa card printed bedrooms and capacity in the photo overlay *and* in the spec row below. The overlay now carries the name alone. |
| One image given weight beats a row of equal thumbnails | Guest gallery is now an editorial grid: first image spans 2x2, the rest range beside it. |
| The booking window must stay reachable | The date panel on *Book a stay* is `lg:sticky`, so changing dates never means scrolling back up past the results. |
| Chrome should frame a group, not each item | Amenities were twelve bordered tiles around twelve short phrases. Now one card holding a three-column list. |

### Two things fixed alongside

- Fixed-height images (`h-48`, `h-36`) became aspect ratios, so cards in a
  three-up grid crop identically as the column narrows instead of drifting
  apart.
- The villa spec row was an icon and a bare number — "4" and "8" with no
  accessible name. Both now carry an `sr-only` label.

### Not done, deliberately

Amenities are a flat `string[]`, so grouping them under headings would mean
inventing categories and sorting by guesswork. A list that silently files
"Plunge pool" under the wrong heading is worse than an ungrouped one. It wants
a category on the amenity record first.

---

## 14. Round fourteen — 22–23 September

The operations sidebar and dashboard rebuilt to a supplied design, nine new
sections, an expenses ledger, and the QA findings from the TC01–TC11 pass.
**47 migrations, 6 edge functions, 37 routes.**

### The sidebar, regrouped

Three groups over fourteen items became five over twenty-two: **Operations,
Property, Sales, Finance, Management**. The old grouping (Today / Property /
Business) had no home for the work a property does between bookings —
housekeeping, maintenance, the sales pipeline — so those sections had nowhere
to be added.

### The dashboard, rebuilt

It was a row of four counters and three lists. It is now the screen the day is
run from:

| Panel | Where the numbers come from |
|---|---|
| Four stat tiles | Arrivals, departures, in-house, awaiting verification — each links through, each carries the one or two lines that qualify it |
| Revenue today | One night of each live stay, plus today's kitchen sales and a night's share of add-ons. **Not** booking totals, which belong to the nights they cover. Owner-only |
| Occupancy | A ring, with occupied / available / cleaning / maintenance beside it |
| Needs attention | Derived: payments to verify, overdue checkouts, guests arriving unpaid, urgent requests, unconfirmed orders. Sorted oldest first |
| Today's schedule | Arrivals and departures in time order, at the times actually agreed |
| Villa status | Photo cards — occupied with who and until when, or how many rooms are free |
| Booking funnel | This month's bookings by lifecycle stage, with the conversion rate |
| Guest satisfaction | Real average and the real 5-to-1 distribution |

The mock showed per-category satisfaction scores (cleanliness, staff, food).
Feedback carries one overall rating, so those would have been invented. The
rating distribution answers the same question from data that exists.

### Nine sections added

Eight needed no schema change — the records were already there, unassembled:

| Section | Assembled from |
|---|---|
| Housekeeping | Room statuses, today's departures, floor requests. Mark-clean acts on the room |
| Maintenance | Maintenance jobs plus every villa and room held out of service |
| Amenities | Per-villa lists, editable in place, so three villas describe themselves consistently |
| Enquiries | `inquiry` bookings and the waitlist, kept apart — one needs a price, the other needs a cancellation |
| Quotes | Priced unpaid bookings with the full breakdown. **No quote record exists by design:** the booking already carries the numbers, and a quote living apart is a second set to keep in step |
| Follow-ups | Derived chase list — unanswered enquiries, unpaid deposits, balances after checkout, freed waitlist dates, unreplied low ratings. Nothing is stored, so settling a balance removes the row by itself |
| Activity log | Every recorded event, searchable and filtered by kind |
| Roles & permissions | The department permission editor, given its own route |

**Expenses** was the one with nothing behind it, so it got a table
(`20260922090000_expenses.sql`): category, amount, payee, method, reference,
optional villa. Owner-only at the RLS level — a manager runs the property
without seeing what it pays its electrician, and hiding a nav item is
presentation, not access control.

### The QA pass — TC01–TC11

| | Reported | What was actually wrong |
|---|---|---|
| TC01 / TC07 | No "Add new villa" | A villa could be edited but never opened. Add-villa dialog, carrying both times — a villa with no check-in hour is one the desk has to guess about |
| TC02 | Broken menu images | Remote URLs fail; the browser answers with a torn-paper glyph. `<Photo>` falls back to a sand panel with the subject's initial, applied across 13 pages — the fix is for every photo, not the three that were reported |
| TC03 | Food missing from the bill | It only appeared once the kitchen billed it. Unbilled orders are now listed with their total and the combined figure, **without** touching the balance the BR12 trigger owns |
| TC04 | Villa section too thin | It claimed "all four bedrooms" whatever the villa had. Reads the real count now, and names which rooms are the guest's |
| TC05 | No room selection | It existed, but only for split villas and with nothing said about capacity. Both modes now state what is being booked, and a party too large for the rooms picked is told so |
| TC08 | Cannot delete a guest | Delete with a type-the-name confirmation. The database refuses while any booking names them — their stays are the property's own records |
| TC09 | Cannot reset a guest password | A reset link goes to the guest's own address. **The password is never set for them**, so nobody at the property ever knows a guest's password |
| TC10 | No "Needs attention" | Built, above |
| TC11 | No country on a client | Column added (`20260922140000_customer_country.sql`), defaulted to India. It decides the foreign-national paperwork a property files, which no city column can answer |

**TC06 — UI/UX across the four portals — was not done.** The finding reads
"interfaces *likely* suffer from inconsistent design languages", which is a
guess rather than an observation. It wants specific complaints before anything
is redesigned against it.

### Villa photographs are uploaded, not linked

Asking for a URL asks the wrong person to do the wrong job: whoever adds a
villa has the photograph on their machine. File picker with a preview, and a
**Replace photo** button on the villa's own picture.

The `villa-photos` bucket is **public**, unlike receipts and guest IDs, and
deliberately: these render in an `<img>` on the guest portal and the marketing
site, where a signed URL expires and leaves a villa with a hole in it. Writing
is management-only. The upload runs before the insert, so a storage failure
never leaves a row pointing at a photograph that is not there.

### A guest can join the waiting list

Until now the only way on was an admin hitting a conflict in the New Booking
form. A guest who searched a sold-out weekend saw "nothing free" and closed the
tab — at the one moment they were certainly thinking about those dates.

A taken house now carries "Tell me if it frees up"; when every house is held
the page asks outright; and the guest can see what they are waiting for and
withdraw. No migration — `guests join the waitlist` and `guests withdraw from
the waitlist` have been on the table since the front-desk work, and they allow
exactly this and nothing else. Self-joins carry source `website`, so the desk
can tell them from ones it added.

### Email is configured but has no provider

`send-notification` supports Resend's HTTP API or raw SMTP and reports honestly
when it has neither, which is what the "Email is not configured" card is. The
missing piece is credentials, not code:

1. **Auth SMTP** — Authentication → Emails → SMTP Settings: `smtp.resend.com`,
   port 465, user `resend`, password the Resend key.
2. **Function secrets** — Edge Functions → Secrets: `RESEND_API_KEY` and
   `NOTIFY_FROM`.

`npm run configure-email` does both, and now reads `RESEND_KEY` / `SUPABASE_TOKEN`
from the environment rather than prompting. It needs a Supabase access token
with **Auth** and **Secrets** scopes — a token scoped to Project Settings alone
returns 403, which is what blocked this.

Until a domain is verified in Resend, mail only reaches your own address.

### Applying migrations

The management API refuses the tokens on hand (403), but the database accepts
the pooler connection. With `SUPABASE_DB_PASSWORD` in `.env.local`:

```bash
set -a && . ./.env.local && set +a && npx supabase db push
```

All three of this round's migrations are applied and verified against the live
database.

### Notes for next time

- **Expenses do not reach the reports yet.** The table is there and the page
  writes to it; `/admin/reports` still shows revenue alone.
- **TC06** needs specific complaints, per above.
- **Guest self-joins are silent.** The waitlist row is created, but nobody is
  emailed when their dates free up — that waits on the provider keys.

---

## 15. Round fifteen — guest Wi-Fi (software layer)

The booking is the source of truth: a login gets Wi-Fi because it holds, or is
a live companion on, a stay in its window. Every function derives the booking
from the caller — none accepts a booking id from the client.

- **Migrations** `20260925090000_wifi_activity_kind`, `20260925091000_guest_wifi`.
  Tables `wifi_devices`, `wifi_authorizations`, `wifi_sessions`, read-only RLS
  (own rows, or `wifi.view`); every write is a `security definer` function.
  View `my_wifi_devices` gives guests their devices without MAC/IP.
- **Expiry** = check-out date + agreed check-out time, else the villa's, in IST.
  Triggers move it when check-out moves, and end access on check-out,
  cancellation, rejection and no-show. Only `wifi.manage` extends past it.
- **Controller**: `WifiController` interface, `MockWifiController` (default)
  and `EdgeWifiController` (`VITE_WIFI_CONTROLLER=edge`). Edge function
  `wifi-controller` is written but **not deployed** — the CLI token gets 403.
- **Screens**: villa page Wi-Fi panel, `/admin/wifi`, the guest amenities card
  (status, expiry, QR, devices, "Wi-Fi not working?"), public `/wifi` portal.
- **Permissions**: `wifi.view`, `wifi.disconnect`, `wifi.revoke`, `wifi.manage`,
  `wifi.configure`. Owner has all; Management gets view + disconnect,
  Maintenance gets view.
- **Tests**: `node supabase/tests/wifi.e2e.mjs` — 34 live checks as owner,
  manager, housekeeping, guest, companion and anon. Smoke covers the four
  surfaces and fails if any says "online".

Nothing here claims a device is online. Real connectivity, bandwidth, the
"expiring soon" push (needs a scheduler) and MAC capture all wait on hardware.

---

## 16. Round sixteen — villa staff, auto-assign, and the room buttons

- **Room buttons did nothing.** "Send to clean" / "Mark clean" called `saveRoom`,
  which never wrote `status`. They now call `set_room_status`. A room with a
  guest in it stays "Occupied" and gains a "Cleaning queued" tag — the stay
  outranks the flag — and turns to Cleaning once the guests leave.
- **Staff belong to a villa** (`employees.villa_id`, null = floater). Employee
  form asks for it; Employees filters by it; each villa page lists its staff and
  who is free.
- **Auto-assign** (`property_settings.auto_assign_requests`, switch on the
  Requests page). New request → a *free* person in the handling department at
  that villa, then floaters; idle-longest first. Nobody free → stays pending;
  finishing a job hands that person the oldest waiting one. Switching on clears
  the backlog. All in database triggers, so it needs no page open.
- Manual assignment picks from the villa's own staff and refuses another
  villa's; the request stores `assigned_employee` (roster) as well as
  `assigned_user` (login), since most roster staff have no login.
- Tests: `node supabase/tests/auto_assign.e2e.mjs` (20 live checks).

---

## 17. Round seventeen — the QA pass (26 September)

Everything built since round fourteen was tested together: static checks, the
live database, every SQL suite, six live end-to-end suites, and a real browser.

### What was built between rounds fourteen and seventeen

Recorded here because it had not been written up: the booking **voucher** (dark-
green card, printable, emailed) and the tax **invoice** in the ledger layout that
prints on one page; the **booking popup** (5 steps, progress bar, marketplace
cards, voucher preview, sign-in-and-pay); admin-managed **guest info** (menu,
add-ons, terms, policies) synced to the form, voucher and email; **cancellation**
policy (property-wide or per villa), guest and staff cancelling with the refund
shown first, **refunds** ledger, **Cancellations & refunds** page and the
**Bookings & refunds** report (3/6/12-month and custom ranges, CSV); the shared
**companion login**; **email validation** everywhere an address is asked for;
the **invoice signature** upload. Rounds 15 and 16 (Wi-Fi; villa staff and
auto-assign) are above.

### How it was tested

| Layer | Tool | Result |
|---|---|---|
| Types | `tsc -b` | clean |
| Lint | `oxlint` | **0 errors** (was 1 — see B1); warnings only |
| Domain rules | `npm run test` | pass (now includes email rules) |
| Server render | `npm run smoke` | **207 checks, 0 failures** |
| Charts | `npm run viz` | pass |
| Build | `vite build` | clean |
| DB | `supabase db lint --linked`, `db push --dry-run` | 1 harmless warning; **up to date** |
| SQL suites | 10 files in `supabase/tests/*.sql`, live, rolled back | all clean |
| Live end-to-end | `security` 36 · `cancellation` 19 · `guest_booking` 12 · `auto_assign` 20 · `signature` 11 · `wifi` 34 | **132 checks, all pass** |
| Schema drift | every `.from()`, `.rpc()` and column the app uses vs the live schema | none missing |
| Real browser | 41 screens as owner and guest in headless Chrome | **0 JS errors, 0 failed requests, 0 error screens** |
| Real browser | 21 scripted interactions (popup incl. the bad-email block, room buttons, auto-assign switch, signature rules, villa/staff pages) | pass, 5 runs in a row |

Re-run any of it: `node supabase/tests/<name>.e2e.mjs`;
`npm i --no-save puppeteer-core` then `node scripts/browser-qa/crawl.mjs` and
`…/interact.mjs` (see the header of each; not a project dependency).

### Errors found, and what was done

**Security**

| # | Severity | Found | Fix |
|---|---|---|---|
| S1 | **High** | A visitor with **no login** could call `notify_staff` and `notify_guest` and put a fake alert in the staff tray, or in any guest's, by booking id. Postgres grants EXECUTE to PUBLIC on every new function, and Supabase exposes every public function; these had no revoke. | `20260926110000` revokes them from everyone (every caller is a definer function — checked) |
| S2 | Medium | `find_booking_conflicts` returned other guests' **booking references and dates** to anon. | Revoked from anon. *Residual:* a signed-in guest can still call it — the create-booking function needs it on the caller's JWT. |
| S3 | Medium | `next_invoice_number` / `next_booking_reference` were callable by anon **and by any signed-in guest**. An invoice series must be gapless for GST. | Revoked from anon; both now refuse a non-staff direct caller (`current_user` check) while the definer paths that legitimately use them are unaffected. |
| S4 | Low | `can_order_food`, `generate_guest_code`, `next_employee_code`, `seed_id` open to anon. | Revoked from anon. |

`security.e2e.mjs` (36 checks) now guards all of it, and also proves booking,
invoicing and notifications still work through their definer paths.

**Disclosure:** confirming S1–S3 required *calling* them. The probe **consumed
one invoice number (HOS/26-27/0129) and one booking reference (HOS-1057)**, and
briefly added two notifications (deleted). There is now a one-number gap in the
invoice series. Sequences cannot be rewound; note it for whoever files the GST
return.

**Functional**

| # | Found | Fix |
|---|---|---|
| B1 | `GuestBookingPage` called a hook after an early return — React's rules-of-hooks, so the page could throw "rendered more hooks" when the stay arrived a moment after the page. The only lint *error*. | Hook moved above the return. |
| B2 | A **processed full refund left the booking "partial"** with the whole amount still paid. Refunding flips the payments to `refunded`, which re-ran `recalculate_payment_status`, which knew nothing of refunds. | `process_refund` sets the booking `refunded` after the payment update; the recalculation now leaves cancelled/rejected/no-show bookings alone. Regression test added. |
| B3 | A cancelled booking read **"Cancelled · Paid in full"**. | Guest booking, guest dashboard and admin booking header now show the refund state ("Refund pending", "Refunded", "Cancellation charge applied", "Nothing to refund"). |
| B4 | Housekeeping's **Send to clean / Mark clean did nothing** (`saveRoom` ignored `status`). | Now `set_room_status`; occupied rooms show "Cleaning queued". (Round 16.) |
| B5 | Auto-assign switch stayed on the old answer for 3–4 s (waited for a ~20-query refetch). Looked broken; a second click was ignored. | Updates at once, refetches in the background. |

**Data**

| # | Found | Fix |
|---|---|---|
| D1 | HOS-1010 was cancelled before refunds were tracked: a refunded payment but **no refund record**, so Cancellations and the Bookings report could not see it. | Backfilled from its own payments (`legacy: true`, marked processed). |
| D2 | HOS-1003 and HOS-1007 marked **paid with a balance** (₹581, ₹991). | Labels recomputed to `partial`. No amount changed. |
| D3 | **Left alone, needs a decision:** HOS-1004 and HOS-1009 have `amount_paid` ₹708 / ₹710 higher than their approved payments. This is the round-three "I4" fix, which moved the amount received to match the total rather than the receipts. Both are completed demo stays. | Correcting it shows a small balance on a finished stay; not changed without your say-so. |

**Missing UI**

| # | Found | Fix |
|---|---|---|
| U1 | Lost & found retention days (30 / 90 / 180) drive due dates in the database but had **no screen**. | Added under Settings → Property. |
| U2 | Lint: `wifi_configure_villa` typed its empty array as `text`. | Fixed in `20260926110000`. |

**Tests that were wrong, not the product** (fixed so they stay useful): the
waiting-list suite counted every live row and failed when real guests queued;
four suites assumed a villa is *whole* and *free today* — villas are now split
in places and booked solid. They pick rooms and windows themselves.

### Things my own testing did to the live data, and how it was put back

Worth recording, because a QA pass that quietly changes the thing it is testing
is its own kind of bug.

| What happened | Cause | Put right |
|---|---|---|
| **10 rooms were left flagged "cleaning"** (all of Maaya and Nirvaana, three of Praana) | The Wi-Fi suite checks a stay out, and *checking out flags the stay's rooms for cleaning* (a real trigger); the suite then deleted the stay, so the flag outlived it. The browser test's "undo" also clicked a sidebar link that merely contained the word "Cancel", so the room it queued was never released. | All 10 released (Praana D-1, genuinely being cleaned before testing began, was left alone). The Wi-Fi suite now snapshots every room's flag and restores it; the browser test matches buttons exactly. |
| **Auto-assign was left switched ON** after a browser run | The UI-driven toggle test raced the page's refresh and could end on the wrong side. | Set back to off. The browser script now records the setting first, judges the switch by the **database** rather than by how fast the page redraws, and restores it through the API in all cases. |
| One invoice number and one booking reference consumed | The security probe (S3, above) | Cannot be undone — see the disclosure under S3. |

Both scripts now leave the database as they found it; five consecutive runs
confirmed it (auto-assign off, only Praana D-1 flagged).

One browser-test failure looked intermittent (about one run in ten). Once the
check printed what it saw, the cause was plain: the email field held
`sam@gmailqa.guest+test@gmail.com` — the test's attempt to clear the previous text
sometimes failed, and the next address was typed onto the end of it. A **test**
bug, not the app (the popup's own validation correctly refused it: "can only
have one @"). Clearing now selects-all-and-deletes like a person would.

### Reports: PDF and print (26 September, after the QA pass)

Reported from a real print preview: the **Collected** card printed as an empty box,
the **Analysis** and **Bookings & refunds** tabs printed as a blank sheet, the first
page had a band of white above the title, and the Bookings table ran off the right
edge of the page.

| Symptom | Cause | Fix |
|---|---|---|
| Dark cards (Collected, How guests paid) printed empty | Browsers drop background colours when printing; the card kept its pale text on a white page | `print-color-adjust: exact` inside every printable report |
| Analysis and Bookings tabs printed blank | Both were explicitly `print:hidden` | Both now print, each under the same title block (company, section, period) as Overview |
| Blank band above the first page | Non-printing elements were hidden with `visibility`, which keeps their height | The report's page title is `display: none` on paper |
| Bookings table cut off at the right margin | Seven no-wrap columns inside a scroll container | On paper the cells wrap and tighten and scroll containers are released, so all columns fit |
| Cards and charts split across pages | no page-break rules | cards, sections and charts avoid breaking |

`node scripts/browser-qa/print.mjs` prints every tab in real Chrome and checks:
content present, no blank band, nothing past the right margin, dark fills kept,
page count sane (Overview 4 pages, Analysis 2, Bookings 3, Statements 2).

### Open

1. ~~Voucher email is not live.~~ **Deployed 26 Sept** with a Supabase token that has
   the Edge Functions scope (`send-notification`, and `wifi-controller` with it).
   Verified live: `send-notification` accepts `booking_voucher`; `wifi-controller`
   refuses an anonymous caller and a guest with no live stay. **Still needs a mail
   provider:** no `RESEND_API_KEY` / `SMTP_*` / `NOTIFY_FROM` secret is set, so the
   email reports "not configured" until one is (Edge Functions → Secrets, or
   `npm run configure-email`). Until a sending domain is verified in Resend, mail
   only reaches the account owner's own address.
2. `wifi-controller` is deployed but unused: the app stays on the mock controller
   unless `VITE_WIFI_CONTROLLER=edge`.
3. D3 above.
4. Lint still lists ~20 React-compiler *warnings* (state set inside effects,
   `Date.now()` in render). None fails; none changed behaviour in the crawl.
5. A signed-in guest can still call `find_booking_conflicts` (S2 residual).
