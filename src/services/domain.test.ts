/* Self-check for the money and inventory-conflict rules — the only two pieces
 * of real logic in this UI-only phase. Run with: npx tsx src/services/domain.test.ts */
import assert from "node:assert/strict";
import type { Booking } from "../types";
import { addDays, bookingTotals, datesOverlap, findConflicts, settledPaymentStatus } from "./domain";

const booking = (over: Partial<Booking>): Booking => ({
  id: "x",
  reference: "X",
  customerId: "c",
  villaId: "v-maaya",
  roomIds: [],
  bookingMode: "whole",
  checkIn: "2026-09-10",
  checkOut: "2026-09-12",
  adults: 2,
  children: 0,
  source: "website",
  status: "confirmed",
  paymentStatus: "partial",
  charges: {
    nightlyRate: 1000, nights: 2, weekendSurcharge: 0, seasonalSurcharge: 0,
    extraGuestCharge: 0, food: 0, addOns: 0, discount: 0, taxRate: 0.18,
  },
  amountPaid: 0,
  createdAt: "2026-08-01T00:00:00+05:30",
  ...over,
});

/* --- money ------------------------------------------------------------- */
const t = bookingTotals(
  { nightlyRate: 10000, nights: 3, weekendSurcharge: 2000, seasonalSurcharge: 1000,
    extraGuestCharge: 1500, food: 3000, addOns: 500, discount: 2000, taxRate: 0.18 },
  20000,
);
assert.equal(t.roomCharge, 30000);
assert.equal(t.surcharges, 4500);
assert.equal(t.subtotal, 36000);
assert.equal(t.tax, 6480);
assert.equal(t.total, 42480);
assert.equal(t.balance, 22480);
// Overpayment never shows a negative balance due.
assert.equal(bookingTotals(t as never && { nightlyRate: 100, nights: 1, weekendSurcharge: 0,
  seasonalSurcharge: 0, extraGuestCharge: 0, food: 0, addOns: 0, discount: 0, taxRate: 0 }, 500).balance, 0);

/* --- date overlap (half-open: a checkout may equal the next check-in) --- */
assert.equal(datesOverlap("2026-09-01", "2026-09-03", "2026-09-02", "2026-09-05"), true);
assert.equal(datesOverlap("2026-09-01", "2026-09-03", "2026-09-03", "2026-09-05"), false);
assert.equal(datesOverlap("2026-09-03", "2026-09-05", "2026-09-01", "2026-09-03"), false);

/* --- inventory conflicts ------------------------------------------------ */
const wholeVilla = booking({ id: "whole", roomIds: [] });
const roomA = booking({ id: "roomA", roomIds: ["r-a"], bookingMode: "split" });
const roomB = booking({ id: "roomB", roomIds: ["r-b"], bookingMode: "split" });
const q = { villaId: "v-maaya", checkIn: "2026-09-11", checkOut: "2026-09-13" };

// Whole villa blocks every room, and any room blocks a whole-villa hold.
assert.deepEqual(findConflicts({ ...q, roomIds: ["r-a"] }, [wholeVilla]).map((b) => b.id), ["whole"]);
assert.deepEqual(findConflicts({ ...q, roomIds: [] }, [roomA]).map((b) => b.id), ["roomA"]);
// Different rooms in split mode coexist.
assert.deepEqual(findConflicts({ ...q, roomIds: ["r-b"] }, [roomA]), []);
assert.deepEqual(findConflicts({ ...q, roomIds: ["r-a"] }, [roomA, roomB]).map((b) => b.id), ["roomA"]);
// Released statuses stop holding inventory.
assert.deepEqual(findConflicts({ ...q, roomIds: [] }, [booking({ id: "c", status: "cancelled" })]), []);
assert.deepEqual(findConflicts({ ...q, roomIds: [] }, [booking({ id: "n", status: "no_show" })]), []);
// A booking never conflicts with itself while being edited.
assert.deepEqual(findConflicts({ ...q, roomIds: [], ignoreBookingId: "whole" }, [wholeVilla]), []);
// Another villa is never a conflict.
assert.deepEqual(findConflicts({ ...q, villaId: "v-praana", roomIds: [] }, [wholeVilla]), []);

/* --- payment status after an approval ----------------------------------- */
const c = { nightlyRate: 10000, nights: 1, weekendSurcharge: 0, seasonalSurcharge: 0,
  extraGuestCharge: 0, food: 0, addOns: 0, discount: 0, taxRate: 0 };
assert.equal(settledPaymentStatus(c, 0), "pending");
assert.equal(settledPaymentStatus(c, 4000), "partial");
assert.equal(settledPaymentStatus(c, 10000), "paid");   // exact settlement, not "partial"
assert.equal(settledPaymentStatus(c, 12000), "paid");   // overpayment still reads as paid

/* --- date maths --------------------------------------------------------- */
assert.equal(addDays("2026-09-30", 1), "2026-10-01");
assert.equal(addDays("2026-01-01", -1), "2025-12-31");

console.log("domain.ts — all checks passed");
