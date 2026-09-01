import type {
  ActivityEvent,
  AppNotification,
  Feedback,
  FoodOrder,
  GuestRequest,
  Invoice,
} from "@/types";

/* ------------------------------------------------------------- food orders */

export const foodOrders: FoodOrder[] = [
  {
    id: "f-3001",
    reference: "KIT-3001",
    bookingId: "b-1002",
    customerId: "c-prerna",
    villaId: "v-nirvaana",
    lines: [
      { menuItemId: "m-110", name: "Sanctuary Vegetarian Thali", price: 540, quantity: 6 },
      { menuItemId: "m-103", name: "Nandi Hills Filter Coffee", price: 140, quantity: 4 },
    ],
    status: "cooking",
    notes: "Two thalis to be prepared Jain — no onion, no garlic, no root vegetables.",
    placedAt: "2026-09-01T12:40:00+05:30",
  },
  {
    id: "f-3002",
    reference: "KIT-3002",
    bookingId: "b-1003",
    customerId: "c-deepti",
    villaId: "v-praana",
    roomId: "r-praana-a1",
    lines: [
      { menuItemId: "m-101", name: "Set Dosa with Vegetable Kurma", price: 320, quantity: 2 },
      { menuItemId: "m-103", name: "Nandi Hills Filter Coffee", price: 140, quantity: 2 },
    ],
    status: "served",
    placedAt: "2026-09-01T07:15:00+05:30",
  },
  {
    id: "f-3003",
    reference: "KIT-3003",
    bookingId: "b-1012",
    customerId: "c-farhan",
    villaId: "v-maaya",
    lines: [
      { menuItemId: "m-112", name: "Masala Peanuts and Papad Basket", price: 240, quantity: 3 },
      { menuItemId: "m-115", name: "Tender Coconut Cooler", price: 200, quantity: 8 },
    ],
    status: "confirmation_pending",
    notes: "Sundowner service on the deck at 6 pm — call to confirm headcount.",
    placedAt: "2026-09-01T15:02:00+05:30",
  },
  {
    id: "f-3004",
    reference: "KIT-3004",
    bookingId: "b-1002",
    customerId: "c-prerna",
    villaId: "v-nirvaana",
    lines: [
      { menuItemId: "m-113", name: "Mangalore Bajji with Chutney", price: 260, quantity: 4 },
      { menuItemId: "m-114", name: "Estate Nilgiri Tea", price: 180, quantity: 3 },
    ],
    status: "placed",
    placedAt: "2026-09-01T16:20:00+05:30",
  },
  {
    id: "f-3005",
    reference: "KIT-3005",
    bookingId: "b-1003",
    customerId: "c-deepti",
    villaId: "v-praana",
    roomId: "r-praana-a1",
    lines: [{ menuItemId: "m-106", name: "Charred Corn and Avocado Salad", price: 420, quantity: 2 }],
    status: "ready",
    placedAt: "2026-09-01T13:05:00+05:30",
  },
  {
    id: "f-3006",
    reference: "KIT-3006",
    bookingId: "b-1002",
    customerId: "c-prerna",
    villaId: "v-nirvaana",
    lines: [
      { menuItemId: "m-107", name: "Wood-Fired Margherita", price: 560, quantity: 3 },
      { menuItemId: "m-115", name: "Tender Coconut Cooler", price: 200, quantity: 5 },
    ],
    status: "billed",
    placedAt: "2026-08-31T20:10:00+05:30",
  },
  {
    id: "f-3007",
    reference: "KIT-3007",
    bookingId: "b-1012",
    customerId: "c-farhan",
    villaId: "v-maaya",
    lines: [{ menuItemId: "m-109", name: "Malnad Chicken Curry Thali", price: 680, quantity: 8 }],
    status: "confirmed",
    notes: "Halal sourcing confirmed with the supplier. Serve at 8:30 pm in the dining pavilion.",
    placedAt: "2026-09-01T14:48:00+05:30",
  },
];

/* ---------------------------------------------------------- guest requests */

export const guestRequests: GuestRequest[] = [
  {
    id: "q-4001",
    reference: "REQ-4001",
    bookingId: "b-1002",
    customerId: "c-prerna",
    villaId: "v-nirvaana",
    category: "extra_towels",
    description: "Four extra bath towels and two pool towels for the west wing bedrooms.",
    priority: "normal",
    status: "completed",
    assignedTo: "housekeeping",
    createdAt: "2026-09-01T09:30:00+05:30",
  },
  {
    id: "q-4002",
    reference: "REQ-4002",
    bookingId: "b-1003",
    customerId: "c-deepti",
    villaId: "v-praana",
    category: "maintenance",
    description:
      "The hot water in Room A-1 runs cold after a few minutes. Could someone take a look before the evening?",
    priority: "high",
    status: "in_progress",
    assignedTo: "maintenance",
    createdAt: "2026-09-01T11:05:00+05:30",
  },
  {
    id: "q-4003",
    reference: "REQ-4003",
    bookingId: "b-1012",
    customerId: "c-farhan",
    villaId: "v-maaya",
    category: "room_setup",
    description:
      "Living pavilion needs a U-shaped table setup for ten, a whiteboard, and an extension board near the projector.",
    priority: "urgent",
    status: "assigned",
    assignedTo: "manager",
    createdAt: "2026-09-01T08:12:00+05:30",
  },
  {
    id: "q-4004",
    reference: "REQ-4004",
    bookingId: "b-1002",
    customerId: "c-prerna",
    villaId: "v-nirvaana",
    category: "transport",
    description: "Cab to Bengaluru airport on the 3rd, leaving at 5:30 am. Six passengers with luggage.",
    priority: "high",
    status: "pending",
    createdAt: "2026-09-01T17:24:00+05:30",
  },
  {
    id: "q-4005",
    reference: "REQ-4005",
    bookingId: "b-1003",
    customerId: "c-deepti",
    villaId: "v-praana",
    category: "wifi",
    description: "Wi-Fi drops in the reading room. Fine everywhere else.",
    priority: "low",
    status: "rejected",
    assignedTo: "maintenance",
    createdAt: "2026-08-31T18:40:00+05:30",
  },
];

