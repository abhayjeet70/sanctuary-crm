/**
 * Row -> domain mappers.
 *
 * Postgres is snake_case, the domain types are camelCase, and the booking
 * charge columns are flat where `Booking.charges` is nested. Every difference
 * is absorbed here so no page component ever sees a database shape.
 */
import type {
  ActivityEvent,
  AppNotification,
  Booking,
  Customer,
  Feedback,
  FoodOrder,
  GuestRequest,
  Invoice,
  MenuItem,
  Payment,
  PropertySettings,
  Department,
  Employee,
  EmployeePay,
  Tax,
  Room,
  Villa,
  WaitlistEntry,
} from "@/types";

type Row = Record<string, never>;
const r = (row: unknown) => row as Record<string, never>;

export const toRoom = (row: unknown): Room => {
  const x = r(row);
  return {
    id: x.id,
    villaId: x.villa_id,
    name: x.name,
    capacity: x.capacity,
    status: x.status,
    baseRate: x.base_rate,
  };
};

export const toVilla = (row: unknown): Villa => {
  const x = r(row);
  return {
    id: x.id,
    name: x.name,
    slug: x.slug,
    description: x.description,
    image: x.image ?? "",
    gallery: x.gallery ?? [],
    bedrooms: x.bedrooms,
    capacity: x.capacity,
    mode: x.mode,
    status: x.status,
    baseRate: x.base_rate,
    weekendRate: x.weekend_rate,
    seasonalRate: x.seasonal_rate,
    // Postgres `time` comes back as HH:MM:SS; the UI shows HH:MM.
    checkInTime: String(x.check_in_time ?? "14:00:00").slice(0, 5),
    checkOutTime: String(x.check_out_time ?? "11:00:00").slice(0, 5),
    amenities: x.amenities ?? [],
    wifiNetwork: x.wifi_network,
    wifiPassword: x.wifi_password,
    rooms: ((x.rooms ?? []) as unknown[])
      .map(toRoom)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
};

export const toCustomer = (row: unknown): Customer => {
  const x = r(row);
  return {
    id: x.id,
    name: x.name,
    phone: x.phone,
    email: x.email,
    city: x.city,
    state: x.state || undefined,
    guestType: x.guest_type,
    idType: x.id_type || undefined,
    idNumber: x.id_number || undefined,
    idImagePath: x.id_image_path || undefined,
    preferences: x.preferences ?? [],
    notes: x.notes ?? undefined,
    createdAt: x.created_at,
  };
};

export const toBooking = (row: unknown): Booking => {
  const x = r(row);
  return {
    id: x.id,
    reference: x.reference,
    customerId: x.customer_id,
    villaId: x.villa_id,
    // booking_rooms holds every bedroom for a whole-villa stay; the UI only
    // wants an explicit room list when the villa is sold room by room.
    roomIds:
      x.booking_mode === "whole"
        ? []
        : ((x.booking_rooms ?? []) as { room_id: string }[]).map((br) => br.room_id),
    bookingMode: x.booking_mode,
    checkIn: x.check_in,
    checkOut: x.check_out,
    // Postgres hands back `HH:MM:SS`; the form and every label want `HH:MM`.
    checkInTime: x.check_in_time ? String(x.check_in_time).slice(0, 5) : undefined,
    checkOutTime: x.check_out_time ? String(x.check_out_time).slice(0, 5) : undefined,
    adults: x.adults,
    children: x.children,
    source: x.source,
    status: x.status,
    paymentStatus: x.payment_status,
    charges: {
      nightlyRate: x.nightly_rate,
      nights: x.nights,
      weekendSurcharge: x.weekend_surcharge,
      seasonalSurcharge: x.seasonal_surcharge,
      extraGuestCharge: x.extra_guest_charge,
      food: x.food,
      addOns: x.add_ons,
      discount: x.discount,
      taxRate: Number(x.tax_rate),
    },
    amountPaid: x.amount_paid,
    specialRequests: x.special_requests ?? undefined,
    internalNotes: x.internal_notes ?? undefined,
    createdAt: x.created_at,
  };
};

export const toPayment = (row: unknown): Payment => {
  const x = r(row);
  return {
    id: x.id,
    bookingId: x.booking_id,
    amount: x.amount,
    method: x.method,
    reference: x.reference,
    // A storage path, not a URL — resolved to a signed URL on demand.
    receiptImage: x.receipt_path ?? undefined,
    status: x.status,
    rejectionReason: x.rejection_reason ?? undefined,
    rejectionNote: x.rejection_note ?? undefined,
    verifiedBy: x.verified_by ?? undefined,
    verifiedAt: x.verified_at ?? undefined,
    createdAt: x.created_at,
  };
};

export const toInvoice = (row: unknown): Invoice => {
  const x = r(row);
  return {
    id: x.id,
    number: x.number,
    bookingId: x.booking_id,
    issuedAt: x.issued_at,
    // Invoice lines are derived from the booking's charge breakdown rather than
    // stored twice, so the invoice can never disagree with the booking.
    lines: [],
    taxRate: Number(x.tax_rate),
    status: x.status,
  };
};

export const toMenuItem = (row: unknown): MenuItem => {
  const x = r(row);
  return {
    id: x.id,
    villaId: x.villa_id ?? undefined,
    sortOrder: x.sort_order ?? 0,
    name: x.name,
    description: x.description,
    price: x.price,
    image: x.image ?? "",
    category: x.category,
    isVeg: x.is_veg,
    available: x.available,
  };
};

export const toFoodOrder = (row: unknown): FoodOrder => {
  const x = r(row);
  return {
    id: x.id,
    reference: x.reference,
    bookingId: x.booking_id,
    customerId: x.customer_id,
    villaId: x.villa_id,
    roomId: x.room_id ?? undefined,
    lines: ((x.food_order_lines ?? []) as unknown[]).map((line) => {
      const l = r(line);
      return {
        menuItemId: l.menu_item_id,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
      };
    }),
    status: x.status,
    notes: x.notes ?? undefined,
    placedAt: x.placed_at,
  };
};

export const toGuestRequest = (row: unknown): GuestRequest => {
  const x = r(row);
  return {
    id: x.id,
    reference: x.reference,
    bookingId: x.booking_id,
    customerId: x.customer_id,
    villaId: x.villa_id,
    category: x.category,
    description: x.description,
    priority: x.priority,
    status: x.status,
    departmentId: x.department_id ?? undefined,
    assignedTo: x.assigned_to ?? undefined,
    assignedUser: x.assigned_user ?? undefined,
    acknowledgedAt: x.acknowledged_at ?? undefined,
    resolvedAt: x.resolved_at ?? undefined,
    resolutionNote: x.resolution_note ?? undefined,
    createdAt: x.created_at,
  };
};

export const toFeedback = (row: unknown): Feedback => {
  const x = r(row);
  return {
    id: x.id,
    bookingId: x.booking_id,
    customerId: x.customer_id,
    villaId: x.villa_id,
    rating: x.rating,
    comment: x.comment,
    reviewed: x.reviewed,
    reply: x.reply ?? undefined,
    createdAt: x.created_at,
  };
};

export const toActivityEvent = (row: unknown): ActivityEvent => {
  const x = r(row);
  return {
    id: x.id,
    entityId: x.entity_id,
    kind: x.kind,
    title: x.title,
    detail: x.detail ?? undefined,
    actor: x.actor,
    at: x.at,
  };
};

export const toNotification = (row: unknown): AppNotification => {
  const x = r(row);
  return {
    id: x.id,
    entityId: x.entity_id ?? undefined,
    kind: x.kind,
    title: x.title,
    detail: x.detail,
    at: x.at,
    read: x.read,
  };
};

/**
 * Fold today's derived occupancy onto each villa's rooms.
 *
 * `rooms.status` is only the operational override a person sets (blocked,
 * cleaning). Whether a guest is actually in the room comes from
 * `room_availability`, which computes it from live holds — so a check-out
 * frees the room without anyone remembering to update a column.
 */
export function withDerivedRoomStatus(villas: Villa[], availability: unknown[]): Villa[] {
  const byRoom = new Map<string, Record<string, never>>();
  for (const row of availability) {
    const x = r(row);
    byRoom.set(x.room_id, x);
  }

  return villas.map((villa) => ({
    ...villa,
    rooms: villa.rooms.map((room) => {
      const derived = byRoom.get(room.id);
      return derived ? { ...room, status: derived.effective_status } : room;
    }),
  }));
}

export const toSettings = (row: unknown): PropertySettings => {
  const x = r(row);
  return {
    legalName: x.legal_name,
    tradingName: x.trading_name,
    addressLine1: x.address_line1,
    addressLine2: x.address_line2,
    city: x.city,
    state: x.state,
    postcode: x.postcode,
    country: x.country,
    contactEmail: x.contact_email,
    contactPhone: x.contact_phone,
    gstin: x.gstin,
    pan: x.pan,
    upiId: x.upi_id,
    bankName: x.bank_name,
    accountName: x.account_name,
    accountNumber: x.account_number,
    ifsc: x.ifsc,
    paymentNote: x.payment_note,
    invoicePrefix: x.invoice_prefix,
    invoiceFooter: x.invoice_footer,
    invoiceTerms: x.invoice_terms,
    showGstinOnInvoice: x.show_gstin_on_invoice,
    stateCode: x.state_code ?? "29",
    hsnCode: x.hsn_code ?? "996311",
    invoiceDeclaration: x.invoice_declaration ?? "",
    signatoryName: x.signatory_name ?? "",
  };
};

/** Column names for a settings patch, so the UI can stay in camelCase. */
export const settingsColumns: Record<keyof PropertySettings, string> = {
  legalName: "legal_name",
  tradingName: "trading_name",
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  city: "city",
  state: "state",
  postcode: "postcode",
  country: "country",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  gstin: "gstin",
  pan: "pan",
  upiId: "upi_id",
  bankName: "bank_name",
  accountName: "account_name",
  accountNumber: "account_number",
  ifsc: "ifsc",
  paymentNote: "payment_note",
  invoicePrefix: "invoice_prefix",
  invoiceFooter: "invoice_footer",
  invoiceTerms: "invoice_terms",
  showGstinOnInvoice: "show_gstin_on_invoice",
  stateCode: "state_code",
  hsnCode: "hsn_code",
  invoiceDeclaration: "invoice_declaration",
  signatoryName: "signatory_name",
};

export const toDepartment = (row: unknown): Department => {
  const x = r(row);
  return {
    id: x.id,
    name: x.name,
    slug: x.slug,
    description: x.description ?? "",
    designations: x.designations ?? [],
    sortOrder: x.sort_order ?? 0,
    active: x.active,
    // Filled in by the provider, which reads the permission rows separately.
    permissions: [],
  };
};

export const toEmployee = (row: unknown): Employee => {
  const x = r(row);
  return {
    id: x.id,
    employeeCode: x.employee_code,
    fullName: x.full_name,
    designation: x.designation ?? "",
    departmentId: x.department_id ?? undefined,
    team: x.team ?? undefined,
    phone: x.phone ?? "",
    email: x.email ?? "",
    dateOfJoining: x.date_of_joining ?? undefined,
    employmentType: x.employment_type,
    status: x.status,
    address: x.address ?? "",
    emergencyName: x.emergency_name ?? "",
    emergencyPhone: x.emergency_phone ?? "",
    idDocument: x.id_document ?? "",
    notes: x.notes ?? "",
    photoUrl: x.photo_url ?? undefined,
    profileId: x.profile_id ?? undefined,
    createdAt: x.created_at,
  };
};

export const toEmployeePay = (row: unknown): EmployeePay => {
  const x = r(row);
  return {
    employeeId: x.employee_id,
    monthlySalary: x.monthly_salary ?? 0,
    effectiveFrom: x.effective_from,
    note: x.note ?? "",
  };
};

export const toWaitlistEntry = (row: unknown): WaitlistEntry => {
  const x = r(row);
  return {
    id: x.id,
    customerId: x.customer_id,
    villaId: x.villa_id ?? undefined,
    checkIn: x.check_in,
    checkOut: x.check_out,
    adults: x.adults,
    children: x.children,
    source: x.source,
    note: x.note ?? "",
    status: x.status,
    offeredAt: x.offered_at ?? undefined,
    bookingId: x.booking_id ?? undefined,
    createdAt: x.created_at,
  };
};

export const toTax = (row: unknown): Tax => {
  const x = r(row);
  return {
    id: x.id,
    name: x.name,
    rate: Number(x.rate),
    kind: x.kind,
    active: x.active,
    sortOrder: x.sort_order ?? 0,
  };
};

export type { Row };
