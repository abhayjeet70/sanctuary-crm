# Homes of Sanctuary — Operations CRM & Guest Portal
## Technical Requirements Document · Phase 1 (UI)

---

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite 8** | Client-rendered SPA. No server runtime to host or pay for in a UI-only phase. |
| Language | **TypeScript** (strict) | The domain has twelve booking states and two inventory modes; the compiler is the cheapest way to keep them honest. |
| UI | **React 19** | — |
| Routing | **React Router 7** (`BrowserRouter`) | Client routing that survives the Supabase migration untouched. |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` | CSS-first theming: tokens are declared in `@theme` in `src/index.css`, no `tailwind.config.js` exists and none is needed. |
| Components | **shadcn/ui** (`radix-nova` style, Radix primitives) | Accessible primitives we do not want to hand-roll. Restyled entirely through the token layer — component source is stock. |
| Icons | **lucide-react** | Ships with shadcn/ui. |
| Toasts | **sonner** | Ships with shadcn/ui. |
| Dates | **date-fns** + `react-day-picker` | Pulled in by the shadcn `calendar` component; reused for the master calendar. |

**Not used, deliberately:** Next.js (this is a client SPA — see §14), Supabase,
any state-management library, any data-fetching library, any form library. React
state and context are sufficient for mock data; adding TanStack Query or React
Hook Form now would be committing to an integration shape before the backend
exists.

### Commands

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run preview  # serve the production build
npm run test     # node self-check of the domain rules (see §15)
```

---

## 2. Architecture

Three layers, and the rule that separates them:

```
┌─────────────────────────────────────────────────────────┐
│  pages/ + components/        UI. Never imports a fixture.│
└───────────────────────────┬─────────────────────────────┘
                            │ hooks only
┌───────────────────────────▼─────────────────────────────┐
│  hooks/useData.ts          The data-access surface.      │
│                            useBookings(), useVilla(id)…  │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  services/mock/            MockDataProvider — the seam.  │
│  services/domain.ts        Pure business rules.          │
│  data/mocks/               Typed fixtures.               │
└─────────────────────────────────────────────────────────┘
```

**The rule:** a component may import from `@/hooks`, `@/lib`, `@/types` and
`@/components`. It may **not** import from `@/data/mocks`. Grepping for
`data/mocks` outside `services/` should return nothing — that is the invariant
that makes the Supabase swap a one-directory change.

`services/domain.ts` is deliberately pure and dependency-free: money maths,
date overlap, and inventory-conflict detection. In Phase 2 the same functions are
copied into a Postgres function or an Edge Function so the server enforces what
the client currently only suggests.

### State

- **Server-ish state** — every collection lives in `MockDataProvider`, held in
  `useState` so mutations made in the UI (approving a payment, advancing a
  kitchen order) are visible everywhere for the session and reset on refresh.
- **Session state** — `MockSessionProvider`, backed by `localStorage`.
- **Local UI state** — filters, dialog open/closed, form drafts: `useState` in
  the component that owns them. Nothing is lifted that does not need to be.

There is no global store and no reducer. When Supabase arrives, `MockDataProvider`
is replaced by query hooks and most of this state disappears rather than being
migrated.

---

## 3. Project structure

```
Sanctuary-crm/
├── PRD.md
├── TRD.md
├── components.json              # shadcn/ui config
├── index.html
├── vite.config.ts               # react + tailwind plugins, @/ alias
├── tsconfig.json                # @/* path mapping (root, for the shadcn CLI)
├── tsconfig.app.json            # app compile; excludes *.test.ts
└── src/
    ├── main.tsx
    ├── App.tsx                  # providers → router → toaster
    ├── index.css                # ← the entire design system lives here
    │
    ├── routes/
    │   └── AppRoutes.tsx        # route table + RequireRole guard
    │
    ├── pages/
    │   ├── auth/LoginPage.tsx
    │   ├── admin/               # one file per admin route
    │   ├── guest/               # one file per guest route
    │   ├── DesignSystemPage.tsx
    │   └── NotFoundPage.tsx
    │
    ├── components/
    │   ├── ui/                  # shadcn/ui primitives — stock, not edited
    │   ├── common/              # StatusBadge, StatCard, EmptyState, DevBadge…
    │   ├── layout/              # admin shell, guest shell
    │   ├── booking/  payment/  food/  requests/   # domain components
    │
    ├── hooks/
    │   └── useData.ts           # the named data-access surface (§8)
    │
    ├── services/
    │   ├── domain.ts            # pure business rules
    │   ├── domain.test.ts       # node self-check
    │   └── mock/
    │       ├── MockDataProvider.tsx
    │       └── MockSessionProvider.tsx
    │
    ├── data/mocks/              # fixtures — imported only by services/
    │   ├── villas.ts  customers.ts  bookings.ts
    │   ├── payments.ts  menu.ts  operations.ts
    │
    ├── lib/
    │   ├── utils.ts             # cn()
    │   ├── format.ts            # money, dates, initials
    │   └── status.ts            # status → { label, tone } descriptors
    │
    └── types/index.ts           # the domain model
```

