/** Domain types for the Homes of Sanctuary CRM.
 *  These mirror the shape the Supabase tables will take in Phase 2, so the
 *  UI never has to change when the mock services are swapped for queries. */

export type ID = string;
/** ISO date, `YYYY-MM-DD`. */
export type ISODate = string;
/** ISO timestamp. */
export type ISODateTime = string;

/* ---------------------------------------------------------------- inventory */

export type VillaMode = "whole" | "split";
export type VillaStatus = "active" | "maintenance" | "inactive";
export type RoomStatus = "available" | "occupied" | "blocked" | "cleaning";

export interface Room {
  id: ID;
  villaId: ID;
  name: string;
  capacity: number;
  status: RoomStatus;
  baseRate: number;
}

export interface Villa {
  id: ID;
  name: string;
  slug: string;
  description: string;
  image: string;
  gallery: string[];
  bedrooms: number;
  capacity: number;
  mode: VillaMode;
  status: VillaStatus;
  baseRate: number;
  weekendRate: number;
  seasonalRate: number;
  checkInTime: string;
  checkOutTime: string;
  amenities: string[];
  wifiNetwork: string;
  wifiPassword: string;
  rooms: Room[];
}

/* ---------------------------------------------------------------- customers */

export type GuestType = "new" | "returning" | "vip" | "corporate";

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string;
  city: string;
  guestType: GuestType;
  preferences: string[];
  notes?: string;
  createdAt: ISODateTime;
}

/* ----------------------------------------------------------------- bookings */

export type BookingStatus =
  | "inquiry"
  | "pending_payment"
  | "payment_uploaded"
  | "payment_approved"
  | "confirmed"
  | "checked_in"
  | "in_house"
  | "checked_out"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no_show";

export type PaymentStatus =
  | "pending"
  | "uploaded"
  | "approved"
  | "rejected"
  | "refunded"
  | "partial"
  | "paid";

export type BookingSource =
  | "website"
  | "phone"
  | "whatsapp"
  | "goibibo"
  | "walk_in"
  | "referral"
  | "other";

/** Every money line a booking can carry. Never collapse this into one
 *  "amount" field — the breakdown is shown across admin and guest views. */
export interface BookingCharges {
  nightlyRate: number;
  nights: number;
  weekendSurcharge: number;
  seasonalSurcharge: number;
  extraGuestCharge: number;
  food: number;
  addOns: number;
  discount: number;
  taxRate: number;
}

export interface Booking {
  id: ID;
  reference: string;
  customerId: ID;
  villaId: ID;
  /** Empty for a whole-villa booking; one or more room ids in split mode. */
  roomIds: ID[];
  bookingMode: VillaMode;
  checkIn: ISODate;
  checkOut: ISODate;
  adults: number;
  children: number;
  source: BookingSource;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  charges: BookingCharges;
  amountPaid: number;
  specialRequests?: string;
  internalNotes?: string;
  createdAt: ISODateTime;
}

/* ----------------------------------------------------------------- payments */

export type PaymentMethod = "upi" | "bank_transfer" | "card" | "cash";

export type PaymentRejectionReason =
  | "wrong_amount"
  | "unreadable_receipt"
  | "duplicate_receipt"
  | "wrong_bank_account"
  | "invalid_transaction"
  | "other";

export interface Payment {
  id: ID;
  bookingId: ID;
  amount: number;
  method: PaymentMethod;
  reference: string;
  receiptImage?: string;
  status: Exclude<PaymentStatus, "partial" | "paid">;
  rejectionReason?: PaymentRejectionReason;
  rejectionNote?: string;
  verifiedBy?: string;
  verifiedAt?: ISODateTime;
  createdAt: ISODateTime;
}

/* ----------------------------------------------------------------- invoices */

export interface InvoiceLine {
  label: string;
  detail?: string;
  amount: number;
}

export interface Invoice {
  id: ID;
  number: string;
  bookingId: ID;
  issuedAt: ISODate;
  lines: InvoiceLine[];
  taxRate: number;
  status: "draft" | "issued" | "paid" | "void";
}

/* --------------------------------------------------------------------- food */

export type MenuCategory =
  | "breakfast"
  | "south_indian"
  | "continental"
  | "lunch"
  | "dinner"
  | "snacks"
  | "beverages";

export interface MenuItem {
  id: ID;
  name: string;
  description: string;
  price: number;
  image: string;
  category: MenuCategory;
  isVeg: boolean;
  available: boolean;
}

export type FoodOrderStatus =
  | "placed"
  | "confirmation_pending"
  | "confirmed"
  | "cooking"
  | "ready"
  | "served"
  | "billed"
  | "cancelled";

export interface FoodOrderLine {
  menuItemId: ID;
  name: string;
  price: number;
  quantity: number;
}

export interface FoodOrder {
  id: ID;
  reference: string;
  bookingId: ID;
  customerId: ID;
  villaId: ID;
  roomId?: ID;
  lines: FoodOrderLine[];
  status: FoodOrderStatus;
  notes?: string;
  placedAt: ISODateTime;
}

/* ----------------------------------------------------------------- requests */

export type RequestCategory =
  | "housekeeping"
  | "extra_towels"
  | "food"
  | "maintenance"
  | "transport"
  | "wifi"
  | "room_setup"
  | "other";

export type RequestStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "rejected";

export type RequestPriority = "low" | "normal" | "high" | "urgent";
export type Team = "housekeeping" | "kitchen" | "maintenance" | "manager";

export interface GuestRequest {
  id: ID;
  reference: string;
  bookingId: ID;
  customerId: ID;
  villaId: ID;
  category: RequestCategory;
  description: string;
  priority: RequestPriority;
  status: RequestStatus;
  assignedTo?: Team;
  createdAt: ISODateTime;
}

/* ----------------------------------------------------------------- feedback */

export interface Feedback {
  id: ID;
  bookingId: ID;
  customerId: ID;
  villaId: ID;
  rating: number;
  comment: string;
  reviewed: boolean;
  reply?: string;
  createdAt: ISODateTime;
}

/* ----------------------------------------------------------------- activity */

export type ActivityKind =
  | "booking"
  | "payment"
  | "food"
  | "request"
  | "feedback"
  | "note"
  | "invoice";

export interface ActivityEvent {
  id: ID;
  entityId: ID;
  kind: ActivityKind;
  title: string;
  detail?: string;
  actor: string;
  at: ISODateTime;
}

/* -------------------------------------------------------------------- misc */

export type Role = "admin" | "guest";

export interface MockSession {
  role: Role;
  /** Set for the guest role — the fixture customer they are signed in as. */
  customerId?: ID;
  name: string;
}

export interface AppNotification {
  id: ID;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: ISODateTime;
  read: boolean;
}
