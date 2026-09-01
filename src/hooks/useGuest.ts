import { useMemo } from "react";
import { useBookingViews, useMockData } from "@/hooks/useData";
import { MOCK_GUEST_BOOKING_ID, useSession } from "@/services/mock/MockSessionProvider";
import { holdsInventory } from "@/services/domain";

/**
 * Everything the guest portal needs about the signed-in guest and their stay.
 *
 * Phase 2: the customer comes from the Supabase session rather than the mock
 * one, and the current booking is a query filtered by `customer_id` under RLS.
 * The shape returned here does not change.
 */
export function useGuestStay() {
  const { session } = useSession();
  const views = useBookingViews();
  const { customers, payments, foodOrders, requests, feedback, invoices, today } =
    useMockData();

  return useMemo(() => {
    const customerId = session?.customerId ?? "";
    const own = views.filter((v) => v.booking.customerId === customerId);

    // The stay to show: the one in progress, else the next one coming up,
    // else the most recent past stay.
    const current =
      own.find(
        (v) =>
          holdsInventory(v.booking) &&
          v.booking.checkIn <= today &&
          v.booking.checkOut > today,
      ) ??
      own
        .filter((v) => holdsInventory(v.booking) && v.booking.checkIn > today)
        .sort((a, b) => a.booking.checkIn.localeCompare(b.booking.checkIn))[0] ??
      own.sort((a, b) => b.booking.checkOut.localeCompare(a.booking.checkOut))[0] ??
      views.find((v) => v.booking.id === MOCK_GUEST_BOOKING_ID);

    const bookingId = current?.booking.id;

    return {
      customer: customers.find((c) => c.id === customerId),
      view: current,
      bookings: own,
      payments: payments
        .filter((p) => p.bookingId === bookingId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      invoice: invoices.find((i) => i.bookingId === bookingId),
      orders: foodOrders
        .filter((o) => o.customerId === customerId)
        .sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
      requests: requests
        .filter((r) => r.customerId === customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      feedback: feedback
        .filter((f) => f.customerId === customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      today,
    };
  }, [session, views, customers, payments, foodOrders, requests, feedback, invoices, today]);
}
