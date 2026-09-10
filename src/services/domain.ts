import type { Booking, BookingCharges, BookingStatus } from "@/types";

/** Statuses that no longer hold inventory. Everything else blocks the villa
 *  or room it sits on. */
const RELEASED: BookingStatus[] = ["cancelled", "rejected", "no_show", "completed", "checked_out"];

export const holdsInventory = (booking: Booking) => !RELEASED.includes(booking.status);

export interface BookingTotals {
  roomCharge: number;
  surcharges: number;
  extras: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export function bookingTotals(charges: BookingCharges, amountPaid: number): BookingTotals {
  const roomCharge = charges.nightlyRate * charges.nights;
  const surcharges = charges.weekendSurcharge + charges.seasonalSurcharge + charges.extraGuestCharge;
  const extras = charges.food + charges.addOns;
  const subtotal = roomCharge + surcharges + extras - charges.discount;
  const tax = Math.round(subtotal * charges.taxRate);
  const total = subtotal + tax;
  return {
    roomCharge,
    surcharges,
    extras,
    discount: charges.discount,
    subtotal,
    tax,
    total,
    paid: amountPaid,
    balance: Math.max(0, total - amountPaid),
  };
}

/** Two half-open date ranges overlap when each starts before the other ends. */
export const datesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => aStart < bEnd && aEnd > bStart;

export interface ConflictQuery {
  villaId: string;
  /** Empty means a whole-villa hold, which collides with every room. */
  roomIds: string[];
  checkIn: string;
  checkOut: string;
  /** Skip this booking when re-checking an existing one during an edit. */
  ignoreBookingId?: string;
}

/**
 * Inventory conflicts across both operating modes.
 *
 * A whole-villa hold collides with any other hold on that villa. A room hold
 * collides with a whole-villa hold, or with another hold that shares a room.
 */
export function findConflicts(query: ConflictQuery, all: Booking[]): Booking[] {
  return all.filter((other) => {
    if (other.id === query.ignoreBookingId) return false;
    if (other.villaId !== query.villaId) return false;
    if (!holdsInventory(other)) return false;
    if (!datesOverlap(query.checkIn, query.checkOut, other.checkIn, other.checkOut)) return false;

    const queryIsWhole = query.roomIds.length === 0;
    const otherIsWhole = other.roomIds.length === 0;
    if (queryIsWhole || otherIsWhole) return true;
    return query.roomIds.some((id) => other.roomIds.includes(id));
  });
}

/** Bookings sitting on a villa (or one of its rooms) on a given date. */
export const bookingsOnDate = (all: Booking[], villaId: string, date: string) =>
  all.filter(
    (b) =>
      b.villaId === villaId &&
      holdsInventory(b) &&
      datesOverlap(date, addDays(date, 1), b.checkIn, b.checkOut),
  );

/** Local-calendar date, never UTC — `toISOString()` would shift the day back
 *  for anyone east of Greenwich. */
export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Where a booking's payment status lands once `paid` is recorded against it.
 *  Approving the last outstanding rupee settles the booking rather than
 *  leaving it stuck on "part paid". */
export function settledPaymentStatus(
  charges: BookingCharges,
  paid: number,
): "pending" | "partial" | "paid" {
  if (paid <= 0) return "pending";
  return bookingTotals(charges, paid).balance <= 0 ? "paid" : "partial";
}

export const orderTotal = (lines: { price: number; quantity: number }[]) =>
  lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

/**
 * The notification to announce, given what has already been on screen.
 *
 * `seen` being null means nothing has been shown yet — the first load, where
 * every stored notification is history rather than news. Announcing then would
 * pop a card for a week-old payment every time someone signs in.
 */
export function firstUnannounced<T extends { id: string; read: boolean }>(
  notifications: T[],
  seen: Set<string> | null,
): T | undefined {
  if (seen === null) return undefined;
  return notifications.find((n) => !seen.has(n.id) && !n.read);
}

/* --------------------------------------------------------------------- tax */

export interface TaxComponent {
  id: string;
  name: string;
  /** A fraction: 0.18 is 18%. */
  rate: number;
  /** `gst` splits into CGST + SGST within the state, IGST across it. */
  kind: "gst" | "levy";
  active: boolean;
  sortOrder: number;
}

export interface TaxLine {
  label: string;
  /** A fraction, for display beside the label. */
  rate: number;
  amount: number;
}

/**
 * The tax actually charged, split into the components an Indian invoice has
 * to name.
 *
 * The booking's own rate is the source of truth — it is what the guest was
 * quoted and what every total already derives from. The configured taxes only
 * say what the parts are called. So the parts are apportioned out of the tax
 * charged rather than recomputed, and the last line absorbs the rounding:
 * a printed breakdown that does not add up to the total on the same page is
 * worse than no breakdown at all.
 *
 * `interState` decides CGST + SGST against IGST. Within the supplier's own
 * state the levy is split in half between centre and state; across a state
 * border it is one integrated line.
 */
export function taxBreakdown(
  taxCharged: number,
  bookingRate: number,
  taxes: TaxComponent[],
  interState: boolean,
): TaxLine[] {
  const active = taxes
    .filter((t) => t.active && t.rate > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const configured = active.reduce((sum, t) => sum + t.rate, 0);

  // Nothing configured, or a booking taken at zero tax: one honest line.
  if (active.length === 0 || configured <= 0 || taxCharged <= 0) {
    return taxCharged > 0 ? [{ label: "Tax", rate: bookingRate, amount: taxCharged }] : [];
  }

  // Only scale when the booking disagrees with the current configuration —
  // a booking taken at 18% while the rates now total 20% still shows parts
  // that sum to what it was charged.
  const scale = Math.abs(configured - bookingRate) < 1e-6 ? 1 : bookingRate / configured;

  const lines: TaxLine[] = [];
  const shares: number[] = [];

  for (const tax of active) {
    const amount = Math.round((taxCharged * tax.rate) / configured);
    const rate = tax.rate * scale;
    if (tax.kind === "gst" && !interState) {
      const half = Math.round(amount / 2);
      lines.push({ label: `CGST @ ${pct(rate / 2)}`, rate: rate / 2, amount: half });
      lines.push({ label: `SGST @ ${pct(rate / 2)}`, rate: rate / 2, amount: amount - half });
      shares.push(half, amount - half);
    } else {
      const label = tax.kind === "gst" ? `IGST @ ${pct(rate)}` : `${tax.name} @ ${pct(rate)}`;
      lines.push({ label, rate, amount });
      shares.push(amount);
    }
  }

  // Rounding drift lands on the last line, so the parts always total the tax.
  const drift = taxCharged - shares.reduce((sum, n) => sum + n, 0);
  if (drift !== 0 && lines.length > 0) lines[lines.length - 1].amount += drift;

  return lines;
}

/** 0.09 -> "9%", 0.025 -> "2.5%". */
export const pct = (rate: number) => `${Number((rate * 100).toFixed(2))}%`;

/**
 * The default rate a new booking is offered: whatever is switched on.
 *
 * Rounded to four places because the column is numeric(6,4) and because
 * 0.18 + 0.02 is 0.19999999999999998 in binary floating point — which is not
 * a legal GST rate and would be refused by the check constraint.
 */
export const configuredTaxRate = (taxes: TaxComponent[]) =>
  Number(taxes.filter((t) => t.active).reduce((sum, t) => sum + t.rate, 0).toFixed(4));

/**
 * Rupees in words, the Indian way — an invoice is expected to carry it.
 * Lakh and crore, not million.
 */
export function amountInWords(amount: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigits = (n: number): string =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;

  const threeDigits = (n: number): string =>
    n < 100
      ? twoDigits(n)
      : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ""}`;

  const whole = Math.floor(Math.abs(amount));
  if (whole === 0) return "Rupees Zero Only";

  const parts: string[] = [];
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;

  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  return `Rupees ${parts.join(" ")} Only`;
}

/* ----------------------------------------------------------------- reports */

export interface MonthlyFigure {
  /** "2026-09" */
  month: string;
  revenue: number;
  tax: number;
  collected: number;
  nights: number;
  bookings: number;
}

/**
 * The book, by month.
 *
 * Cancelled and rejected stays are left out of revenue — they were never
 * earned — but the count of them is worth having elsewhere, so this returns
 * only what was actually billed. `collected` is money received rather than
 * invoiced, which is the number that pays wages.
 */
export function monthlyFigures(
  rows: {
    checkIn: string;
    status: string;
    nights: number;
    total: number;
    tax: number;
    paid: number;
  }[],
): MonthlyFigure[] {
  const byMonth = new Map<string, MonthlyFigure>();

  for (const row of rows) {
    if (row.status === "cancelled" || row.status === "rejected" || row.status === "inquiry") {
      continue;
    }
    const month = row.checkIn.slice(0, 7);
    const figure = byMonth.get(month) ?? {
      month,
      revenue: 0,
      tax: 0,
      collected: 0,
      nights: 0,
      bookings: 0,
    };
    figure.revenue += row.total;
    figure.tax += row.tax;
    figure.collected += row.paid;
    figure.nights += row.nights;
    figure.bookings += 1;
    byMonth.set(month, figure);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Occupancy as a fraction of what could have been sold.
 *
 * Nights sold over nights available: villas × days in the window. A number
 * over 1 means the villas are split into rooms and more than one stay shares
 * a villa, which is real rather than an error.
 */
export function occupancyRate(nightsSold: number, villas: number, days: number) {
  const available = villas * days;
  return available > 0 ? nightsSold / available : 0;
}

/* ------------------------------------------------------- hotel arithmetic */

/** One stay, reduced to what the reports need. */
export interface RevenueRow {
  checkIn: string;
  checkOut: string;
  /** When the booking was taken — lead time is measured from it. */
  createdAt: string;
  status: string;
  source: string;
  villaId: string;
  customerId: string;
  nights: number;
  roomCharge: number;
  surcharges: number;
  food: number;
  addOns: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

/** A stay only counts as trade if it was not called off. */
export const isEarned = (status: string) =>
  status !== "cancelled" && status !== "rejected" && status !== "no_show" && status !== "inquiry";

export interface RevenueBreakdown {
  accommodation: number;
  food: number;
  addOns: number;
  discount: number;
  net: number;
  tax: number;
  gross: number;
  collected: number;
  outstanding: number;
}

/** Where the money came from, before and after tax. */
export function revenueBreakdown(rows: RevenueRow[]): RevenueBreakdown {
  const earned = rows.filter((r) => isEarned(r.status));
  const accommodation = earned.reduce((n, r) => n + r.roomCharge + r.surcharges, 0);
  const food = earned.reduce((n, r) => n + r.food, 0);
  const addOns = earned.reduce((n, r) => n + r.addOns, 0);
  const discount = earned.reduce((n, r) => n + r.discount, 0);
  const tax = earned.reduce((n, r) => n + r.tax, 0);
  const gross = earned.reduce((n, r) => n + r.total, 0);
  const collected = earned.reduce((n, r) => n + r.paid, 0);

  return {
    accommodation,
    food,
    addOns,
    discount,
    net: accommodation + food + addOns - discount,
    tax,
    gross,
    collected,
    outstanding: gross - collected,
  };
}

export interface HotelKpis {
  roomNights: number;
  availableNights: number;
  occupancy: number;
  /** Average daily rate: what a sold night fetched, accommodation only. */
  adr: number;
  /** Revenue per available night — the number that judges pricing and
   *  occupancy together, and the one a hotelier quotes. */
  revpar: number;
  /** Average length of stay. */
  alos: number;
  stays: number;
  cancelled: number;
  cancellationRate: number;
}

/**
 * The three numbers a hotelier actually asks for, plus the ones behind them.
 *
 * ADR counts accommodation only: including dinner would flatter the room rate
 * and make the figure incomparable with anyone else's. RevPAR divides by
 * *available* nights rather than sold ones, which is what makes it the honest
 * measure — a full villa at a bad price and an empty villa at a good one both
 * show up in it.
 */
export function hotelKpis(rows: RevenueRow[], villas: number, days: number): HotelKpis {
  const earned = rows.filter((r) => isEarned(r.status));
  const roomNights = earned.reduce((n, r) => n + r.nights, 0);
  const accommodation = earned.reduce((n, r) => n + r.roomCharge + r.surcharges, 0);
  const availableNights = Math.max(0, villas * days);
  const cancelled = rows.filter((r) => r.status === "cancelled" || r.status === "no_show").length;

  return {
    roomNights,
    availableNights,
    occupancy: availableNights > 0 ? roomNights / availableNights : 0,
    adr: roomNights > 0 ? Math.round(accommodation / roomNights) : 0,
    revpar: availableNights > 0 ? Math.round(accommodation / availableNights) : 0,
    alos: earned.length > 0 ? roomNights / earned.length : 0,
    stays: earned.length,
    cancelled,
    cancellationRate: rows.length > 0 ? cancelled / rows.length : 0,
  };
}

/**
 * What is owed, by how long it has been owed.
 *
 * Aged from check-out, because that is when the bill falls due — ageing from
 * the booking date would put a stay six months out into the oldest bucket.
 */
export function agedReceivables(
  rows: { checkOut: string; balance: number; status: string }[],
  today: string,
) {
  const buckets = { notYetDue: 0, upTo30: 0, upTo60: 0, over60: 0 };
  const now = new Date(`${today}T00:00:00`).getTime();

  for (const row of rows) {
    if (!isEarned(row.status) || row.balance <= 0) continue;
    const due = new Date(`${row.checkOut}T00:00:00`).getTime();
    const days = Math.floor((now - due) / 86_400_000);

    if (days < 0) buckets.notYetDue += row.balance;
    else if (days <= 30) buckets.upTo30 += row.balance;
    else if (days <= 60) buckets.upTo60 += row.balance;
    else buckets.over60 += row.balance;
  }
  return buckets;
}

/** Totals grouped by any string key on the row, biggest first. */
export function groupRevenue<K extends keyof RevenueRow>(rows: RevenueRow[], key: K) {
  const totals = new Map<string, { key: string; gross: number; stays: number; nights: number }>();
  for (const row of rows.filter((r) => isEarned(r.status))) {
    const id = String(row[key]);
    const entry = totals.get(id) ?? { key: id, gross: 0, stays: 0, nights: 0 };
    entry.gross += row.total;
    entry.stays += 1;
    entry.nights += row.nights;
    totals.set(id, entry);
  }
  return [...totals.values()].sort((a, b) => b.gross - a.gross);
}

/** Whole days between two ISO dates, inclusive of both ends. */
export const daysBetween = (from: string, to: string) =>
  Math.max(
    0,
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000,
    ) + 1,
  );

/* ------------------------------------------------- efficiency and pace */

/**
 * How far ahead people book, in buckets.
 *
 * Lead time is what tells you whether demand is being planned or picked up
 * late, and it is the number a property prices against: a book full of
 * same-week arrivals cannot be sold at a shoulder rate three months out.
 */
export function leadTimeBuckets(rows: { checkIn: string; createdAt: string; status: string }[]) {
  const buckets = [
    { key: "same-week", label: "Within 7 days", stays: 0 },
    { key: "2-4w", label: "1 to 4 weeks", stays: 0 },
    { key: "1-3m", label: "1 to 3 months", stays: 0 },
    { key: "3m+", label: "More than 3 months", stays: 0 },
  ];

  for (const row of rows) {
    if (!isEarned(row.status)) continue;
    const days = Math.round(
      (new Date(`${row.checkIn}T00:00:00`).getTime() -
        new Date(row.createdAt).getTime()) / 86_400_000,
    );
    if (days <= 7) buckets[0].stays += 1;
    else if (days <= 28) buckets[1].stays += 1;
    else if (days <= 90) buckets[2].stays += 1;
    else buckets[3].stays += 1;
  }
  return buckets;
}

export interface EfficiencyRatios {
  /** Total revenue per available night — RevPAR's whole-property cousin. */
  trevpar: number;
  /** Share of stays that ordered from the kitchen at all. */
  fbCaptureRate: number;
  /** Food revenue per occupied night. */
  fbPerNight: number;
  /** Discounts as a share of what would otherwise have been billed. */
  discountRate: number;
  /** Collected over billed. */
  collectionRate: number;
  /** Days sales outstanding: how long the average rupee waits. */
  dso: number;
  /** Payroll over revenue, when the salaries are known. */
  payrollRatio: number | null;
  /** Labour cost per occupied night, when the salaries are known. */
  labourCpor: number | null;
}

/**
 * The ratios a professional pack carries, restricted to the ones this data
 * can actually answer.
 *
 * Deliberately absent: GOP, GOPPAR and anything below the gross-operating
 * line. Those need departmental and undistributed operating expenses — food
 * cost, utilities, laundry, commissions — which this system does not hold. A
 * GOP computed from revenue and payroll alone would be a made-up number
 * wearing an industry name, and worse than no number at all.
 */
export function efficiencyRatios(
  rows: RevenueRow[],
  availableNights: number,
  monthlyPayroll: number | null,
  months: number,
): EfficiencyRatios {
  const earned = rows.filter((r) => isEarned(r.status));
  const roomNights = earned.reduce((n, r) => n + r.nights, 0);
  const gross = earned.reduce((n, r) => n + r.total, 0);
  const collected = earned.reduce((n, r) => n + r.paid, 0);
  const food = earned.reduce((n, r) => n + r.food, 0);
  const discount = earned.reduce((n, r) => n + r.discount, 0);
  const beforeDiscount = earned.reduce(
    (n, r) => n + r.roomCharge + r.surcharges + r.food + r.addOns,
    0,
  );
  const withFood = earned.filter((r) => r.food > 0).length;
  const outstanding = gross - collected;
  const payroll = monthlyPayroll === null ? null : monthlyPayroll * Math.max(months, 0);

  return {
    trevpar: availableNights > 0 ? Math.round(gross / availableNights) : 0,
    fbCaptureRate: earned.length > 0 ? withFood / earned.length : 0,
    fbPerNight: roomNights > 0 ? Math.round(food / roomNights) : 0,
    discountRate: beforeDiscount > 0 ? discount / beforeDiscount : 0,
    collectionRate: gross > 0 ? collected / gross : 0,
    // Revenue per day across the window, then how many days of it are owed.
    dso: gross > 0 && months > 0 ? Math.round(outstanding / (gross / (months * 30))) : 0,
    payrollRatio: payroll !== null && gross > 0 ? payroll / gross : null,
    labourCpor: payroll !== null && roomNights > 0 ? Math.round(payroll / roomNights) : null,
  };
}
