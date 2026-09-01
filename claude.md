# HOMES OF SANCTUARY — CRM / PMS UI PHASE
## FINAL DEVELOPMENT PROMPT

You are building the operations CRM / lightweight PMS for Homes of Sanctuary.

PUBLIC WEBSITE:
https://home-of-santuarary.vercel.app/

The public marketing website already exists. This project is NOT a redesign/rebuild of that public website.

The project being built now is the INTERNAL OPERATIONS CRM plus the GUEST PORTAL UI.

==================================================
1. PHASE SCOPE — READ THIS FIRST
==================================================

THIS PHASE IS UI ONLY.

Do NOT build:
- Real backend logic
- Real database
- Real Supabase queries
- Real authentication
- Real authorization
- Real payment gateway
- Real email/SMS/WhatsApp
- Real file storage
- Real notifications

Everything must work through realistic local mock/fixture data and mock UI state.

The architecture must be clean enough that mock data can later be replaced by Supabase without rewriting the UI.

Do not fake a backend by putting data directly inside components.

Instead isolate all data access behind hooks/functions/repositories so they can later be replaced with Supabase implementations.

Example:

useBookings()
useBooking(id)
useCustomers()
useCustomer(id)
useVillas()
usePayments()
useFoodOrders()
useMenu()
useRequests()
useFeedback()

or equivalent repository/data-access functions.

==================================================
2. TECH STACK — FIXED
==================================================

Use:

- Vite
- React
- TypeScript
- React Router
- Tailwind CSS
- shadcn/ui

This is a client-rendered SPA.

Do NOT use Next.js.

Use the CURRENT official Vite + Tailwind CSS + shadcn/ui setup.

Do not assume an older Tailwind/PostCSS configuration.

For Tailwind v4, use the current CSS-first theme/token approach where appropriate instead of forcing a tailwind.config.js/ts file when the current tooling does not require one.

Use shadcn/ui as the foundation for reusable UI primitives.

Use primitives such as:
- Button
- Dialog
- Input
- Table
- Calendar
- Tabs
- Badge
- Card
- Dropdown Menu
- Sheet
- Form
- Select
- Textarea
- Tooltip
- Alert
- Separator

Do not hand-roll primitives that shadcn/ui already provides well.

==================================================
3. PROJECT SETUP
==================================================

Before building application modules:

1. Scaffold the Vite React TypeScript application.
2. Install current Tailwind CSS using the current official Vite setup.
3. Install React Router.
4. Initialize shadcn/ui using its current Vite setup.
5. Check available plugins/skills before development.
6. Look for:
   - design-system / UI-critique capability
   - frontend/web best-practices capability
   - Figma MCP only if a Figma file is actually provided
7. If relevant plugins/skills are unavailable, explicitly document that in TRD.md rather than pretending they were used.

==================================================
4. DESIGN SYSTEM — MUST COME FIRST
==================================================

Create:

/design-system

This route must be built BEFORE the real application pages.

It is a living style guide and must demonstrate:

- Color palette
- Typography
- Spacing scale
- Radius
- Shadows
- Buttons
- Inputs
- Selects
- Forms
- Cards
- Tables
- Dialogs
- Sheets
- Tabs
- Badges
- Calendar
- Dropdowns
- Alerts
- Loading states
- Empty states
- Error states
- Success states
- Disabled states
- Focus states

Every important component should demonstrate:

- Default
- Hover
- Focus
- Disabled
- Loading
- Error
- Empty
- Success

==================================================
5. BRAND / VISUAL DIRECTION
==================================================

Homes of Sanctuary is a luxury hospitality brand.

The visual identity should communicate:

- Rustic-contemporary architecture
- Raw stone
- Timber
- Earth tones
- Wide breezy verandahs
- Calm luxury
- Boutique hospitality
- Quiet, understated elegance

Think:

"Aman-style resort quietness"

NOT:

"generic SaaS admin dashboard"

Avoid bright saturated tech blues and purples.

The CRM is a working tool, but it should still feel like Homes of Sanctuary.

==================================================
6. DESIGN TOKENS
==================================================

Use named design tokens rather than scattering raw hex values through components.

Primary colors:

INK:
#142731

