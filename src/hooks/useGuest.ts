import { useMemo } from "react";
import { useBookingViews, useMockData } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { holdsInventory } from "@/services/domain";

/**
 * Everything the guest portal needs about the signed-in guest and their stay.
 *
 * The customer id comes from the profile attached to the Supabase session, and
 * RLS means the collections already contain only this guest's rows — the filter
 * below is for picking the right stay, not for keeping other guests out.
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
      own.sort((a, b) => b.booking.checkOut.localeCompare(a.booking.checkOut))[0];

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
