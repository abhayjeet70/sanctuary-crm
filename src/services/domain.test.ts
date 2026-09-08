/* Self-check for the money and inventory-conflict rules — the only two pieces
 * of real logic in this UI-only phase. Run with: npx tsx src/services/domain.test.ts */
import assert from "node:assert/strict";
import type { Booking } from "../types";
import { cleanPhone, isPhone } from "../lib/format";
import {
  addDays,
  bookingTotals,
  datesOverlap,
  findConflicts,
  firstUnannounced,
  settledPaymentStatus,
  amountInWords,
  configuredTaxRate,
  taxBreakdown,
  type TaxComponent,
} from "./domain";

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

/* --- which notification gets announced ---------------------------------- */
const n = (id: string, read = false) => ({ id, read });
// First load announces nothing, however much history is sitting there.
assert.equal(firstUnannounced([n("a"), n("b")], null), undefined);
// A new unread one is announced.
assert.deepEqual(firstUnannounced([n("c"), n("a")], new Set(["a", "b"])), n("c"));
// Already seen, or arriving already read, is not news.
assert.equal(firstUnannounced([n("a"), n("b")], new Set(["a", "b"])), undefined);
assert.equal(firstUnannounced([n("c", true)], new Set(["a"])), undefined);

/* --- phone numbers ------------------------------------------------------ */
assert.equal(cleanPhone("dsdsds"), "");
assert.equal(cleanPhone("+91 98860-71592abc"), "+91 98860-71592");
assert.equal(isPhone("+91 98860 71592"), true);
assert.equal(isPhone("(080) 4123 4567"), true);
assert.equal(isPhone("dsdsds"), false);
assert.equal(isPhone("98860"), false);      // too few digits to dial
assert.equal(isPhone("+91 98860 7159x"), false);

/* --- tax breakdown ------------------------------------------------------ */
const gst = (rate = 0.18): TaxComponent =>
  ({ id: "t1", name: "GST", rate, kind: "gst", active: true, sortOrder: 0 });
const cess: TaxComponent =
  { id: "t2", name: "Luxury cess", rate: 0.02, kind: "levy", active: true, sortOrder: 1 };

const sums = (lines: { amount: number }[]) => lines.reduce((n, l) => n + l.amount, 0);

// Within Karnataka an 18% GST prints as CGST 9 + SGST 9.
const intra = taxBreakdown(40320, 0.18, [gst()], false);
assert.deepEqual(intra.map((l) => l.label), ["CGST @ 9%", "SGST @ 9%"]);
assert.equal(sums(intra), 40320, "the parts must total the tax charged");

// Across a state border the same money is one IGST line.
const inter = taxBreakdown(40320, 0.18, [gst()], true);
assert.deepEqual(inter.map((l) => l.label), ["IGST @ 18%"]);
assert.equal(sums(inter), 40320);

// An odd number cannot halve evenly; the drift must not vanish.
const odd = taxBreakdown(101, 0.18, [gst()], false);
assert.equal(sums(odd), 101);

// A levy prints under its own name and still totals correctly.
const withCess = taxBreakdown(2000, 0.20, [gst(), cess], false);
assert.equal(sums(withCess), 2000);
assert.ok(withCess.some((l) => l.label.startsWith("Luxury cess")));

// A booking taken at 18% while the rates now total 20% still adds up.
const stale = taxBreakdown(40320, 0.18, [gst(), cess], false);
assert.equal(sums(stale), 40320, "an old booking's parts must total what it was charged");

// Nothing configured is not a crash.
assert.deepEqual(taxBreakdown(500, 0.05, [], false), [{ label: "Tax", rate: 0.05, amount: 500 }]);
assert.deepEqual(taxBreakdown(0, 0, [gst()], false), []);

assert.equal(configuredTaxRate([gst(), cess]), 0.2);
assert.equal(configuredTaxRate([gst(), { ...cess, active: false }]), 0.18);

/* --- rupees in words ---------------------------------------------------- */
assert.equal(amountInWords(264320), "Rupees Two Lakh Sixty Four Thousand Three Hundred Twenty Only");
assert.equal(amountInWords(0), "Rupees Zero Only");
assert.equal(amountInWords(1), "Rupees One Only");
assert.equal(amountInWords(10000000), "Rupees One Crore Only");

console.log("domain.ts — all checks passed");