/* ----------------------------------------------------------------- feedback */

export const feedback: Feedback[] = [
  {
    id: "fb-5001",
    bookingId: "b-1008",
    customerId: "c-deepti",
    villaId: "v-maaya",
    rating: 5,
    comment:
      "The verandah at Maaya is worth the drive on its own. Filter coffee arrived at 6:30 every morning without a reminder. We will be back in the winter.",
    reviewed: true,
    reply:
      "Thank you Deepti — the coffee will be waiting. We have noted the ground-floor room for your next stay.",
    createdAt: "2026-07-07T14:20:00+05:30",
  },
  {
    id: "fb-5002",
    bookingId: "b-1009",
    customerId: "c-prerna",
    villaId: "v-nirvaana",
    rating: 4,
    comment:
      "Beautiful house and the kitchen handled our Jain requirements carefully. The pool heating took a while to come on in the mornings.",
    reviewed: true,
    createdAt: "2026-06-15T11:05:00+05:30",
  },
  {
    id: "fb-5003",
    bookingId: "b-1004",
    customerId: "c-rahul",
    villaId: "v-praana",
    rating: 4,
    comment:
      "Booked through Goibibo and did not expect this level of quiet. Room C-1 is small but very well made. Breakfast was excellent.",
    reviewed: false,
    createdAt: "2026-09-01T11:40:00+05:30",
  },
  {
    id: "fb-5004",
    bookingId: "b-1003",
    customerId: "c-deepti",
    villaId: "v-praana",
    rating: 3,
    comment:
      "Lovely stay overall, but the hot water issue in A-1 took most of a day to resolve. Staff were apologetic and helpful throughout.",
    reviewed: false,
    createdAt: "2026-09-01T16:55:00+05:30",
  },
];

/* ----------------------------------------------------------------- invoices */

export const invoices: Invoice[] = [
  {
    id: "i-6001",
    number: "HOS/26-27/0041",
    bookingId: "b-1008",
    issuedAt: "2026-07-07",
    taxRate: 0.18,
    status: "paid",
    lines: [
      { label: "Villa Maaya — whole villa", detail: "₹32,000 × 3 nights", amount: 96000 },
      { label: "Weekend surcharge", detail: "Fri & Sat", amount: 12000 },
      { label: "Extra guest charge", detail: "1 guest above base occupancy", amount: 1500 },
      { label: "Food & beverage", detail: "In-villa dining", amount: 9800 },
      { label: "Add-ons", detail: "Airport transfer", amount: 2000 },
    ],
  },
  {
    id: "i-6002",
    number: "HOS/26-27/0033",
    bookingId: "b-1009",
    issuedAt: "2026-06-15",
    taxRate: 0.18,
    status: "paid",
    lines: [
      { label: "Villa Nirvaana — whole villa", detail: "₹36,000 × 3 nights", amount: 108000 },
      { label: "Weekend surcharge", detail: "Fri & Sat", amount: 12000 },
      { label: "Extra guest charge", detail: "5 guests above base occupancy", amount: 7500 },
      { label: "Food & beverage", detail: "In-villa dining", amount: 14200 },
      { label: "Add-ons", detail: "Anniversary setup", amount: 4000 },
      { label: "Returning guest discount", amount: -5000 },
    ],
  },
  {
    id: "i-6003",
    number: "HOS/26-27/0052",
    bookingId: "b-1002",
    issuedAt: "2026-09-01",
    taxRate: 0.18,
    status: "issued",
    lines: [
      { label: "Villa Nirvaana — whole villa", detail: "₹36,000 × 4 nights", amount: 144000 },
      { label: "Weekend surcharge", detail: "Fri & Sat", amount: 12000 },
      { label: "Extra guest charge", detail: "6 guests above base occupancy", amount: 9000 },
      { label: "Food & beverage", detail: "Running kitchen tab", amount: 18400 },
      { label: "Add-ons", detail: "Anniversary cake & decor", amount: 6000 },
      { label: "VIP discount", amount: -8000 },
    ],
  },
  {
    id: "i-6004",
    number: "HOS/26-27/0054",
    bookingId: "b-1012",
    issuedAt: "2026-09-01",
    taxRate: 0.18,
    status: "draft",
    lines: [
      { label: "Villa Maaya — whole villa", detail: "₹32,000 × 2 nights", amount: 64000 },
      { label: "Extra guest charge", detail: "4 guests above base occupancy", amount: 6000 },
      { label: "Add-ons", detail: "Conference setup", amount: 4500 },
      { label: "Corporate discount", amount: -3000 },
    ],
  },
];