---

## 4. Routing map

`RequireRole` wraps the admin and guest trees. With no session it redirects to
`/login`; with the wrong role it redirects to that role's home.

| Route | Access | Page |
|---|---|---|
| `/` | public | Redirects to the signed-in role's home, or `/login` |
| `/login` | public | Mock role picker |
| `/design-system` | public | Living style guide |
| `/design` | public | Alias → `/design-system` |
| `/admin` · `/admin/dashboard` | admin | Operations dashboard |
| `/admin/bookings` | admin | Bookings list, filters, search |
| `/admin/bookings/new` | admin | Manual booking creation |
| `/admin/bookings/:id` | admin | Booking detail |
| `/admin/payments` | admin | Payment verification queue |
| `/admin/villas` | admin | Villa list |
| `/admin/villas/:id` | admin | Villa detail, mode toggle, rooms |
| `/admin/customers` | admin | Customer list |
| `/admin/customers/:id` | admin | Customer profile |
| `/admin/calendar` | admin | Month view + multi-villa timeline |
| `/admin/food` | admin | Kitchen kanban |
| `/admin/requests` | admin | Request management |
| `/admin/feedback` | admin | Feedback list, reply, mark reviewed |
| `/admin/invoices` | admin | Invoice list |
| `/admin/settings` | admin | Property settings |
| `/guest` · `/guest/dashboard` | guest | Stay summary |
| `/guest/booking` | guest | Full booking detail |
| `/guest/payment` | guest | Balance, history, pay / upload receipt |
| `/guest/invoice` | guest | Printable invoice |
| `/guest/amenities` | guest | Amenities + Wi-Fi |
| `/guest/food` | guest | Menu, cart, order status |
| `/guest/requests` | guest | Raise a request, see history |
| `/guest/feedback` | guest | Rating + comment |
| `*` | public | Not found |

**Status:** `/login`, `/design-system` and the role guards are built. Admin and
guest currently land on holding screens (`AdminPlaceholder`, `GuestPlaceholder`)
that read real fixture data through the hooks — proving the data layer — pending
the module build-out.

---

## 5. Component inventory

### shadcn/ui primitives (`src/components/ui/`)
`avatar` · `badge` · `button` · `calendar` · `card` · `dialog` · `dropdown-menu` ·
`input` · `label` · `popover` · `select` · `separator` · `sheet` · `sonner` ·
`table` · `tabs` · `textarea` · `tooltip`

These files are stock. All brand styling reaches them through the CSS variables
in §10 — nothing in `ui/` is hand-edited, so a `shadcn add` upgrade is safe.

### Shared components (`src/components/common/`)

| Component | Purpose |
|---|---|
| `StatusBadge` | Tinted pill with a dot **and** a written label. The single way status is displayed. |
| `StatCard` | One scannable figure. `default` / `accent` (ink) / `warn` tones. |
| `PageHeader` | Eyebrow + title + description + actions. |
| `Eyebrow` | All-caps wide-tracked label. |
| `EmptyState` · `ErrorState` · `LoadingState` · `Skeleton` | The four non-happy states, designed rather than default. |
| `DevBadge` | The "DEV / MOCK LOGIN" marker. Delete this and `MockSessionProvider` to remove the mock auth. |

