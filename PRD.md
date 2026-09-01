# Homes of Sanctuary — Operations CRM & Guest Portal
## Product Requirements Document · Phase 1 (UI)

---

## 1. Product overview

Homes of Sanctuary is a three-villa luxury holiday-home property near Nandi Hills,
Bengaluru. The public marketing site (`home-of-santuarary.vercel.app`) already
exists and is a separate product.

This product is the **internal operations CRM** and the **guest portal** that sits
behind it: everything that happens between an enquiry arriving and a guest leaving.

Two audiences, one data model:

- **Admin** — the owner and the reception desk, working a desktop all day.
- **Guest** — a confirmed guest on their phone, before and during their stay.

---

## 2. Problem statement

Operations today run on WhatsApp threads, phone notes and a spreadsheet.
Specifically:

1. **Bookings arrive through six channels** — the website, phone, WhatsApp,
   Goibibo, walk-ins and referrals — and there is no single list of them.
2. **Payments are verified by eye.** Guests send a UPI or bank-transfer screenshot
   over WhatsApp. Someone opens it, compares the amount to a note, and replies.
   Nothing records who approved what, or why a receipt was rejected.
3. **Inventory is ambiguous.** Each villa can be sold whole or as four separate
   rooms. Nothing stops a whole-villa booking from being taken on dates where one
   room is already sold.
4. **Guests have no self-serve surface.** Wi-Fi passwords, invoices, food orders
   and housekeeping requests all come back to the same phone.
5. **The kitchen has no queue.** Food orders are relayed verbally and their state
   lives in someone's head.

---

## 3. Target users

### Admin / owner
Runs the property day to day. Needs speed and density over decoration: a morning
screen that says who is arriving, who is leaving, what money is outstanding, and
what is waiting on a decision.

### Reception desk
Takes phone and WhatsApp bookings, enters them manually, verifies receipts.
Lives in two screens: the payment verification queue and the bookings list.

### Guest
On a phone, usually on patchy hill signal. Wants their booking details, the
Wi-Fi password, an invoice, a way to order breakfast, and a way to ask for towels
without calling anyone.

---

## 4. Goals (this phase)

1. A complete, polished UI for every module below, running on realistic
   fixture data — no screen left as a placeholder.
2. A design system that the whole product is visibly built from, published at
   `/design-system` before any business screen exists.
3. A data-access layer clean enough that swapping fixtures for Supabase touches
   only `src/services/` — never a page component.
4. Demonstrate the two hard business rules in the UI: the booking lifecycle
   (twelve states, not four) and whole-villa vs room-split inventory.
5. A one-click mock login that is obviously temporary and trivially removable.

## 5. Non-goals (this phase)

- Any real persistence. Refreshing the browser resets mock mutations.
- Rebuilding or restyling the public marketing website.
- Multi-property support. Three villas, one property.
- Staff accounts, shifts, payroll, or channel-manager sync with Goibibo.
- Revenue management, dynamic pricing, or reporting/analytics dashboards.

---

## 6. Current phase scope

**In scope:** all UI for the ten modules in §8, the design system, the mock
login, realistic relational fixture data, responsive behaviour, and accessibility
basics.

**Explicitly out of scope — nothing below is real in this phase:**

| Out of scope | What exists instead |
|---|---|
| Real authentication | One-click role picker, role in `localStorage` |
| Real authorization / RLS | `RequireRole` route guard over the mock session |
| Real database | Typed fixtures in `src/data/mocks/` |
| Supabase (client, auth, storage) | Not installed, not imported |
| Payment gateway | "Pay Now" is a mock action; receipts are placeholder images |
| File storage / upload | File picker UI with a local preview; nothing is uploaded |
| Email / SMS / WhatsApp | Buttons that show a confirmation toast |
| Push or real-time notifications | A static, clearly-labelled mock notification tray |
| PDF generation | A print-styled invoice view and a placeholder download action |

---

## 7. User journeys

### J1 — A website booking becomes a confirmed stay
Guest books on the public site → booking appears with status `pending_payment` →
guest opens the portal, sees payment instructions, uploads a receipt → status
becomes `payment_uploaded` → admin sees it in the verification queue, opens the
receipt beside the booking, approves → status becomes `confirmed`, the payment is
recorded against the booking and the balance updates → invoice is available to
both sides.

### J2 — A rejected receipt
Admin opens the queue, sees the amount does not match → rejects with a reason
(wrong amount / unreadable / duplicate / wrong account / invalid / other) →
booking returns to `pending_payment`, payment is marked `rejected` with the reason
recorded → guest sees the rejection and re-uploads.

### J3 — A phone booking on split-room inventory
Reception takes a call for two rooms at Villa Praana → opens the manual booking
form → picks the villa, sees it is in split mode, picks Room C-1 and D-1 → the
form checks the dates against existing holds and blocks the save if either room,
or the whole villa, is already held for overlapping dates.

### J4 — Morning operations
Admin opens the dashboard: arrivals, departures, in-house count, villa occupancy,
receipts awaiting verification, outstanding balance, open requests, active kitchen
orders — plus a today feed and quick actions into each of them.

