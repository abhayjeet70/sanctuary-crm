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