### Planned domain components
`BookingTable`, `BookingFilters`, `BookingStatusActions`, `FinancialBreakdown`,
`ActivityTimeline`, `PaymentReceiptViewer`, `RejectPaymentDialog`,
`VillaCard`, `RoomGrid`, `ModeToggle`, `CalendarMonth`, `CalendarTimeline`,
`MenuItemCard`, `CartSheet`, `KitchenBoard`, `OrderCard`, `RequestBoard`,
`FeedbackCard`, `InvoiceDocument`.

---

## 6. Mock-data architecture

Fixtures live in `src/data/mocks/` as typed arrays, one file per domain. They are
relational by id and internally consistent — every foreign key resolves, and the
denormalised facts agree (a villa whose rooms are all `occupied` has a live
whole-villa booking to match).

| File | Contents |
|---|---|
| `villas.ts` | 3 villas × 4 rooms. Maaya and Nirvaana whole-villa, Praana split. |
| `customers.ts` | 6 guests with preferences and guest types. |
| `bookings.ts` | 14 bookings + `MOCK_TODAY`. All 6 sources, 10 of the 12 statuses, whole-villa and split examples. |
| `payments.ts` | 12 payments: approved, uploaded (the queue), rejected with a reason, refunded. |
| `menu.ts` | 15 menu items across 7 categories, veg/non-veg, one unavailable. |
| `operations.ts` | 7 food orders (7 different states), 5 requests, 4 feedback entries, 4 invoices, 15 activity events, 5 notifications. |

`MOCK_TODAY` is `2026-09-01`, and the bookings are laid out around it so the
dashboard always has an arrival, a departure and in-house stays.

**Images** come from `picsum.photos` with stable seeds, so every card has real
photography and no asset is committed. `villas.ts` funnels them through one `img()`
helper — the single place to change when Supabase Storage supplies real URLs.

---

## 7. Data-access abstraction

`MockDataProvider` is the seam. It exposes each collection plus a mutator per
write the UI performs:

| Mutator | Effect on mock state |
|---|---|
| `createBooking` · `updateBooking` | Insert / patch, and log an activity event. |
| `approvePayment(id)` | Payment → `approved` with verifier and timestamp; booking's `amountPaid` increases and status becomes `confirmed`; activity logged. |
| `rejectPayment(id, reason, note?)` | Payment → `rejected` with the reason; booking back to `pending_payment` (BR8); activity logged. |
| `addPayment` | Insert; booking → `payment_uploaded`. |
| `setVillaMode` · `updateVilla` | Patch the villa. |
| `createFoodOrder` · `setFoodOrderStatus` | Insert / advance on the kanban. |
| `createRequest` · `updateRequest` | Insert / assign / advance. |
| `createFeedback` · `updateFeedback` | Insert / reply / mark reviewed. |
| `logActivity` | Append to the timeline. |
| `markNotificationsRead` | Clear the tray. |

Each mutator's body is one `setState`. In Phase 2 each becomes one
`supabase.from(...).insert/update()` followed by an invalidate — the signature
does not change, so no caller changes.

---

## 8. Named hooks and functions

Every one of these lives in `src/hooks/useData.ts` and is what a page calls.

**Inventory** — `useVillas()` · `useVilla(id)`

**Customers** — `useCustomers()` · `useCustomer(id)` · `useCustomerStats(id)`
(booking count, lifetime spend, last stay — derived, not stored)

**Bookings** — `useBookings()` · `useBooking(id)` · `useBookingViews()` ·
`useBookingView(id)`
A `BookingView` is a booking joined to its villa, customer, room names and
computed totals — the shape every list and detail screen wants.

**Payments** — `usePayments()` · `useBookingPayments(bookingId)` ·
`usePaymentVerificationQueue()` (uploaded receipts, oldest first, joined to
their booking view)

**Invoices** — `useInvoices()` · `useBookingInvoice(bookingId)`

**Food** — `useMenu()` · `useFoodOrders()` · `useFoodOrderViews()`

**Requests** — `useRequests()` · `useRequestViews()`

**Feedback** — `useFeedback()` · `useFeedbackViews()`

**Activity** — `useActivity(entityId)` · `useNotifications()`

**Dashboard** — `useTodayOverview()` — arrivals, departures, in-house, occupied
and available villas, receipts pending, outstanding balance, open requests, active
kitchen orders, in one pass.

**Session** — `useSession()` → `{ session, signInAs, signOut }`