Use for:
- headings
- navigation
- primary buttons
- important text

SAND:
#F4EFE8

Use for:
- main background
- warm neutral surfaces

STONE:
#A69C8E

Use for:
- borders
- muted text
- dividers

CLAY:
#B5654A

Use sparingly for:
- CTAs
- active states
- links
- highlights

Booking/order status colors should remain desaturated and earthy.

Suggested semantic tones:

Pending:
- amber/clay

Confirmed:
- sage green

Cancelled/rejected:
- dusty rose

Completed:
- muted neutral/sage

Do NOT use generic bright red/green/yellow SaaS colors.

==================================================
7. TYPOGRAPHY
==================================================

Headings:
Use an elegant serif / high-contrast display font.

Possible:
- Fraunces
- Cormorant
- Playfair Display

Body/UI:
Use:
- Inter
or
- General Sans

Use generous line-height:
approximately 1.5–1.7 for normal body text.

Use generous letter spacing for all-caps labels.

Use generous whitespace.

==================================================
8. SPACING / SHAPE
==================================================

Base spacing unit:
4px.

Prefer:
16 / 24 / 32 / 48px

Use generous spacing between major sections.

Rounded corners:
- rounded-lg
- rounded-xl

Avoid excessive pill-shaped UI.

Use soft low-opacity shadows rather than harsh borders where appropriate.

==================================================
9. PHOTOGRAPHY / HOSPITALITY FEEL
==================================================

Use large, high-quality mock image placeholders where photography is relevant.

Use photography for:
- villa cards
- guest portal header
- food menu cards
- appropriate hospitality surfaces

Do not use tiny generic thumbnails.

Even loading and empty states should feel designed and premium.

==================================================
10. ADMIN VS GUEST EXPERIENCE
==================================================

ADMIN:

Desktop-first.

Prioritize:
- speed
- information density
- scanning
- filters
- tables
- status
- quick actions

Admin can be more compact than guest-facing pages.

GUEST:

Mobile-first.

Must feel like a direct continuation of the public Homes of Sanctuary website.

Use:
- warm editorial layout
- large photography
- generous whitespace
- minimal chrome
- simple navigation

Important guest tasks must work beautifully on mobile:
- booking details
- payment status
- receipt upload UI
- food ordering
- requests
- feedback

==================================================
11. MOCK AUTHENTICATION
==================================================

Create a mock login screen.

Two options:

[ Continue as Admin ]

[ Continue as Guest ]

Admin → Admin Dashboard

Guest → Guest Portal

There is NO real authentication.

Use local React state, context, or a lightweight cookie/localStorage only for mock session persistence.

Clearly show:

"DEV / MOCK LOGIN"

somewhere in the UI.

This must be easy to remove later.

The mock guest should be connected to an actual fixture customer and booking, not a generic empty dashboard.

Example guest:
Pooja Bothra

Example confirmed booking:
Villa Maaya

==================================================
12. CORE BUSINESS MODEL
==================================================

Homes of Sanctuary currently has 3 villas:

1. Villa Maaya
2. Villa Praana
3. Villa Nirvaana

Each villa has 4 bedrooms.

The public website primarily represents booking the villa as a private whole-villa stay.

However, the CRM must support two operational modes:

WHOLE VILLA MODE

The entire villa is treated as one inventory unit.

Example:

Villa Maaya
└── 4 bedrooms

One booking blocks the entire villa.

ROOM-SPLIT MODE

The villa can be operated as individually bookable rooms.

Example:

Villa Maaya
├── Room A-1
├── Room B-1
├── Room C-1
└── Room D-1

Individual rooms can be occupied by different guests.

IMPORTANT RULE:

A villa can operate in either:
- Whole Villa mode
OR
- Split Room mode

Whole-villa and room-level bookings must never create overlapping inventory.

Examples:

If Whole Villa is booked:
→ all rooms are unavailable.

If Room A is booked in Split mode:
→ Room A unavailable
→ other rooms may remain available.

If all rooms are occupied by the same guest/group:
→ represent this as one logical group stay where appropriate, not as unrelated bookings.

Make this behavior visually obvious in the UI.

==================================================
13. BOOKING LIFECYCLE
==================================================

Use this lifecycle:

Inquiry
↓
Pending Payment
↓
Payment Uploaded
↓
Payment Approved
↓
Confirmed
↓
Checked-in
↓
In-house
↓
Checked-out
↓
Completed

Alternative terminal states:

Cancelled
Rejected
No-show

The UI must distinguish these statuses clearly.

Do not limit booking status to only:
Pending / Confirmed / Cancelled / Completed.

==================================================
14. BOOKING SOURCES
==================================================

Every booking should have a source.

Possible sources:

- Website
- Phone
- WhatsApp
- Goibibo
- Walk-in
- Referral
- Other

The UI should display and filter by booking source where useful.

==================================================
15. MODULES
==================================================

Build modules in this order.

--------------------------------------------------
MODULE 1 — MOCK LOGIN
--------------------------------------------------

Requirements:

- Continue as Admin
- Continue as Guest
- Mock/dev badge
- Persist mock session if useful
- Role-aware routing

--------------------------------------------------
MODULE 2 — ADMIN DASHBOARD
--------------------------------------------------

Create an actual operations dashboard.

Show:

- Today's check-ins
- Today's check-outs
- Currently in-house
- Occupied villas
- Available villas
- Pending payment verification
- Outstanding balances
- Pending guest requests
- Active food orders

Include a "Today" activity feed.

Example:

CHECK-IN
Rahul Sharma
Villa Maaya
12:00 PM

CHECK-OUT
Ankit
Villa Praana
11:00 AM

Add quick actions:

- New Booking
- Add Customer
- Verify Payment
- Add Food Order
- View Requests

This should feel like the most useful daily screen.

--------------------------------------------------
MODULE 3 — BOOKINGS & PAYMENTS
--------------------------------------------------

BOOKINGS LIST

Show:

- Booking ID
- Guest
- Villa
- Room(s), if applicable
- Check-in
- Check-out
- Number of nights
- Guest count
- Booking source
- Booking status
- Payment status
- Total amount
- Balance

Filters:

- Villa
- Room
- Booking status
- Payment status
- Booking source
- Date

Search:

- Guest name
- Booking ID
- Phone
- Email

BOOKING DETAIL

Show:

Guest:
- Name
- Phone
- Email

Stay:
- Villa
- Room(s)
- Dates
- Adults
- Children
- Number of nights
- Booking source

Financials:
- Villa rate
- Nights
- Weekend/seasonal charges if applicable
- Food
- Add-ons
- Discount
- Tax
- Total
- Amount paid
- Balance due

Also show:
- Special requests
- Internal notes
- Activity timeline
- Payment history
- Invoice preview

Actions:

- Edit Booking
- Check In
- Mark In-house
- Check Out
- Cancel Booking
- Mark No-show
- Add Note
- Approve Payment
- Reject Payment

REJECTION:

If rejecting a payment, show a dialog asking for the rejection reason.

Possible reasons:
- Wrong amount
- Unreadable receipt
- Duplicate receipt
- Wrong bank account
- Invalid transaction
- Other

MANUAL BOOKING CREATION:

For:
- Phone bookings
- WhatsApp bookings
- Goibibo bookings
- Walk-ins

Fields:

- Booking source
- Villa
- Room if split mode
- Check-in
- Check-out
- Adults
- Children
- Guest details
- Rate
- Discount
- Tax
- Advance
- Special requests

PAYMENT VERIFICATION QUEUE:

Create a dedicated high-speed screen for:

"Payment Uploaded — Awaiting Verification"

This is a daily-use workflow.

It should be easy to:

- Open receipt
- Review amount
- Approve
- Reject
- See booking details

--------------------------------------------------
MODULE 4 — VILLA & ROOM MANAGEMENT
--------------------------------------------------

List:

- Villa Maaya
- Villa Praana
- Villa Nirvaana

Each card should show:

- Villa image
- Villa name
- Number of bedrooms
- Capacity
- Current mode
- Base rate
- Status

Current mode:

- Whole Villa
- Split into Rooms

Villa detail page:

- Edit villa name
- Description
- Capacity
- Bedrooms
- Base rate
- Weekend rate
- Seasonal rate
- Check-in time
- Check-out time
- Amenities
- Wi-Fi network
- Wi-Fi password
- Villa status

