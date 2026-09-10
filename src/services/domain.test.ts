/* Self-check for the money and inventory-conflict rules — the only two pieces
 * of real logic in this UI-only phase. Run with: npx tsx src/services/domain.test.ts */
import assert from "node:assert/strict";
import type { Booking } from "../types";
import { cleanPhone, isPhone } from "../lib/format";
import { csvField, toCsv } from "../lib/csv";
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
  monthlyFigures,
  occupancyRate,
  agedReceivables,
  daysBetween,
  groupRevenue,
  hotelKpis,
  revenueBreakdown,
  efficiencyRatios,
  leadTimeBuckets,
  stayTimes,
  waitlistOpenings,
  queuePosition,
  type RevenueRow,
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

/* --- monthly figures ---------------------------------------------------- */
const row = (checkIn: string, status: string, total: number, paid: number) =>
  ({ checkIn, status, nights: 2, total, tax: Math.round(total * 0.18), paid });

const months = monthlyFigures([
  row("2026-09-04", "confirmed", 10000, 5000),
  row("2026-09-20", "completed", 20000, 20000),
  row("2026-10-02", "confirmed", 30000, 0),
  // Neither of these was ever earned.
  row("2026-09-11", "cancelled", 99999, 0),
  row("2026-09-12", "inquiry", 88888, 0),
]);
assert.deepEqual(months.map((m) => m.month), ["2026-09", "2026-10"]);
assert.equal(months[0].revenue, 30000, "cancelled and enquiry stays are not revenue");
assert.equal(months[0].collected, 25000);
assert.equal(months[0].bookings, 2);
assert.equal(months[1].revenue, 30000);
assert.deepEqual(monthlyFigures([]), []);

/* --- occupancy ---------------------------------------------------------- */
assert.equal(occupancyRate(30, 3, 30), 30 / 90);
assert.equal(occupancyRate(0, 3, 30), 0);
assert.equal(occupancyRate(10, 0, 30), 0, "no villas is not a division by zero");

/* --- hotel arithmetic --------------------------------------------------- */
const stay = (over: Partial<RevenueRow> = {}): RevenueRow => ({
  checkIn: "2026-09-01",
  checkOut: "2026-09-03",
  createdAt: "2026-08-01T10:00:00Z",
  status: "completed",
  source: "website",
  villaId: "v1",
  customerId: "c1",
  nights: 2,
  roomCharge: 20000,
  surcharges: 0,
  food: 1000,
  addOns: 0,
  discount: 0,
  tax: 3780,
  total: 24780,
  paid: 24780,
  balance: 0,
  ...over,
});

const rows = [
  stay(),
  stay({ nights: 3, roomCharge: 30000, food: 0, tax: 5400, total: 35400, paid: 0, balance: 35400 }),
  // Never earned: must not touch revenue, but must count against cancellations.
  stay({ status: "cancelled", roomCharge: 99999, total: 999999, paid: 0 }),
];

const breakdown = revenueBreakdown(rows);
assert.equal(breakdown.accommodation, 50000, "a cancelled stay is not revenue");
assert.equal(breakdown.food, 1000);
assert.equal(breakdown.gross, 60180);
assert.equal(breakdown.collected, 24780);
assert.equal(breakdown.outstanding, 35400);

// 3 villas across 30 days = 90 available nights; 5 sold.
const kpis = hotelKpis(rows, 3, 30);
assert.equal(kpis.roomNights, 5);
assert.equal(kpis.availableNights, 90);
assert.equal(kpis.adr, 10000, "ADR is accommodation over nights sold, dinner excluded");
assert.equal(kpis.revpar, Math.round(50000 / 90), "RevPAR divides by available, not sold");
assert.equal(kpis.alos, 2.5);
assert.equal(kpis.cancelled, 1);
assert.ok(Math.abs(kpis.cancellationRate - 1 / 3) < 1e-9);

// An empty book must not divide by zero anywhere.
const empty = hotelKpis([], 0, 0);
assert.equal(empty.adr, 0);
assert.equal(empty.revpar, 0);
assert.equal(empty.occupancy, 0);
assert.equal(empty.cancellationRate, 0);