### J5 — A guest orders breakfast
Guest opens the portal → browses the menu by category → adds items, adjusts
quantities, submits → order appears in the `Placed` column of the kitchen board →
kitchen calls to confirm, then advances it through cooking, ready, served, billed →
the billed amount joins the booking's financial summary.

### J6 — A guest raises a request
Guest picks a category and writes a note → the request appears on the admin
requests board as `pending` → admin assigns it to housekeeping, maintenance,
kitchen or the manager and advances it → the guest sees the status change.

---

## 8. Modules

| # | Module | Primary user | Core surface |
|---|---|---|---|
| 1 | Mock login | Both | Role picker with dev badge |
| 2 | Admin dashboard | Admin | Today's figures, activity feed, quick actions |
| 3 | Bookings & payments | Admin | List, detail, manual creation, verification queue |
| 4 | Villa & room management | Admin | Villa cards, detail, whole/split mode toggle |
| 5 | Customer CRM | Admin | Guest list, profile, history, preferences |
| 6 | Master calendar | Admin | Month view and multi-villa timeline |
| 7 | Guest portal | Guest | Stay, payment, invoice, Wi-Fi, amenities |
| 8 | Food & kitchen | Both | Guest menu and cart; admin kanban board |
| 9 | Guest requests | Both | Guest request form; admin assignment board |
| 10 | Feedback | Both | Guest rating form; admin review and reply |

---

## 9. User stories

### Module 1 — Mock login
- As anyone, I can enter the product as Admin or as Guest in one click.
- As a developer, I can see at a glance that this login is not real.
- As anyone, my chosen role survives a page refresh.
- As a guest, I land on a real fixture stay — not an empty dashboard.

### Module 2 — Admin dashboard
- As an admin, I see today's check-ins and check-outs with names, villas and times.
- As an admin, I see how many guests are in house and which villas are occupied.
- As an admin, I see how many receipts are waiting on me and the total outstanding.
- As an admin, I can start a new booking, add a customer, verify a payment, add a
  food order or open requests without hunting through navigation.

### Module 3 — Bookings & payments
- As an admin, I can see every booking with guest, villa, room(s), dates, nights,
  guest count, source, booking status, payment status, total and balance.
- As an admin, I can filter by villa, room, booking status, payment status, source
  and date, and search by guest name, reference, phone or email.
- As an admin, I can open a booking and see the guest, the stay, a full financial
  breakdown, special requests, internal notes, an activity timeline, payment
  history and an invoice preview.
- As an admin, I can check a guest in, mark them in-house, check them out, cancel,
  mark a no-show, add a note, and approve or reject a payment.
- As an admin, rejecting a payment requires me to pick a reason.
- As reception, I can create a booking manually for a phone, WhatsApp, Goibibo or
  walk-in guest, with rate, discount, tax and advance.
- As an admin, I have one screen showing only receipts awaiting verification,
  designed to be worked through quickly.

### Module 4 — Villa & room management
- As an admin, I see all three villas with image, bedrooms, capacity, current mode,
  base rate and status.
- As an admin, I can switch a villa between whole-villa and split-room mode.
- As an admin, I can edit rates, times, amenities and Wi-Fi details.
- As an admin, in split mode I see each room with its capacity, status and current
  guest.

### Module 5 — Customer CRM
- As an admin, I see every guest with contact details, booking count, lifetime
  spend, last stay and guest type.
- As an admin, I can open a guest and see their bookings, invoices, payments,
  requests, feedback, preferences and a timeline.

### Module 6 — Master calendar
- As an admin, I see occupancy across all three villas in a month view.
- As an admin, I see a multi-villa timeline where rooms appear for split-mode villas.
- As an admin, bars are colour-coded by status and labelled, and clicking one opens
  the booking.
- As an admin, clicking an empty date starts a booking for that villa and date.
- As an admin, a whole-villa hold visibly blocks the whole villa; a room hold
  visibly blocks only that room.

### Module 7 — Guest portal
- As a guest, I see my villa, dates, room, guest count, nights, booking status and
  payment status on one screen.
- As a guest, I see the total, what I have paid and what is due, plus payment history.
- As a guest, I can upload a receipt: choose a file, preview it, enter the amount,
  method and transaction reference, and submit.
- As a guest, I can read the Wi-Fi details on a card designed for it, not a raw string.
- As a guest, I can see the villa's amenities laid out well.
- As a guest, I can view and print a clean invoice.

### Module 8 — Food & kitchen
- As a guest, I can browse the menu by category, see prices, images and veg/non-veg,
  add items, change quantity, remove items, review a cart and submit an order.
- As a guest, I can see my order's status.
- As the kitchen, I see orders on a board with a column for each state.
- As the kitchen, each card shows the order reference, guest, villa, room, items,
  quantities, total and time placed.
- As the kitchen, I can call to confirm, confirm, start cooking, mark ready, mark
  served, bill, or cancel.
- As an admin, a billed order appears in the booking's financial summary.

### Module 9 — Guest requests
- As a guest, I can raise a request with a category and a note, and see my history.
- As an admin, I see every request with reference, guest, villa, category,
  description, priority, status, assignee and time.