Room list in split mode:

- Room A-1
- Room B-1
- Room C-1
- Room D-1

Each room can show:

- Name
- Capacity
- Status
- Current guest if occupied

Do not make the public website dependent on room booking by default.

--------------------------------------------------
MODULE 5 — CUSTOMER / GUEST CRM
--------------------------------------------------

CUSTOMER LIST

Show:

- Name
- Phone
- Email
- Number of bookings
- Total spending
- Last stay
- Guest type

Search:

- Name
- Phone
- Email

CUSTOMER DETAIL

Show:

- Contact information
- Booking history
- Invoices
- Payments
- Special requests
- Feedback
- Guest preferences
- Activity timeline

Example preferences:

- Vegetarian
- Early breakfast
- Poolside dining

Do not invent sensitive personal data.

--------------------------------------------------
MODULE 6 — MASTER CALENDAR
--------------------------------------------------

Provide:

1. Month calendar view
2. Multi-villa timeline / Gantt-style view if feasible

Display:

- All 3 villas
- Rooms when split mode is active
- Occupancy
- Booking status

Clicking a booking opens booking details.

Clicking an empty date can open:
"Create Booking"

Visually distinguish:

- Pending payment
- Payment uploaded
- Confirmed
- Checked-in
- In-house
- Cancelled

Inventory conflicts must be visually obvious.

Whole-villa booking:
→ blocks whole villa.

Room booking:
→ blocks only selected room.

--------------------------------------------------
MODULE 7 — GUEST PORTAL
--------------------------------------------------

Guest home/dashboard:

Show:

- Guest name
- Current/upcoming booking
- Villa
- Room if applicable
- Check-in
- Check-out
- Adults
- Children
- Number of nights
- Booking status
- Payment status

Quick links:

- Booking
- Payment
- Invoice
- Amenities
- Wi-Fi
- Food
- Requests
- Feedback

PAYMENT VIEW:

Show:

- Total amount
- Paid
- Balance due
- Payment status
- Payment history

Mock actions:

[Pay Now]

[Upload Payment Receipt]

UPLOAD RECEIPT:

Show:
- file picker UI
- uploaded filename
- image preview
- amount
- payment method
- transaction/UTR field
- submit button

No real upload occurs.

WIFI:

Display Wi-Fi in a visually polished hospitality card.

AMENITIES:

Show villa amenities in an attractive layout.

SPECIAL REQUESTS:

Guest can create a request.

Fields:
- Request type
- Notes

Request types:
- Housekeeping
- Extra towels
- Food
- Maintenance
- Transport
- Wi-Fi
- Room setup
- Other

Show previous requests.

Statuses:
- Pending
- Assigned
- In Progress
- Completed
- Rejected

FEEDBACK:

Fields:
- Rating
- Comments

Show previous submitted feedback.

INVOICE:

Create a clean printable-looking invoice.

--------------------------------------------------
MODULE 8 — FOOD / KITCHEN
--------------------------------------------------

FOOD MENU:

Categories can include:

- Breakfast
- South Indian
- Continental
- Lunch
- Dinner
- Snacks
- Beverages

Each item should have:
- Name
- Description
- Price
- Image
- Category
- Veg/non-veg
- Availability

GUEST ORDERING:

Guest can:

- Browse menu
- Filter category
- View item
- Add item
- Change quantity
- Remove item
- View cart
- Submit order

Show realistic mock prices and images.

FOOD ORDER STATUS:

Placed
↓
Confirmation Pending
↓
Confirmed
↓
Cooking
↓
Ready
↓
Served
↓
Billed

Alternative:
Cancelled

ADMIN FOOD DASHBOARD:

Use a Kanban-style board.

Columns:

Placed
Confirmation Pending
Confirmed
Cooking
Ready
Served
Billed

Each card should show:

- Order ID
- Guest
- Villa
- Room if applicable
- Items
- Quantity
- Total
- Order time

Actions:

- Call to Confirm
- Confirm
- Start Cooking
- Mark Ready
- Mark Served
- Bill
- Cancel

"Call to Confirm" is a mock UI action.

When food is billed, show it as part of the guest/booking financial summary.

