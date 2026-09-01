import { useContext, useMemo } from "react";
import { MockDataContext, type MockData } from "@/services/mock/MockDataProvider";
import { bookingTotals, holdsInventory, orderTotal } from "@/services/domain";
import type { Booking, Customer, ID, Villa } from "@/types";

/**
 * The data-access surface for the whole app. Every screen reads through one of
 * these hooks and never touches the fixtures directly.
 *
 * Phase 2: each hook body becomes a Supabase query (or a TanStack Query call
 * wrapping one). The names, arguments and return shapes stay as they are.
 */
export function useMockData(): MockData {
  const ctx = useContext(MockDataContext);
  if (!ctx) throw new Error("useMockData must be used inside <MockDataProvider>");
  return ctx;
}

/* ---------------------------------------------------------------- inventory */

export const useVillas = () => useMockData().villas;

export function useVilla(id: ID | undefined) {
  const { villas } = useMockData();
  return villas.find((v) => v.id === id);
}

/* ---------------------------------------------------------------- customers */

export const useCustomers = () => useMockData().customers;

export function useCustomer(id: ID | undefined) {
  const { customers } = useMockData();
  return customers.find((c) => c.id === id);
}

/** Booking count, lifetime spend and last stay, derived rather than stored. */
export function useCustomerStats(id: ID | undefined) {
  const { customers, bookings } = useMockData();
  return useMemo(() => {
    const customer = customers.find((c) => c.id === id);
    if (!customer) return undefined;
    const own = bookings.filter((b) => b.customerId === id);
    const spend = own
      .filter((b) => b.status !== "cancelled" && b.status !== "rejected")
      .reduce((sum, b) => sum + bookingTotals(b.charges, b.amountPaid).total, 0);
    const past = own
      .filter((b) => b.status === "completed" || b.status === "checked_out")
      .sort((a, b) => b.checkOut.localeCompare(a.checkOut));
    return { customer, bookings: own, bookingCount: own.length, spend, lastStay: past[0] };
  }, [customers, bookings, id]);
}

/* ----------------------------------------------------------------- bookings */

export const useBookings = () => useMockData().bookings;

export function useBooking(id: ID | undefined) {
  const { bookings } = useMockData();
  return bookings.find((b) => b.id === id);
}

/** A booking joined to its villa, guest, rooms and money — what detail views want. */
export interface BookingView {
  booking: Booking;
  villa?: Villa;
  customer?: Customer;
  roomNames: string[];
  totals: ReturnType<typeof bookingTotals>;
}

export function useBookingViews(): BookingView[] {
  const { bookings, villas, customers } = useMockData();
  return useMemo(
    () =>
      bookings.map((booking) => {
        const villa = villas.find((v) => v.id === booking.villaId);
        return {
          booking,
          villa,
          customer: customers.find((c) => c.id === booking.customerId),
          roomNames: booking.roomIds
            .map((rid) => villa?.rooms.find((r) => r.id === rid)?.name)
            .filter((name): name is string => Boolean(name)),
          totals: bookingTotals(booking.charges, booking.amountPaid),
        };
      }),
    [bookings, villas, customers],
  );
}

export function useBookingView(id: ID | undefined) {
  return useBookingViews().find((view) => view.booking.id === id);
}

/* ----------------------------------------------------------------- payments */

export const usePayments = () => useMockData().payments;