/* ----------------------------------------------------- activity timelines */

export const activityEvents: ActivityEvent[] = [
  { id: "a-1", entityId: "b-1005", kind: "booking", title: "Booking created", detail: "Website enquiry converted to a held booking.", actor: "Website", at: "2026-08-28T13:47:00+05:30" },
  { id: "a-2", entityId: "b-1005", kind: "note", title: "Payment instructions sent", detail: "UPI and bank details shared over WhatsApp.", actor: "Reception desk", at: "2026-08-28T14:02:00+05:30" },
  { id: "a-3", entityId: "b-1005", kind: "payment", title: "Payment receipt uploaded", detail: "₹45,000 via UPI · ref 690431228805", actor: "Ankit Deshpande", at: "2026-08-31T22:41:00+05:30" },
  { id: "a-4", entityId: "b-1012", kind: "booking", title: "Booking created", detail: "Taken over the phone by the reception desk.", actor: "Reception desk", at: "2026-08-14T11:02:00+05:30" },
  { id: "a-5", entityId: "b-1012", kind: "payment", title: "Payment receipt uploaded", detail: "₹40,000 bank transfer · ref AXISN26081400627", actor: "Farhan Qureshi", at: "2026-08-14T11:31:00+05:30" },
  { id: "a-6", entityId: "b-1012", kind: "payment", title: "Payment approved", detail: "Verified against the Axis statement.", actor: "Anjali (Manager)", at: "2026-08-14T12:15:00+05:30" },
  { id: "a-7", entityId: "b-1012", kind: "booking", title: "Booking confirmed", detail: "Confirmation and directions sent to the guest.", actor: "System", at: "2026-08-14T12:16:00+05:30" },
  { id: "a-8", entityId: "b-1012", kind: "invoice", title: "Draft invoice generated", detail: "HOS/26-27/0054", actor: "System", at: "2026-09-01T09:00:00+05:30" },
  { id: "a-9", entityId: "b-1012", kind: "request", title: "Guest request raised", detail: "Room setup — conference layout for ten.", actor: "Farhan Qureshi", at: "2026-09-01T08:12:00+05:30" },
  { id: "a-10", entityId: "b-1002", kind: "booking", title: "Guest checked in", detail: "Villa Nirvaana · 12 guests", actor: "Reception desk", at: "2026-08-30T14:10:00+05:30" },
  { id: "a-11", entityId: "b-1002", kind: "food", title: "Kitchen order placed", detail: "KIT-3001 · 6 vegetarian thalis", actor: "Prerna Lal Chugani", at: "2026-09-01T12:40:00+05:30" },
  { id: "a-12", entityId: "b-1011", kind: "payment", title: "Payment rejected", detail: "Wrong amount — ₹12,000 received against ₹18,000 due.", actor: "Anjali (Manager)", at: "2026-08-13T10:20:00+05:30" },
  { id: "a-13", entityId: "b-1011", kind: "booking", title: "Marked as no-show", detail: "Guest did not arrive and stopped responding.", actor: "Anjali (Manager)", at: "2026-08-20T19:00:00+05:30" },
  { id: "a-14", entityId: "b-1010", kind: "booking", title: "Booking cancelled", detail: "Cancelled by the guest inside the free-cancellation window.", actor: "Reception desk", at: "2026-08-26T16:12:00+05:30" },
  { id: "a-15", entityId: "b-1010", kind: "payment", title: "Advance refunded", detail: "₹32,000 returned to the original UPI handle.", actor: "Anjali (Manager)", at: "2026-08-26T16:30:00+05:30" },
];

/* ------------------------------------------------------------ notifications */

export const notifications: AppNotification[] = [
  { id: "n-1", kind: "payment", title: "Payment uploaded", detail: "Deepti Krishnan · ₹75,000 for HOS-1013", at: "2026-08-31T21:35:00+05:30", read: false },
  { id: "n-2", kind: "food", title: "New kitchen order", detail: "KIT-3004 · Villa Nirvaana · 7 items", at: "2026-09-01T16:20:00+05:30", read: false },
  { id: "n-3", kind: "request", title: "New guest request", detail: "Transport · Villa Nirvaana · airport drop on the 3rd", at: "2026-09-01T17:24:00+05:30", read: false },
  { id: "n-4", kind: "feedback", title: "New feedback received", detail: "Deepti Krishnan rated her stay 3 out of 5", at: "2026-09-01T16:55:00+05:30", read: true },
  { id: "n-5", kind: "booking", title: "Booking cancelled", detail: "HOS-1010 · Rahul Sharma · Villa Maaya", at: "2026-08-26T16:12:00+05:30", read: true },
];