--------------------------------------------------
MODULE 9 — GUEST REQUESTS / OPERATIONS
--------------------------------------------------

Create an ADMIN request-management page.

Show:

- Request ID
- Guest
- Villa
- Category
- Description
- Priority
- Status
- Assigned to
- Created time

Statuses:

- Pending
- Assigned
- In Progress
- Completed
- Rejected

Priority:

- Low
- Normal
- High
- Urgent

Possible assignment concepts:

- Housekeeping
- Kitchen
- Maintenance
- Manager

No real staff authentication is required in this phase.

--------------------------------------------------
MODULE 10 — FEEDBACK
--------------------------------------------------

Admin feedback page.

Show:

- Guest
- Villa
- Booking
- Rating
- Comment
- Date

Allow mock actions such as:

- View
- Reply
- Mark reviewed

--------------------------------------------------
16. INVOICING
==================================================

Every booking should have a mock invoice.

Invoice should support:

- Invoice number
- Guest
- Villa
- Room(s)
- Booking dates
- Nights
- Villa rate
- Food
- Add-ons
- Discount
- Tax
- Total
- Paid
- Balance

Actions:

- Print
- Download PDF UI placeholder
- Email UI placeholder

No real PDF generation or email delivery is required unless implemented entirely as a visual/mock interaction in this phase.

==================================================
17. PAYMENT MODEL
==================================================

Support mock payment methods:

- UPI
- Bank Transfer

Guest flow:

Booking
→ Payment instructions
→ Guest uploads receipt
→ Payment status becomes "Payment Uploaded"
→ Admin reviews
→ Approve / Reject
→ Booking status updates appropriately

Payment record should contain:

- Payment ID
- Booking ID
- Amount
- Method
- Transaction/UTR
- Receipt image
- Status
- Verified by
- Verified date
- Created date

Possible payment statuses:

- Pending
- Uploaded
- Approved
- Rejected
- Refunded

==================================================
18. PRICING / FINANCIAL DISPLAY
==================================================

Do not use one generic "Amount" field.

Show a clear financial breakdown:

Villa rate
× Nights

Weekend surcharge
Seasonal surcharge
Extra guest charge
Food
Add-ons
Discount
Tax

------------------

Grand Total
Amount Paid
Balance Due

Use realistic fixture data.

==================================================
19. BOOKING CONFLICT RULE
==================================================

This is a critical UI/business rule even though the phase is frontend-only.

Conceptually prevent overlapping inventory.

Conflict condition:

newCheckIn < existingCheckOut
AND
newCheckOut > existingCheckIn

Use mock data/state to demonstrate conflict handling.

Do not allow the UI to create obviously conflicting bookings when the conflict can be determined from fixture data.

==================================================
20. REQUEST / PAYMENT / BOOKING ACTIVITY TIMELINE
==================================================

Important record pages should show an activity timeline.

Example:

10:31 AM
Payment receipt uploaded

10:45 AM
Payment approved

10:46 AM
Booking confirmed

11:00 AM
Invoice generated

The timeline can be mock data.

==================================================
21. NOTIFICATION UI
==================================================

Do NOT implement real notifications in Phase 1.

But provide a visual notification area in the admin UI.

Example:

🔔

Payment uploaded
New food order
New guest request
Booking cancelled

Label it as mock/dev data where appropriate.

==================================================
22. MOCK DATA REQUIREMENTS
==================================================

Do NOT use lorem ipsum.

Create realistic relational fixture data.

Include at minimum:

3 villas:
- Villa Maaya
- Villa Praana
- Villa Nirvaana

Each:
- 4 rooms/bedrooms

Guests:
At least 5 realistic Indian guest names.

Use names such as:
- Pooja Bothra
- Prerna Lal Chugani
- Deepti Krishnan

or similar realistic names.

Bookings:
At least 8–12 bookings.

Data must include:
- all 3 villas
- multiple booking statuses
- multiple payment statuses
- website booking
- phone booking
- WhatsApp booking
- Goibibo booking
- at least one whole-villa example
- at least two room-split examples

Customers:
At least 5.

Food:
At least 10 menu items.

Food orders:
At least 3 orders in different states.

Guest requests:
At least 3.

Feedback:
At least 3.

Payments:
Multiple states including uploaded, approved and rejected.

