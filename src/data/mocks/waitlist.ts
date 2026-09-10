import type { WaitlistEntry } from "@/types";

/**
 * People who wanted dates that were already sold.
 *
 * Ordered oldest first on purpose: that order *is* the queue, and the fixtures
 * exist partly so the front desk screen can be looked at with a real one.
 *
 * The dates deliberately overlap `b-1012` (Villa Maaya, 1st to 3rd September)
 * so that cancelling it in the mock harness has something to release.
 */
export const waitlist: WaitlistEntry[] = [
  {
    id: "w-3001",
    customerId: "c-pooja",
    villaId: "v-maaya",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    adults: 6,
    children: 2,
    source: "phone",
    note: "Anniversary weekend — would take Praana at a push.",
    status: "waiting",
    createdAt: "2026-08-24T09:12:00+05:30",
  },
  {
    id: "w-3002",
    customerId: "c-deepti",
    // No villa: they want the dates more than the house.
    checkIn: "2026-09-02",
    checkOut: "2026-09-05",
    adults: 4,
    children: 0,
    source: "whatsapp",
    note: "Any villa. Driving up from Chennai.",
    status: "waiting",
    createdAt: "2026-08-26T18:40:00+05:30",
  },
  {
    id: "w-3003",
    customerId: "c-rahul",
    villaId: "v-nirvaana",
    checkIn: "2026-09-12",
    checkOut: "2026-09-14",
    adults: 8,
    children: 3,
    source: "referral",
    note: "Corporate offsite. Needs all four bedrooms.",
    status: "offered",
    offeredAt: "2026-08-30T11:05:00+05:30",
    createdAt: "2026-08-27T13:20:00+05:30",
  },
];