- As an admin, I can assign a request to a team and move it through its states.

### Module 10 — Feedback
- As a guest, I can leave a rating and a comment, and see what I have submitted.
- As an admin, I see all feedback with guest, villa, booking, rating, comment and
  date, and can view it, reply, and mark it reviewed.

---

## 10. Success criteria

1. The app runs as a Vite + React + TypeScript SPA.
2. Mock login works for both roles and persists across a refresh.
3. Every route in the routing map renders a finished screen on fixture data.
4. `/design-system` exists and covers colour, type, spacing, shape and every
   primitive in default, hover, focus, disabled, loading, error, empty and
   success states.
5. All twelve booking states and all seven kitchen states are represented and
   visually distinguishable — and never by colour alone.
6. Whole-villa and split-room modes are visually obvious in the villa list, the
   booking form and the calendar.
7. The payment verification workflow works end to end on mock state, including
   rejection with a reason.
8. Receipt upload, invoice, food ordering, requests and feedback all work through
   mock state from the guest side and surface on the admin side.
9. Admin screens are usable at desktop, small laptop and tablet; guest screens are
   designed mobile-first rather than shrunk.
10. Keyboard navigation, visible focus, labelled controls and accessible form
    errors are in place throughout.
11. `PRD.md` and `TRD.md` exist and are current.
12. No fixture data is imported by a component; everything reads through a hook.
13. No Supabase, auth, database, storage or payment integration exists in the code.

---

## 11. Business rules

**BR1 — Inventory is exclusive.** A villa's bedrooms are the same physical rooms
whether it is sold whole or split. A whole-villa hold consumes all four rooms.

**BR2 — Conflict condition.** Two holds on the same villa conflict when
`newCheckIn < existingCheckOut AND newCheckOut > existingCheckIn`. Ranges are
half-open: a check-out on the 3rd does not conflict with a check-in on the 3rd.

**BR3 — What holds inventory.** Every booking state holds its inventory except
`cancelled`, `rejected`, `no_show`, `checked_out` and `completed`.

**BR4 — Conflicts across modes.** A whole-villa hold conflicts with any hold on
that villa. A room hold conflicts with a whole-villa hold, or with another hold
sharing at least one room. Two holds on different rooms of the same villa do not
conflict.

**BR5 — The UI must not create a known conflict.** Where a conflict is
determinable from the data on hand, the form blocks the save and names the
conflicting booking.

**BR6 — Money is always broken down.** No screen shows a single "amount". Room
charge, surcharges, extras, discount, tax, total, paid and balance are all
separate. Balance never displays as negative.

**BR7 — Payments carry provenance.** Every payment records who verified it and
when. A rejection records a reason from a fixed list, plus an optional note.

**BR8 — Rejection returns the booking.** Rejecting a payment sets the payment to
`rejected` and the booking back to `pending_payment`.

**BR9 — Every booking has a source**, from a fixed list of seven.

**BR10 — Destructive actions confirm.** Cancelling a booking, rejecting a payment
and cancelling a food order all go through a confirmation dialog.

**BR11 — State is never colour alone.** Every status badge carries a written
label; dense views add a shape or glyph.

**BR12 — Billed food joins the booking.** A food order reaching `billed` is added
to the booking's food charge and appears on the invoice.

---

## 12. Booking lifecycle

```
Inquiry
  → Pending Payment
    → Payment Uploaded
      → Payment Approved
        → Confirmed
          → Checked-in
            → In-house
              → Checked-out
                → Completed
```

Terminal branches, reachable from the states where they make sense:

- **Cancelled** — by the guest or the property, before arrival.
- **Rejected** — the property declines the booking.
- **No-show** — confirmed, never arrived.

`Payment Uploaded → Pending Payment` is the one backward transition, taken when a
receipt is rejected.

---

## 13. Whole-villa vs room-split rules

Each villa has four bedrooms and runs in one of two modes.

**Whole villa** — the villa is one inventory unit. One booking blocks all four
bedrooms. This is what the public website sells.

**Split rooms** — each bedroom (Room A-1, B-1, C-1, D-1) is bookable
independently. Different guests may occupy different rooms on the same night.

Rules:

- Mode is a property of the villa and is switchable by an admin.
- Whichever mode is active, BR1 and BR4 hold: whole-villa and room-level holds
  never produce overlapping inventory.
- If a whole villa is booked, every room reads as unavailable.
- If one room is booked, that room is unavailable and the others may stay open.
- If every room is held by the same guest or group, the UI presents it as one
  group stay rather than four unrelated bookings.
- The public website continues to sell whole-villa stays by default; split mode is
  an operational capability, not a change to what the website offers.

---

## 14. What is out of scope

Repeating §6 as an explicit list, because it is the most common source of
misunderstanding about this phase:

- Real authentication
- Real authorization
- Real database
- Real Supabase (client, auth, storage, RLS)
- Real payment gateway
- Real file storage
- Real email
- Real SMS
- Real WhatsApp
- Real notifications

None of these exist in the codebase. Nothing in this phase makes a network call
to anything but a placeholder image host.