export function useBookingPayments(bookingId: ID | undefined) {
  const { payments } = useMockData();
  return payments
    .filter((p) => p.bookingId === bookingId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The daily verification screen: every receipt still awaiting a decision. */
export function usePaymentVerificationQueue() {
  const views = useBookingViews();
  const { payments } = useMockData();
  return useMemo(
    () =>
      payments
        .filter((p) => p.status === "uploaded")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((payment) => ({
          payment,
          view: views.find((v) => v.booking.id === payment.bookingId),
        }))
        .filter((row): row is { payment: typeof row.payment; view: BookingView } =>
          Boolean(row.view),
        ),
    [payments, views],
  );
}

/* ----------------------------------------------------------------- invoices */

export const useInvoices = () => useMockData().invoices;

export function useBookingInvoice(bookingId: ID | undefined) {
  const { invoices } = useMockData();
  return invoices.find((i) => i.bookingId === bookingId);
}

/* --------------------------------------------------------------------- food */

export const useMenu = () => useMockData().menuItems;

/** Property settings — payment details, invoice identity. Null while loading. */
export const useSettings = () => useMockData().settings;

/** The menu a given villa serves: its own dishes plus the ones served everywhere. */
export function useMenuForVilla(villaId: ID | undefined) {
  const menu = useMockData().menuItems;
  return useMemo(
    () => menu.filter((item) => !item.villaId || item.villaId === villaId),
    [menu, villaId],
  );
}
export const useFoodOrders = () => useMockData().foodOrders;

export function useFoodOrderViews() {
  const { foodOrders, villas, customers } = useMockData();
  return useMemo(
    () =>
      foodOrders.map((order) => ({
        order,
        villa: villas.find((v) => v.id === order.villaId),
        customer: customers.find((c) => c.id === order.customerId),
        roomName: villas
          .find((v) => v.id === order.villaId)
          ?.rooms.find((r) => r.id === order.roomId)?.name,
        total: orderTotal(order.lines),
      })),
    [foodOrders, villas, customers],
  );
}

/* ----------------------------------------------------------------- requests */

export const useRequests = () => useMockData().requests;

export function useRequestViews() {
  const { requests, villas, customers } = useMockData();
  return useMemo(
    () =>
      requests.map((request) => ({
        request,
        villa: villas.find((v) => v.id === request.villaId),
        customer: customers.find((c) => c.id === request.customerId),
      })),
    [requests, villas, customers],
  );
}

/* ----------------------------------------------------------------- feedback */

export const useFeedback = () => useMockData().feedback;

export function useFeedbackViews() {
  const { feedback, villas, customers, bookings } = useMockData();
  return useMemo(
    () =>
      feedback.map((entry) => ({
        entry,
        villa: villas.find((v) => v.id === entry.villaId),
        customer: customers.find((c) => c.id === entry.customerId),
        booking: bookings.find((b) => b.id === entry.bookingId),
      })),
    [feedback, villas, customers, bookings],
  );
}

/* ----------------------------------------------------------------- activity */

export function useActivity(entityId: ID | undefined) {
  const { activity } = useMockData();
  return activity
    .filter((event) => event.entityId === entityId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const useNotifications = () => useMockData().notifications;

/* ---------------------------------------------------------------- dashboard */

/** Everything the admin dashboard counts, in one pass over the bookings. */
export function useTodayOverview() {
  const { today, villas, foodOrders, requests, payments } = useMockData();
  const views = useBookingViews();

  return useMemo(() => {
    const arrivals = views.filter((v) => v.booking.checkIn === today && v.booking.status !== "cancelled");
    const departures = views.filter((v) => v.booking.checkOut === today);
    const inHouse = views.filter(
      (v) =>
        (v.booking.status === "in_house" || v.booking.status === "checked_in") &&
        v.booking.checkIn <= today &&
        v.booking.checkOut > today,
    );
    const occupiedVillaIds = new Set(
      views
        .filter(
          (v) =>
            holdsInventory(v.booking) && v.booking.checkIn <= today && v.booking.checkOut > today,
        )
        .map((v) => v.booking.villaId),
    );
    const outstanding = views
      .filter((v) => holdsInventory(v.booking))
      .reduce((sum, v) => sum + v.totals.balance, 0);

    return {
      today,
      arrivals,
      departures,
      inHouse,
      occupiedVillas: villas.filter((v) => occupiedVillaIds.has(v.id)),
      availableVillas: villas.filter((v) => !occupiedVillaIds.has(v.id)),
      pendingVerification: payments.filter((p) => p.status === "uploaded").length,
      outstandingBalance: outstanding,
      openRequests: requests.filter(
        (r) => r.status !== "completed" && r.status !== "rejected",
      ),
      activeFoodOrders: foodOrders.filter(
        (o) => o.status !== "billed" && o.status !== "cancelled",
      ),
    };
  }, [views, villas, foodOrders, requests, payments, today]);
}