**Pure domain functions** (`src/services/domain.ts`, no React):
`bookingTotals(charges, paid)` · `findConflicts(query, all)` ·
`datesOverlap(a1,a2,b1,b2)` · `holdsInventory(booking)` ·
`bookingsOnDate(all, villaId, date)` · `addDays` · `toISODate` · `orderTotal`

---

## 9. State-management approach

1. **Two providers, both in `App.tsx`.** `MockSessionProvider` (role) wraps
   `MockDataProvider` (everything else).
2. **Reads go through hooks; writes go through mutators.** A component never
   reaches into the context object directly except via `useMockData()`, which the
   hooks use internally.
3. **Derived data is derived, never stored.** Totals, balances, occupancy, guest
   spend and conflict sets are all computed in `useMemo`, so a mutation cannot
   leave two facts disagreeing.
4. **Local state stays local.** Filters, dialogs and form drafts live in the
   component that owns them.

---

## 10. Design-system approach

The entire visual system is **one file**: `src/index.css`. Three blocks:

1. **`@theme` — brand tokens.** `--color-ink`, `--color-sand`, `--color-stone`,
   `--color-clay`, their ramps, the six status tone pairs, `--font-display`
   (Fraunces), `--font-sans` (Inter), and three shadow tokens. Tailwind generates
   `bg-ink`, `text-stone-600`, `shadow-lift` and so on from these automatically.
2. **`:root` — shadcn/ui semantic variables**, mapped onto the brand tokens:
   `--primary: #142731`, `--background: #f4efe8`, `--ring: #b5654a`, and so on,
   re-exported through `@theme inline`. This is why stock shadcn components look
   like Homes of Sanctuary without a single edit to `components/ui/`.
3. **`@layer base` — element defaults.** Serif headings, 1.6 body line-height,
   clay focus ring at 2px with offset, warm default border colour.

No component contains a hex value. `/design-system` renders every token and
primitive in default, hover, focus, disabled, loading, error, empty and success
states, and is built before the business screens so they inherit from something
that already exists.

**Brand direction:** ink for structure, sand for ground, stone for edges, clay
used sparingly for the one thing on a screen you should act on. Status colours are
desaturated and earthy — amber-clay for pending, sage for confirmed, dusty rose
for cancelled, muted neutral for completed. No saturated blue or purple appears in
the product.

---

## 11. Responsive strategy

**Admin — desktop-first, degrading deliberately.**
Base layout targets 1280px+. At tablet width the sidebar collapses to icons and
tables drop their least-critical columns rather than scrolling horizontally off
screen. Below `sm`, booking rows become cards and detail views move into a
`Sheet`. Dense tables that must stay tabular sit in their own `overflow-x-auto`
container — the page body never scrolls sideways.

**Guest — mobile-first, growing up.**
Base layout targets 390px. Single column, large photography, thumb-reachable
primary actions, generous spacing. At `sm`/`lg` the content column is capped
(`max-w-3xl`) and gains a second column where it genuinely helps — the desktop
view is not the design target, and the mobile view is not a shrunk desktop.

Tailwind's default breakpoints are used unchanged: `sm` 640 · `md` 768 · `lg` 1024
· `xl` 1280.

---

## 12. Accessibility strategy

- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page,
  headings in order.
- Every input has a real `<label>`; hints and errors are wired through
  `aria-describedby`, and errors carry `role="alert"` plus `aria-invalid`.
- Radix supplies focus trapping, escape handling and roving focus for dialogs,
  sheets, menus, tabs, selects and the calendar.
- A single global focus style: 2px clay outline with 2px offset, never removed.
- **Status is never colour alone** — every badge carries a label and a dot; the
  calendar pairs colour with text. This is a hard rule (BR11), not a preference.
- Async controls set `aria-busy`; live regions announce loading and result states.
- `prefers-reduced-motion` disables the login parallax and all layer transitions.
- Contrast: ink on sand ≈ 13:1, stone-600 on paper ≈ 4.9:1, clay on paper ≈ 4.6:1
  — all body text clears WCAG AA.
- Icon-only buttons carry an `aria-label`; decorative images are `alt=""` +
  `aria-hidden`.

---

## 13. Plugins and skills used

