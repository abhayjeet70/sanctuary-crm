import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import { bookings as bookingSeed, MOCK_TODAY } from "@/data/mocks/bookings";
import { customers as customerSeed } from "@/data/mocks/customers";
import { menuItems as menuSeed } from "@/data/mocks/menu";
import {
  activityEvents as activitySeed,
  feedback as feedbackSeed,
  foodOrders as foodOrderSeed,
  guestRequests as requestSeed,
  invoices as invoiceSeed,
  notifications as notificationSeed,
} from "@/data/mocks/operations";
import { payments as paymentSeed } from "@/data/mocks/payments";
import { villas as villaSeed } from "@/data/mocks/villas";
import { orderTotal, settledPaymentStatus } from "@/services/domain";
import type {
  ActivityEvent,
  ActivityKind,
  AppNotification,
  Booking,
  Feedback,
  FoodOrder,
  FoodOrderStatus,
  GuestRequest,
  ID,
  Invoice,
  MenuItem,
  Payment,
  PaymentRejectionReason,
  PropertySettings,
  Room,
  Customer,
  Department,
  Employee,
  EmployeePay,
  Tax,
  Villa,
  VillaMode,
} from "@/types";

/**
 * The whole mock backend, held in React state so that actions taken in the UI
 * (approving a payment, advancing a kitchen order, raising a request) persist
 * for the session and are visible across every screen.
 *
 * Phase 2: this provider is the single seam. Each collection becomes a Supabase
 * query and each mutator a `supabase.from(...)` write; the hooks in
 * `src/hooks/` keep their signatures, so no page component changes.
 */
export interface MockData {
  today: string;
  villas: Villa[];
  customers: typeof customerSeed;
  bookings: Booking[];
  payments: Payment[];
  invoices: Invoice[];
  menuItems: MenuItem[];
  settings: PropertySettings | null;
  taxes: Tax[];
  departments: Department[];
  employees: Employee[];
  /** Owner-only; empty for everyone else because RLS returns nothing. */
  employeePay: EmployeePay[];
  foodOrders: FoodOrder[];
  requests: GuestRequest[];
  feedback: Feedback[];
  activity: ActivityEvent[];
  notifications: AppNotification[];

  updateBooking: (id: ID, patch: Partial<Booking>) => void;
  /** `newGuest` is supplied when the booking is for someone with no customer
   *  record yet; the implementation creates both in one transaction. */
  createBooking: (booking: Booking, newGuest?: NewGuest) => void;
  approvePayment: (paymentId: ID) => void;
  rejectPayment: (paymentId: ID, reason: PaymentRejectionReason, note?: string) => void;
  addPayment: (payment: Payment) => void;
  setVillaMode: (villaId: ID, mode: VillaMode) => void;
  updateVilla: (villaId: ID, patch: Partial<Villa>) => void;
  /** Add a room, or edit one. Omit `id` to add. */
  /** Add a guest, or edit one. Omit `id` to add. */
  saveCustomer: (customer: Partial<Customer> & { id?: ID }) => void;
  saveRoom: (villaId: ID, room: Partial<Room> & { id?: ID }) => void;
  /** Refused by the database while a booking still holds the room. */
  deleteRoom: (roomId: ID) => void;
  setFoodOrderStatus: (orderId: ID, status: FoodOrderStatus) => void;
  /** Resolves with the reason it was refused, so the page does not claim
   *  success for an order the kitchen never received. */
  createFoodOrder: (order: FoodOrder) => Promise<{ error: string | null }>;
  /** Resolves with the reason it was refused, so the page cannot claim to
   *  have sent something the server rejected. */
  createRequest: (request: GuestRequest) => Promise<{ error: string | null }>;
  updateRequest: (id: ID, patch: Partial<GuestRequest>) => void;
  createFeedback: (entry: Feedback) => Promise<{ error: string | null }>;
  updateFeedback: (id: ID, patch: Partial<Feedback>) => void;
  logActivity: (entityId: ID, kind: ActivityKind, title: string, detail?: string) => void;
  markNotificationsRead: () => void;
  /** Raise a draft invoice against a booking. The number is allocated by the
   *  database, so two people raising one at once cannot collide. */
  createInvoice: (bookingId: ID) => void;
  /** Issue a draft invoice (or void one). Only issued invoices reach the guest. */
  setInvoiceStatus: (id: ID, status: Invoice["status"]) => void;
  updateSettings: (patch: Partial<PropertySettings>) => void;
  /** Add or edit a tax. Omit `id` to add. */
  saveTax: (tax: Partial<Tax> & { id?: ID }) => void;
  /** Add or edit an employee. Omit `id` to add. */
  /** Add or edit a department, permissions included. Omit `id` to add. */
  saveDepartment: (department: Partial<Department> & { id?: ID }) => void;
  deleteDepartment: (id: ID) => void;
  /** The owner's own display name, as it appears across the app. */
  updateOwnName: (name: string) => void;
  saveEmployee: (employee: Partial<Employee> & { id?: ID }) => void;
  deleteEmployee: (id: ID) => void;
  savePay: (employeeId: ID, monthlySalary: number, note?: string) => void;
  deleteTax: (id: ID) => void;
  /** Re-read everything. For changes made outside these mutators — an Edge
   *  Function creating a login, say. */
  refresh: () => Promise<void>;
  saveMenuItem: (item: Partial<MenuItem> & { id?: ID }) => void;
  deleteMenuItem: (id: ID) => void;
}

