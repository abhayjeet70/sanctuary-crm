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

/** The photo IDs an Indian property is given at check-in. */
export type GovtIdType = "aadhaar" | "passport" | "driving_licence" | "voter_id" | "pan" | "other";

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string;
  city: string;
  /** Decides CGST + SGST against IGST on the invoice. */
  state?: string;
  guestType: GuestType;
  /** Photo ID taken at check-in. `idImagePath` is a path in the private
   *  `guest-ids` bucket, never a URL — it needs signing to be shown. */
  idType?: GovtIdType;
  idNumber?: string;
  idImagePath?: string;
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
  /** Agreed arrival time, `HH:MM`. Undefined means the villa's standard time —
   *  which is different from "nobody asked", and is why it is not defaulted. */
  checkInTime?: string;
  /** Agreed departure time, `HH:MM`. Undefined means the villa's standard. */
  checkOutTime?: string;
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

/* ---------------------------------------------------------------- waitlist */

export type WaitlistStatus = "waiting" | "offered" | "converted" | "expired" | "cancelled";

/**
 * Someone who wanted dates that were already sold.
 *
 * There is no `position` field on purpose. Position is `created_at` order,
 * derived on read — a stored number has to be rewritten for every row behind
 * one that leaves, and a renumbering that half-runs is a queue nobody trusts.
 */
export interface WaitlistEntry {
  id: ID;
  customerId: ID;
  /** Undefined means any villa — they want the dates more than the house. */
  villaId?: ID;
  checkIn: ISODate;
  checkOut: ISODate;
  adults: number;
  children: number;
  source: BookingSource;
  note: string;
  status: WaitlistStatus;
  /** When the desk offered them the freed dates. */
  offeredAt?: ISODateTime;
  /** The stay it became, once it became one. */
  bookingId?: ID;
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
  /** Null means the dish is served at every villa. */
  villaId?: ID;
  sortOrder?: number;
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
  departmentId?: ID;
  assignedTo?: Team;
  /** The person on the hook, where the department is only the team. */
  assignedUser?: ID;
  acknowledgedAt?: ISODateTime;
  resolvedAt?: ISODateTime;
  /** What was actually done — sent to the guest when it is closed. */
  resolutionNote?: string;
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

/** `manager` runs the property; `admin` is the owner and also holds the
 *  configuration. RLS enforces the difference — see is_owner(). */
export type Role = "admin" | "manager" | "staff" | "guest";

export interface MockSession {
  role: Role;
  /** Set for the guest role — the customer record they are signed in as. */
  customerId?: ID;
  /** Set for staff — which queue they see, and what they may do. */
  departmentId?: ID;
  permissions?: PermissionKey[];
  /** Legacy, from before departments were rows. */
  team?: Team;
  name: string;
  /** The sign-in address, used to re-authenticate before a password change. */
  email?: string;
}

/** Everything about the property that used to be hardcoded in the UI. */
export interface PropertySettings {
  legalName: string;
  tradingName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  contactEmail: string;
  contactPhone: string;
  gstin: string;
  pan: string;

  upiId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  paymentNote: string;

  invoicePrefix: string;
  invoiceFooter: string;
  invoiceTerms: string;
  showGstinOnInvoice: boolean;

  /** GST state code of the place of supply. 29 is Karnataka. */
  stateCode: string;
  /** SAC for the service billed. 996311 is lodging. */
  hsnCode: string;
  invoiceDeclaration: string;
  signatoryName: string;
}

/* ----------------------------------------------------------- departments */

/** What a department may do. Presence in `permissions` grants it. */
export type PermissionKey =
  | "requests.work"
  | "requests.all"
  | "kitchen.work"
  | "bookings.view"
  | "guests.view"
  | "frontdesk.view"
  | "waitlist.manage";

export interface Department {
  id: ID;
  name: string;
  slug: string;
  description: string;
  /** Job titles this department offers, suggested on the employee form. */
  designations: string[];
  sortOrder: number;
  active: boolean;
  permissions: PermissionKey[];
}

/* ---------------------------------------------------------------- people */

export type EmploymentType = "full_time" | "part_time" | "contract" | "seasonal";
export type EmployeeStatus = "active" | "on_leave" | "left";

/** Someone the property employs — with or without a login. */
export interface Employee {
  id: ID;
  employeeCode: string;
  fullName: string;
  /** The job title as the property prints it: "Sous chef", "Front desk". */
  designation: string;
  /** Decides which queue they see once they have a login. */
  departmentId?: ID;
  /** Legacy, from before departments were rows. Not read any more. */
  team?: Team;
  phone: string;
  email: string;
  dateOfJoining?: ISODate;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  idDocument: string;
  notes: string;
  photoUrl?: string;
  /** Their login, when they have one. */
  profileId?: ID;
  createdAt: ISODateTime;
}

/** Kept apart from Employee so RLS can keep it to the owner. */
export interface EmployeePay {
  employeeId: ID;
  monthlySalary: number;
  effectiveFrom: ISODate;
  note: string;
}

/** A named tax the property charges. See services/domain.ts for the maths. */
export interface Tax {
  id: ID;
  name: string;
  /** A fraction: 0.18 is 18%. */
  rate: number;
  kind: "gst" | "levy";
  active: boolean;
  sortOrder: number;
}

export interface AppNotification {
  id: ID;
  /** Booking, order or request this is about, so the tray can link to it. */
  entityId?: ID;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: ISODateTime;
  read: boolean;
}