/* --- aged receivables --------------------------------------------------- */
const aged = agedReceivables(
  [
    { checkOut: "2026-09-20", balance: 1000, status: "confirmed" },  // not yet due
    { checkOut: "2026-09-01", balance: 2000, status: "completed" },  // 9 days
    { checkOut: "2026-07-25", balance: 4000, status: "completed" },  // 47 days
    { checkOut: "2026-05-01", balance: 8000, status: "completed" },  // 132 days
    { checkOut: "2026-05-01", balance: 9999, status: "cancelled" },  // never owed
    { checkOut: "2026-05-01", balance: 0, status: "completed" },     // settled
  ],
  "2026-09-10",
);
assert.deepEqual(aged, { notYetDue: 1000, upTo30: 2000, upTo60: 4000, over60: 8000 });

/* --- grouping and day counting ------------------------------------------ */
const bySource = groupRevenue([stay(), stay({ source: "phone", total: 100 })], "source");
assert.equal(bySource[0].key, "website", "biggest first");
assert.equal(bySource[0].stays, 1);

assert.equal(daysBetween("2026-09-01", "2026-09-01"), 1, "one day is one night of availability");
assert.equal(daysBetween("2026-09-01", "2026-09-30"), 30);
assert.equal(daysBetween("2026-09-30", "2026-09-01"), 0, "backwards is not negative");

/* --- csv ---------------------------------------------------------------- */
assert.equal(csvField("plain"), "plain");
assert.equal(csvField(null), "");
assert.equal(csvField("Bengaluru, Karnataka"), '"Bengaluru, Karnataka"', "a comma must be quoted");
assert.equal(csvField('She said "yes"'), '"She said ""yes"""', "quotes are doubled");
assert.equal(csvField("line one\nline two"), '"line one\nline two"');
// Excel executes a leading =, so a note starting with one is a formula.
assert.equal(csvField("=1+1"), "'=1+1");
assert.equal(csvField("-5"), "'-5");
assert.equal(
  toCsv([["Month", "Gross"], ["Sep 26", 60180]]),
  "Month,Gross\r\nSep 26,60180",
);

/* --- efficiency ratios --------------------------------------------------- */
const effRows = [
  stay({ total: 10000, paid: 10000, food: 2000, discount: 1000, roomCharge: 8000, nights: 2 }),
  stay({ total: 10000, paid: 0, food: 0, discount: 0, roomCharge: 10000, nights: 2 }),
  stay({ status: "cancelled", total: 500000, paid: 0, roomCharge: 500000 }),
];
const eff = efficiencyRatios(effRows, 90, 50000, 1);
assert.equal(eff.trevpar, Math.round(20000 / 90), "TRevPAR is gross over available nights");
assert.equal(eff.fbCaptureRate, 0.5, "one of two earned stays ordered food");
assert.equal(eff.fbPerNight, Math.round(2000 / 4));
assert.equal(eff.collectionRate, 0.5);
assert.equal(eff.payrollRatio, 50000 / 20000);
assert.equal(eff.labourCpor, Math.round(50000 / 4));
// Discount is measured against what would have been billed before it.
// 8000+2000 on the first stay and 10000 on the second, before the discount.
assert.ok(Math.abs(eff.discountRate - 1000 / 20000) < 1e-9);

// No salaries on file must read as "not known", never as zero cost.
const noPay = efficiencyRatios(effRows, 90, null, 1);
assert.equal(noPay.payrollRatio, null);
assert.equal(noPay.labourCpor, null);

// An empty period must not divide by zero.
const nothing = efficiencyRatios([], 0, null, 0);
assert.equal(nothing.trevpar, 0);
assert.equal(nothing.dso, 0);
assert.equal(nothing.fbCaptureRate, 0);

/* --- booking lead time --------------------------------------------------- */
const lead = leadTimeBuckets([
  { checkIn: "2026-09-10", createdAt: "2026-09-08T10:00:00Z", status: "confirmed" },
  { checkIn: "2026-09-30", createdAt: "2026-09-10T10:00:00Z", status: "confirmed" },
  { checkIn: "2026-12-01", createdAt: "2026-09-10T10:00:00Z", status: "completed" },
  { checkIn: "2027-06-01", createdAt: "2026-09-10T10:00:00Z", status: "confirmed" },
  { checkIn: "2026-09-11", createdAt: "2026-09-10T10:00:00Z", status: "cancelled" },
]);
assert.deepEqual(lead.map((b) => b.stays), [1, 1, 1, 1], "a cancelled stay is not demand");