export interface NewGuest {
  name: string;
  phone: string;
  email: string;
}

export const MockDataContext = createContext<MockData | null>(null);

const patchById = <T extends { id: ID }>(list: T[], id: ID, patch: Partial<T>) =>
  list.map((item) => (item.id === id ? { ...item, ...patch } : item));

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [villas, setVillas] = useState<Villa[]>(villaSeed);
  const [bookings, setBookings] = useState<Booking[]>(bookingSeed);
  const [payments, setPayments] = useState<Payment[]>(paymentSeed);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>(foodOrderSeed);
  const [requests, setRequests] = useState<GuestRequest[]>(requestSeed);
  const [feedback, setFeedback] = useState<Feedback[]>(feedbackSeed);
  const [activity, setActivity] = useState<ActivityEvent[]>(activitySeed);
  const [notifications, setNotifications] = useState<AppNotification[]>(notificationSeed);

  const logActivity = useCallback(
    (entityId: ID, kind: ActivityKind, title: string, detail?: string) => {
      setActivity((prev) => [
        {
          id: `a-${Date.now()}-${prev.length}`,
          entityId,
          kind,
          title,
          detail,
          actor: "You (mock session)",
          at: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [],
  );

  const updateBooking = useCallback(
    (id: ID, patch: Partial<Booking>) => setBookings((prev) => patchById(prev, id, patch)),
    [],
  );

  const approvePayment = useCallback(
    (paymentId: ID) => {
      setPayments((prev) => {
        const payment = prev.find((p) => p.id === paymentId);
        if (!payment) return prev;
        setBookings((allBookings) =>
          allBookings.map((booking) => {
            if (booking.id !== payment.bookingId) return booking;
            const paid = booking.amountPaid + payment.amount;
            return {
              ...booking,
              amountPaid: paid,
              // Approving money never moves a stay that has already started
              // backwards to "confirmed".
              status: booking.status === "payment_uploaded" || booking.status === "pending_payment"
                ? ("confirmed" as const)
                : booking.status,
              paymentStatus: settledPaymentStatus(booking.charges, paid),
            };
          }),
        );
        logActivity(payment.bookingId, "payment", "Payment approved", `${payment.reference}`);
        return patchById(prev, paymentId, {
          status: "approved",
          verifiedBy: "You (mock session)",
          verifiedAt: new Date().toISOString(),
        });
      });
    },
    [logActivity],
  );

  const rejectPayment = useCallback(
    (paymentId: ID, reason: PaymentRejectionReason, note?: string) => {
      setPayments((prev) => {
        const payment = prev.find((p) => p.id === paymentId);
        if (payment) {
          setBookings((all) =>
            patchById(all, payment.bookingId, {
              status: "pending_payment",
              paymentStatus: "rejected",
            }),
          );
          logActivity(payment.bookingId, "payment", "Payment rejected", note || reason);
        }
        return patchById(prev, paymentId, {
          status: "rejected",
          rejectionReason: reason,
          rejectionNote: note,
          verifiedBy: "You (mock session)",
          verifiedAt: new Date().toISOString(),
        });
      });
    },
    [logActivity],
  );

  const value = useMemo<MockData>(
    () => ({
      today: MOCK_TODAY,
      villas,
      customers: customerSeed,
      bookings,
      payments,
      invoices: invoiceSeed,
      menuItems: menuSeed,
      settings: null,
      // The offline harness has no configuration; the invoice falls back to a
      // single "Tax" line, which is what taxBreakdown does with an empty list.
      taxes: [],
      departments: [],
      employees: [],
      employeePay: [],
      foodOrders,
      requests,
      feedback,
      activity,
      notifications,

      updateBooking,
      createBooking: (booking) => {
        setBookings((prev) => [booking, ...prev]);
        logActivity(booking.id, "booking", "Booking created", `Source: ${booking.source}`);
      },
      approvePayment,
      rejectPayment,
      addPayment: (payment) => {
        setPayments((prev) => [payment, ...prev]);
        setBookings((prev) =>
          patchById(prev, payment.bookingId, {
            status: "payment_uploaded",
            paymentStatus: "uploaded",
          }),
        );
        logActivity(payment.bookingId, "payment", "Payment receipt uploaded", payment.reference);
      },
      setVillaMode: (villaId, mode) => setVillas((prev) => patchById(prev, villaId, { mode })),
      updateVilla: (villaId, patch) => setVillas((prev) => patchById(prev, villaId, patch)),
      // BR12 — billing an order moves its value onto the booking's food charge,
      // so it appears on the invoice and in the balance. Guarded against a
      // double-add if the same order is billed twice.
      setFoodOrderStatus: (orderId, status) =>
        setFoodOrders((prev) => {
          const order = prev.find((o) => o.id === orderId);
          if (order && status === "billed" && order.status !== "billed") {
            const value = orderTotal(order.lines);
            setBookings((all) =>
              all.map((booking) =>
                booking.id === order.bookingId
                  ? {
                      ...booking,
                      charges: { ...booking.charges, food: booking.charges.food + value },
                    }
                  : booking,
              ),
            );
            logActivity(order.bookingId, "food", "Order billed to the room", order.reference);
          }
          return patchById(prev, orderId, { status });
        }),
      createFoodOrder: async (order) => {
        setFoodOrders((prev) => [order, ...prev]);
        logActivity(order.bookingId, "food", "Kitchen order placed", order.reference);
        return { error: null };
      },
      createRequest: async (request) => {
        setRequests((prev) => [request, ...prev]);
        logActivity(request.bookingId, "request", "Guest request raised", request.description);
        return { error: null };
      },
      updateRequest: (id, patch) => setRequests((prev) => patchById(prev, id, patch)),
      createFeedback: async (entry) => {
        setFeedback((prev) => [entry, ...prev]);
        logActivity(entry.bookingId, "feedback", "Feedback submitted", `${entry.rating} out of 5`);
        return { error: null };
      },
      updateFeedback: (id, patch) => setFeedback((prev) => patchById(prev, id, patch)),
      logActivity,
      markNotificationsRead: () =>
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
      // Settings, invoices and the menu are read-only in the offline harness;
      // the Supabase provider implements them.
      saveCustomer: () => {},
      saveRoom: () => {},
      deleteRoom: () => {},
      createInvoice: () => {},
      setInvoiceStatus: () => {},
      refresh: async () => {},
      saveDepartment: () => {},
      deleteDepartment: () => {},
      updateOwnName: () => {},
      saveEmployee: () => {},
      deleteEmployee: () => {},
      savePay: () => {},
      saveTax: () => {},
      deleteTax: () => {},
      updateSettings: () => {},
      saveMenuItem: () => {},
      deleteMenuItem: () => {},
    }),
    [
      villas, bookings, payments, foodOrders, requests, feedback, activity, notifications,
      updateBooking, approvePayment, rejectPayment, logActivity,
    ],
  );

  return <MockDataContext.Provider value={value}>{children}</MockDataContext.Provider>;
}