Invoices:
Multiple realistic examples.

Mock data must be relational and internally consistent.

Example:

A booking references an actual customer.

A payment references an actual booking.

A food order references an actual booking/guest.

A request references an actual booking/guest.

An invoice references an actual booking.

==================================================
23. RESPONSIVE REQUIREMENTS
==================================================

ADMIN:

Desktop-first.

Must remain usable at:
- desktop
- tablet
- small laptop

Mobile should support essential urgent actions.

GUEST:

Mobile-first.

Optimize for:
- booking summary
- payment
- receipt upload
- food ordering
- requests
- feedback

Do not simply shrink desktop layouts.

Actually redesign layouts responsively where necessary.

==================================================
24. ACCESSIBILITY
==================================================

Use:

- semantic HTML
- accessible labels
- keyboard navigation
- visible focus states
- sufficient color contrast
- accessible form errors
- appropriate ARIA only where necessary

Do not rely only on color to communicate booking/payment state.

==================================================
25. ROUTING
==================================================

Use React Router.

Create clean role-aware routes.

Suggested routing structure:

/
/login

/design-system

/admin
/admin/dashboard
/admin/bookings
/admin/bookings/:id
/admin/bookings/new
/admin/payments
/admin/villas
/admin/villas/:id
/admin/customers
/admin/customers/:id
/admin/calendar
/admin/food
/admin/requests
/admin/feedback
/admin/invoices
/admin/settings

/guest
/guest/dashboard
/guest/booking
/guest/payment
/guest/invoice
/guest/amenities
/guest/food
/guest/requests
/guest/feedback

Keep routing independent from the future Supabase implementation.

Supabase should NOT require a framework switch later.

==================================================
26. PROJECT STRUCTURE
==================================================

Use a maintainable structure similar to:

src/
  components/
    ui/
    layout/
    common/
    admin/
    guest/
    booking/
    payment/
    food/
    requests/

  pages/
    auth/
    admin/
    guest/

  routes/

  hooks/

  services/
    mock/
    repositories/

  data/
    mocks/

  types/

  utils/

  config/

  styles/

Do not force this exact structure if a better equivalent is needed, but keep clear separation between:

- UI
- page-level composition
- data access
- domain types
- mock fixtures

==================================================
27. DATA ACCESS ARCHITECTURE
==================================================

Mock data must not be tightly coupled to visual components.

For example:

services/mock/bookingService.ts

could provide:

getBookings()
getBooking(id)
createBooking(data)
updateBooking(id, data)
getPaymentVerificationQueue()

The UI should call hooks/services.

Later:

Mock service
↓
Supabase service

The UI should remain mostly unchanged.

==================================================
28. FORM VALIDATION
==================================================

Even though this is a UI-only phase, forms should behave realistically.

Show:

- required fields
- invalid dates
- missing guest details
- invalid amount
- missing receipt
- empty request
- invalid feedback rating
- unavailable villa/room mock conflict

Provide:
- loading
- success
- error
states where appropriate.

==================================================
29. DESTRUCTIVE ACTIONS
==================================================

Actions such as:

- Cancel booking
- Reject payment
- Cancel food order
- Delete mock data where applicable

must use confirmation dialogs.

==================================================
30. PRD.md
==================================================

Create PRD.md at project root.

It must include:

1. Product overview
2. Problem statement
3. Target users
   - Admin / Owner
   - Guest
4. Goals
5. Non-goals
6. Current phase scope
7. User journeys
8. Modules
9. User stories
10. Success criteria
11. Business rules
12. Booking lifecycle
13. Whole-villa vs room-split rules
14. What's out of scope

Explicitly list out of scope:

- Real authentication
- Real authorization
- Real database
- Real Supabase
- Real payment gateway
- Real storage
- Real email
- Real SMS
- Real WhatsApp
- Real notifications

==================================================
31. TRD.md
==================================================

Create TRD.md at project root.

Include:

1. Tech stack
2. Architecture
3. Project structure
4. Routing map
5. Component inventory
6. Mock-data architecture
7. Data-access abstraction
8. Named hooks/functions
9. State-management approach
10. Design-system approach
11. Responsive strategy
12. Accessibility strategy
13. Plugins/skills used and why
14. Known limitations of UI-only phase