/* --- agreed arrival and departure times ---------------------------------- */
const villaHours = { checkInTime: "14:00", checkOutTime: "11:00" };

// Nothing arranged: the villa's hours, and nothing flagged for the desk.
const usual = stayTimes({}, villaHours);
assert.equal(usual.arrival, "14:00");
assert.equal(usual.departure, "11:00");
assert.equal(usual.arrivalArranged, false);
assert.equal(usual.departureArranged, false);

// A late arrival is the whole reason the column exists.
const late = stayTimes({ checkInTime: "22:30" }, villaHours);
assert.equal(late.arrival, "22:30");
assert.equal(late.arrivalArranged, true, "a late arrival must be flagged");
assert.equal(late.departureArranged, false, "one arrangement is not two");

// Storing the villa's own time is not an arrangement — it is the default
// written down. Flagging it would put every row in the "look twice" column.
assert.equal(stayTimes({ checkInTime: "14:00" }, villaHours).arrivalArranged, false);

// No villa: the industry defaults, not a crash.
assert.equal(stayTimes({}).arrival, "14:00");

/* --- the waiting list ---------------------------------------------------- */
const held = booking({
  id: "b-held",
  villaId: "v-maaya",
  checkIn: "2026-10-01",
  checkOut: "2026-10-05",
  status: "confirmed",
});

const wants = (over: Partial<Parameters<typeof queuePosition>[0]> = {}) => ({
  id: "w1",
  villaId: "v-maaya",
  checkIn: "2026-10-02",
  checkOut: "2026-10-04",
  status: "waiting",
  createdAt: "2026-09-01T10:00:00+05:30",
  ...over,
});

const everyVilla = ["v-maaya", "v-praana"];

// Held dates: no opening on the villa they asked for.
assert.deepEqual(waitlistOpenings(wants(), everyVilla, [held]), []);

// Cancelled: the whole point of the queue.
assert.deepEqual(
  waitlistOpenings(wants(), everyVilla, [booking({ ...held, status: "cancelled" })]),
  ["v-maaya"],
  "a cancelled stay releases the dates",
);

// No villa preference: the other house counts as an opening even while the
// first is held.
assert.deepEqual(
  waitlistOpenings(wants({ villaId: undefined }), everyVilla, [held]),
  ["v-praana"],
);

// Touching, not overlapping. Checking out on the 5th leaves the 5th free.
assert.deepEqual(
  waitlistOpenings(
    wants({ checkIn: "2026-10-05", checkOut: "2026-10-07" }),
    everyVilla,
    [held],
  ),
  // Only v-maaya: the entry named a villa, so only that villa is a candidate.
  ["v-maaya"],
  "a check-out date is not an occupied night",
);

/* Position is arrival order among everyone still waiting for the same villa. */
const queue = [
  wants({ id: "w-first", createdAt: "2026-09-01T09:00:00+05:30" }),
  wants({ id: "w-second", createdAt: "2026-09-02T09:00:00+05:30" }),
  // A different villa is a different queue — it must not push anyone down.
  wants({ id: "w-other", villaId: "v-praana", createdAt: "2026-09-01T08:00:00+05:30" }),
  // Withdrawn, so no position and no effect on the others.
  wants({ id: "w-gone", status: "cancelled", createdAt: "2026-08-30T09:00:00+05:30" }),
];

assert.equal(queuePosition(queue[0], queue), 1);
assert.equal(queuePosition(queue[1], queue), 2, "second in, second served");
assert.equal(queuePosition(queue[2], queue), 1, "another villa is another queue");
assert.equal(queuePosition(queue[3], queue), 0, "a withdrawn entry holds no place");

// Withdrawing the person in front moves everyone behind up, with nothing
// stored that could disagree.
const afterWithdrawal = queue.map((w) =>
  w.id === "w-first" ? { ...w, status: "cancelled" } : w,
);
assert.equal(
  queuePosition(afterWithdrawal[1], afterWithdrawal),
  1,
  "second becomes first when the first withdraws",
);

console.log("domain.ts — all checks passed");