| Capability | Available? | Used how |
|---|---|---|
| `shadcn/ui` CLI | Yes | `shadcn init` + `add` for all 18 primitives. Note: `init` failed once because the CLI reads path aliases from the **root** `tsconfig.json`, not `tsconfig.app.json` — the root file now carries a `paths` mapping purely for the CLI's benefit, and `src/lib/utils.ts` was written by hand after that failure aborted the write. |
| `frontend-design` skill | Yes | Used as the aesthetic brief for the token system and the login/design-system compositions. |
| `ponytail` (scope discipline) | Yes | Active throughout: no state library, no form library, no data-fetching library, no abstraction with one implementation. |
| Figma MCP | Connector present but **not authorised** in this session | Not used. No Figma file was provided, so nothing was lost — but be aware the connector needs authorising in claude.ai settings before any Figma-driven work. |
| Adobe MCP | Connector present but **not authorised** | Not used. Not relevant to this phase. |
| Storybook | Not installed | Deliberately skipped. `/design-system` is the living style guide; Storybook would be a second build pipeline to maintain for the same purpose. |

---

## 14. Known limitations of the UI-only phase

1. **Nothing persists.** A refresh resets every mutation. Only the chosen role
   survives, in `localStorage`.
2. **Conflict detection is advisory.** `findConflicts` runs client-side against
   fixture data. There is no transaction and no lock, so it demonstrates the rule
   rather than enforcing it. Two people cannot actually double-book here because
   there is no shared state at all.
3. **No file leaves the browser.** Receipt upload reads the file into an object
   URL for preview and discards it.
4. **Invoices are HTML.** "Download PDF" and "Email" are visual placeholders;
   printing uses the browser's print stylesheet.
5. **Notifications are static fixtures** in a tray labelled as mock.
6. **Images are placeholders** from `picsum.photos`, and the app needs network
   access to render them.
7. **One bundle, 585 kB** (177 kB gzipped). Route-level `React.lazy` is the fix
   and is worth doing once the module count justifies it, not before.
8. **No unit-test framework.** One dependency-free self-check covers the domain
   rules (§15). Adding Vitest is a Phase 2 decision.
9. **Times are naive.** All fixture timestamps are `+05:30`; there is no timezone
   handling because there is one property in one timezone.

---

## 15. Testing

The only real logic in this phase is money arithmetic and inventory conflicts, so
that is the only thing tested — `src/services/domain.test.ts`, run with
`npm run test` (a plain `node:assert` script via `tsx`, no framework).

It covers: the full charge breakdown, tax rounding, balance never going negative,
half-open date overlap (a check-out on the 3rd does not block a check-in on the
3rd), whole-villa vs room conflicts in both directions, non-conflicting sibling
rooms, released statuses no longer holding inventory, self-exclusion when editing,
cross-villa isolation, and month/year rollover in `addDays`.

> This check already earned its keep: it caught `addDays` returning the wrong day
> at month boundaries, because `toISOString()` converted local midnight to the
> previous day in UTC for anyone east of Greenwich. The fix — a local-calendar
> `toISODate` — is in `domain.ts`.

---

## 16. PHASE 2 — wiring in Supabase

### 16.1 Which mock functions become Supabase queries

The seam is `MockDataProvider`. Every collection it holds becomes a query and
every mutator becomes a write. `src/hooks/useData.ts` keeps its exact API, so
**no page component changes**.

| Today | Phase 2 |
|---|---|
| `villas` state | `supabase.from("villas").select("*, rooms(*)")` |
| `customers` | `from("customers").select()` |
| `bookings` | `from("bookings").select("*, customer:customers(*), villa:villas(*)")` |
| `payments` | `from("payments").select()` |
| `foodOrders` | `from("food_orders").select("*, lines:food_order_lines(*)")` |
| `requests` · `feedback` · `invoices` | direct table selects |
| `activity` | `from("activity_events").select()` — likely written by DB triggers rather than the client |
| `approvePayment(id)` | RPC `approve_payment(payment_id)` — must be a **single transaction**: update the payment, increment `bookings.amount_paid`, set booking status, insert the activity row. Doing this as three client calls invites a half-applied state. |
| `rejectPayment(id, reason, note)` | RPC `reject_payment(...)` — same reasoning (BR8). |
| `createBooking(data)` | RPC `create_booking(...)` that re-runs the conflict check inside the transaction (§16.6). |
| `setFoodOrderStatus` | `from("food_orders").update({ status })` |
| `createRequest` · `updateRequest` · `createFeedback` · `updateFeedback` | direct writes |