PHASE 2 section must explain:

- Which mock functions become Supabase queries
- Where Supabase Auth is introduced
- Where RLS policies matter
- How storage handles payment receipts
- How real payment integration replaces mock payment state
- How real email/WhatsApp/notifications are introduced
- How real booking conflict validation becomes server-side
- How React Router remains in place
- No framework migration to Next.js is necessary

==================================================
32. CURRENT WEBSITE BOUNDARY
==================================================

The existing public website is a separate product.

Do NOT recreate:

- marketing homepage
- public gallery
- journal
- informational pages
- public navigation

The CRM is responsible for:

- booking operations
- payment verification
- guest information
- guest stay experience
- villa/room operations
- food ordering
- requests
- feedback
- invoices
- operational dashboard

The public website and CRM may eventually share backend data, but they remain separate frontend applications.

==================================================
33. IMPLEMENTATION ORDER
==================================================

Follow this order strictly:

1. Project scaffold
2. Design system route
3. Mock login
4. Admin shell/layout
5. Admin dashboard
6. Booking & payment module
7. Villa & room management
8. Customer profiles
9. Master calendar
10. Guest portal
11. Food dashboard
12. Guest requests
13. Feedback
14. Invoice views
15. Responsive refinement
16. Accessibility refinement
17. Fixture/data consistency review
18. UI critique pass
19. Documentation finalization

Do NOT build all modules as shallow placeholders first.

Build one module properly before moving to the next.

==================================================
34. DEVELOPMENT QUALITY RULES
==================================================

Do not:

- use lorem ipsum
- leave major screens as empty placeholders
- duplicate huge JSX blocks
- hardcode repeated data inside components
- scatter color hex codes through components
- create unnecessary custom UI primitives
- create fake backend API calls
- add unnecessary dependencies
- use generic SaaS blue/purple styling
- introduce Next.js
- introduce Supabase in this phase

Do:

- use reusable components
- use typed fixture data
- use domain types
- use realistic hospitality content
- use consistent spacing
- use responsive layouts
- use loading/error/empty/success states
- use accessible forms
- preserve separation between UI and data access

==================================================
35. FINAL ACCEPTANCE CRITERIA
==================================================

The phase is complete only when:

1. The app runs as a Vite React TypeScript SPA.
2. Mock login works for Admin and Guest.
3. Admin can navigate all required modules.
4. Guest can navigate the guest portal.
5. All screens use realistic mock data.
6. Design system route exists and is complete.
7. Booking states are represented correctly.
8. Whole-villa and split-room modes are visually represented.
9. Payment verification workflow is demonstrated.
10. Guest receipt-upload UI exists.
11. Invoice UI exists.
12. Calendar demonstrates villa/room occupancy.
13. Food ordering works through local mock state.
14. Kitchen Kanban reflects food order state changes.
15. Guest requests work through mock state.
16. Feedback works through mock state.
17. Admin dashboard provides a useful daily overview.
18. Responsive behavior is implemented.
19. Accessibility basics are implemented.
20. PRD.md exists.
21. TRD.md exists.
22. Mock data is isolated from components.
23. The code structure is ready for a future Supabase swap.
24. No real backend/auth/database/payment integration has been introduced.

==================================================
36. IMPORTANT DECISION-MAKING RULE
==================================================

Before making structural decisions that are difficult to reverse:

- routing architecture
- major folder conventions
- domain/data architecture
- whole-villa vs room inventory behavior

ASK FOR CONFIRMATION.

For smaller UI decisions, use sensible defaults and continue.

Do not repeatedly ask for approval on minor styling or component decisions.

==================================================
37. FIRST TASK
==================================================

Do NOT immediately build the CRM dashboard.

First:

1. Scaffold the application.
2. Set up current Vite + React + TypeScript + Tailwind + shadcn/ui.
3. Create the design tokens.
4. Create /design-system.
5. Create PRD.md.
6. Create TRD.md.
7. Create the initial mock-data/domain-type architecture.
8. Create the mock login.
9. Stop at the design-system/mock-login stage and show the result for review before proceeding to the first full business module.

The design system must be polished enough that the rest of the application can be built consistently from it.