**Recommended addition at this point:** TanStack Query, so the provider becomes a
set of `useQuery`/`useMutation` hooks with cache invalidation, and the manual
`useState` collections disappear rather than being ported. This is the one
dependency worth adding — introducing it *now*, before the query shapes are known,
would be guessing.

The derived hooks — `useBookingViews`, `useTodayOverview`, `useCustomerStats`,
`usePaymentVerificationQueue` — keep their derivation logic on the client. They
are cheap over a three-villa dataset. Only if the booking table grows past a few
thousand rows should the dashboard aggregation move into a Postgres view.

### 16.2 Where Supabase Auth is introduced

Three files, and nothing else:

1. **`src/services/mock/MockSessionProvider.tsx`** → a real `SessionProvider`
   wrapping `supabase.auth.onAuthStateChange`. `useSession()` keeps its shape:
   `{ session, signInAs, signOut }` becomes `{ session, signIn, signOut }`.
2. **`src/pages/auth/LoginPage.tsx`** — the two role cards are replaced by a real
   form. Recommended: magic link or phone OTP for guests (they already receive a
   booking confirmation), email + password for staff.
3. **`src/routes/AppRoutes.tsx`** — `RequireRole` reads the role from a JWT claim
   (`app_metadata.role`) instead of `localStorage`. The route table itself is
   unchanged.

Then delete `DevBadge` and its usages. The `MOCK_GUEST_CUSTOMER_ID` constant
disappears: the guest's `customer_id` comes from their session, and
`/guest/*` resolves the current booking by that id rather than a hardcoded one.

**Role model:** `admin` and `guest` as a JWT claim set on the user record. Staff
sub-roles (housekeeping, kitchen, maintenance) exist as request assignees in this
phase but are not accounts; if they become accounts, add them as claims then.

### 16.3 Where RLS policies matter

RLS is the actual authorization boundary — `RequireRole` is only a routing
convenience and must never be trusted.

| Table | Policy |
|---|---|
| `customers` | Guest: `SELECT` where `id = auth.jwt()->>'customer_id'`. Admin: full. |
| `bookings` | Guest: `SELECT` own rows only. **No guest `UPDATE` at all** — status changes go through RPCs. Admin: full. |
| `payments` | Guest: `INSERT` own (uploading a receipt) and `SELECT` own. **Guest must never `UPDATE` `status`, `verified_by` or `verified_at`** — this is the single most important policy in the schema; without it a guest can approve their own payment. Approval is admin-only via RPC. |
| `invoices` | Guest: `SELECT` own. No writes. |
| `food_orders` | Guest: `INSERT`/`SELECT` own. `UPDATE` only to cancel while still `placed`. Kitchen transitions are admin-only. |
| `guest_requests` | Guest: `INSERT`/`SELECT` own. `assigned_to`, `priority` and `status` are admin-only columns — enforce with a column-level policy or a trigger. |
| `feedback` | Guest: `INSERT`/`SELECT` own. `reply` and `reviewed` are admin-only. |
| `villas` · `rooms` · `menu_items` | Public `SELECT` (the marketing site reads them too). Admin-only writes. |
| `activity_events` | Admin `SELECT`. Guests see a filtered subset, if any. Writes by trigger only. |

Two general rules: **deny by default** and turn RLS on for every table including
join tables; and **never let a client write a column that represents a decision the
business makes** — verification fields, statuses and assignments belong to RPCs.

### 16.4 How storage handles payment receipts

A private bucket, `payment-receipts`, not public.

- **Path convention:** `{booking_id}/{payment_id}.{ext}` — makes the storage RLS
  policy expressible as a path prefix check against the guest's bookings.
- **Upload:** the guest's file picker calls `supabase.storage.from("payment-receipts").upload(path, file)`. `Payment.receiptImage` stores the **path**, not a
  URL — today it stores a placeholder URL, so this field changes meaning and the
  viewer component resolves it.
- **Reading:** admins fetch a short-lived signed URL (`createSignedUrl`, ~60s) per
  view. Never make this bucket public: receipts carry bank details and phone
  numbers.
- **Constraints to enforce server-side:** max ~5 MB, `image/jpeg`, `image/png`,
  `image/webp`, `application/pdf`. Validate the MIME type in a storage policy, not
  only in the browser.
- **Storage RLS:** guests may `INSERT` under a prefix matching a booking they own,
  and `SELECT` their own. Admins may `SELECT` all. Nobody gets `DELETE` — a
  verified receipt is a financial record.

The UI component that previews a receipt takes a `src` prop and does not care
where it came from, so it does not change.

### 16.5 How real payment integration replaces mock payment state

The current flow — instructions → guest uploads a receipt → admin approves —
stays. It is how UPI and bank transfers actually work at this property, and it
should not be removed when a gateway is added.

A gateway (Razorpay or Cashfree, both handle UPI well in India) is added as a
*second* path:

1. `POST` to an Edge Function to create an order; it returns an order id.
2. The gateway's checkout runs client-side.
3. **The webhook, not the browser, is the source of truth.** The gateway's
   server-to-server callback hits an Edge Function that verifies the signature and
   writes the payment as `approved` with `verified_by = 'gateway'`.
4. A gateway payment therefore skips the verification queue entirely; the queue
   keeps serving UPI and bank-transfer receipts.

`PaymentMethod` gains `"gateway"`. `Payment.reference` holds the gateway payment
id. The admin verification UI is unchanged — it filters on
`status = "uploaded"`, and gateway payments never enter that state.

Never trust a client-side success callback to mark a payment approved.

### 16.6 How booking-conflict validation becomes server-side

Today `findConflicts()` runs in the browser against fixture data. That stays — it
is good UX to block an obviously bad form before submitting. But it becomes
advisory only.

The authoritative check moves into Postgres:

1. **A `btree_gist` exclusion constraint** on the bookings table over
   `(villa_id, daterange(check_in, check_out, '[)'))`, restricted to statuses that
   hold inventory. The `'[)'` bound is exactly BR2's half-open rule, and an
   exclusion constraint is the only way to make double-booking *impossible* rather
   than *unlikely* under concurrency.
2. **Room-level holds** need a companion table (`booking_rooms`) with its own
   exclusion constraint on `(room_id, daterange)`, plus a trigger that expands a
   whole-villa booking into holds on all four of its rooms. That expansion is what
   makes BR4 fall out automatically — a whole-villa hold then conflicts with a
   room hold through the same constraint, with no special-case logic.
3. **`create_booking` RPC** wraps the insert so the constraint violation is caught
   and returned as a friendly error naming the conflicting booking.

The client keeps `domain.ts` for instant feedback; the database keeps the truth.
When they disagree, the database wins and the UI shows its error.

### 16.7 Real email / WhatsApp / notifications

- **Transactional email** — Resend or Postmark, called from an Edge Function
  triggered by a database webhook on booking confirmation, payment approval and
  invoice issue. Never from the browser: the API key must not ship to the client.
- **WhatsApp** — the WhatsApp Business Cloud API, same trigger pattern. Templates
  need approval ahead of time, which is a lead-time item, not an engineering one.
- **In-app notifications** — the mock tray becomes a `notifications` table plus a
  Supabase Realtime subscription on it. The tray component's props do not change;
  the fixture array becomes a subscription. Drop the "mock" label at that point.
- **Push** — only if the admin asks for it. A browser tab plus WhatsApp covers a
  three-villa property.

### 16.8 React Router stays; no Next.js migration

Nothing above requires a server-rendered framework:

- Supabase's client SDK is browser-first; auth, queries, storage and realtime all
  work from a static SPA.
- The secrets that must not ship to a browser — email keys, gateway keys, webhook
  signature verification — go in **Edge Functions**, which is where they would go
  under Next.js too. Route handlers are not the only place to keep a secret.
- This app sits behind a login. SEO, which is the strongest argument for SSR, is
  irrelevant here; the public marketing site already handles it and is a separate
  application.
- The route table in §4 is the contract. It is expressed in React Router today and
  would have to be re-expressed as a filesystem under Next.js, for no functional
  gain and a full rewrite of every page shell.

The CRM ships as static files on any CDN. The marketing site stays on Next.js.
They may eventually share a Supabase project and a types package; they remain two
frontends.
