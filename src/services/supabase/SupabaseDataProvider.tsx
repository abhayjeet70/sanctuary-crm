import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "./client";
import { MockDataContext, type MockData } from "@/services/mock/MockDataProvider";
import { settingsColumns, toSettings, withDerivedRoomStatus } from "./mappers";
import {
  toActivityEvent,
  toBooking,
  toCustomer,
  toFeedback,
  toFoodOrder,
  toGuestRequest,
  toInvoice,
  toMenuItem,
  toNotification,
  toEmployee,
  toEmployeePay,
  toPayment,
  toTax,
  toVilla,
} from "./mappers";
import { useSession } from "@/services/session";
import type {
  ActivityEvent,
  AppNotification,
  Booking,
  Customer,
  Feedback,
  FoodOrder,
  Invoice,
  MenuItem,
  Payment,
  Employee,
  EmployeePay,
  PropertySettings,
  Tax,
  Villa,
} from "@/types";

/**
 * The Supabase implementation of the data layer.
 *
 * It fills the exact context the mock provider filled, so every hook in
 * `src/hooks/useData.ts` and every page above them is unchanged. That was the
 * whole point of the seam: this file is the swap.
 *
 * Mutations write through RPCs where the operation is more than one row
 * (approving a payment touches the payment, the booking and the timeline), then
 * refetch. A refetch-everything strategy is honest at this size — three villas
 * and a few dozen bookings — and avoids inventing a cache that TanStack Query
 * would do better if this ever grows.
 */
const SELECTS = {
  // room_availability supplies today's real occupancy; rooms.status is only
  // the operational override (blocked / cleaning).
  villas: "*, rooms(*)",
  bookings: "*, booking_rooms(room_id)",
  foodOrders: "*, food_order_lines(*)",
} as const;

export function SupabaseDataProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();

  const [villas, setVillas] = useState<Villa[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeePay, setEmployeePay] = useState<EmployeePay[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [requests, setRequests] = useState<ReturnType<typeof toGuestRequest>[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<PropertySettings | null>(null);
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async () => {
    if (!session) return;

    const [v, ra, c, b, p, i, tx, em, ep, m, f, q, fb, a, n, ps] = await Promise.all([
      supabase.from("villas").select(SELECTS.villas).order("name"),
      supabase.from("room_availability").select("*"),
      supabase.from("customers").select("*").order("name"),
      supabase.from("bookings").select(SELECTS.bookings).order("check_in", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").order("issued_at", { ascending: false }),
      supabase.from("taxes").select("*").order("sort_order"),
      supabase.from("employees").select("*").order("employee_code"),
      supabase.from("employee_pay").select("*"),
      supabase.from("menu_items").select("*").order("sort_order").order("name"),
      supabase.from("food_orders").select(SELECTS.foodOrders).order("placed_at", { ascending: false }),
      supabase.from("guest_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("feedback").select("*").order("created_at", { ascending: false }),
      supabase.from("activity_events").select("*").order("at", { ascending: false }).limit(400),
      supabase.from("notifications").select("*").order("at", { ascending: false }),
      supabase.from("property_settings").select("*").maybeSingle(),
    ]);

    // A guest legitimately gets empty arrays for admin-only tables — that is RLS
    // working, not a failure, so only real errors are surfaced.
    const firstError = [v, ra, c, b, p, i, tx, em, ep, m, f, q, fb, a, n, ps].find(
      (res) => res.error,
    )?.error;
    if (firstError && firstError.code !== "PGRST116") {
      console.error("Supabase read failed", firstError);
    }

    setVillas(withDerivedRoomStatus((v.data ?? []).map(toVilla), ra.data ?? []));
    setCustomers((c.data ?? []).map(toCustomer));
    setBookings((b.data ?? []).map(toBooking));
    setPayments((p.data ?? []).map(toPayment));
    setInvoices((i.data ?? []).map(toInvoice));
    setTaxes((tx.data ?? []).map(toTax));
    setEmployees((em.data ?? []).map(toEmployee));
    // Empty for anyone but the owner — that is RLS, not a failure.
    setEmployeePay((ep.data ?? []).map(toEmployeePay));
    setMenuItems((m.data ?? []).map(toMenuItem));
    setFoodOrders((f.data ?? []).map(toFoodOrder));
    setRequests((q.data ?? []).map(toGuestRequest));
    setFeedback((fb.data ?? []).map(toFeedback));
    setActivity((a.data ?? []).map(toActivityEvent));
    setNotifications((n.data ?? []).map(toNotification));
    setSettings(ps.data ? toSettings(ps.data) : null);
    setReady(true);
  }, [session]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /**
   * Live updates.
   *
   * Realtime respects RLS, so a guest subscribed to `bookings` still only
   * receives their own rows — subscribing to a table is not a hole.
   *
   * Every event triggers the same full refetch rather than patching state from
   * the payload. At this size that is both simpler and safer: a payload tells
   * you a booking row changed, not what its recomputed balance now is, and
   * money is derived. The refetch is debounced so a burst of related writes
   * (a payment approval touches three tables) costs one round trip.
   */
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const nudge = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refetch(), 250);
    };

    const channel = supabase.channel("sanctuary-live");
    for (const table of [
      "notifications",
      "bookings",
      "payments",
      "invoices",
      "food_orders",
      "guest_requests",
    ]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, nudge);
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [session, refetch]);

  /** Surface a Postgres error as the sentence the database actually wrote. */
  const report = (error: { message: string } | null, fallback: string) => {
    if (error) {
      toast.error(fallback, { description: error.message });
      return true;
    }
    return false;
  };

  const value = useMemo<MockData>(() => {
    // "Today" is the real clock now, not the fixture date.
    const today = new Date().toISOString().slice(0, 10);

    return {
      today,
      villas,
      customers,
      bookings,
      payments,
      invoices,
      taxes,
      employees,
      employeePay,
      menuItems,
      foodOrders,
      requests,
      feedback,
      activity,
      notifications,
      settings,

      updateBooking: (id, patch) => {
        void (async () => {
          // A lifecycle move.
          if (patch.status) {
            const { error } = await supabase.rpc("set_booking_status", {
              p_booking_id: id,
              p_status: patch.status,
            });
            if (report(error, "Could not update the booking")) return;
          }

          // A full edit — anything touching inventory or price goes through the
          // RPC, which re-runs the conflict check ignoring this booking and
          // rebuilds its room holds in the same transaction.
          if (patch.checkIn || patch.villaId || patch.charges) {
            const current = bookings.find((b) => b.id === id);
            const charges = patch.charges ?? current?.charges;
            const { error } = await supabase.rpc("update_booking", {
              p_booking_id: id,
              p_villa_id: patch.villaId ?? current?.villaId,
              p_room_ids: patch.roomIds ?? current?.roomIds ?? [],
              p_check_in: patch.checkIn ?? current?.checkIn,
              p_check_out: patch.checkOut ?? current?.checkOut,
              p_adults: patch.adults ?? current?.adults ?? 1,
              p_children: patch.children ?? current?.children ?? 0,
              p_source: patch.source ?? current?.source ?? "phone",
              p_nightly_rate: charges?.nightlyRate ?? 0,
              p_weekend_surcharge: charges?.weekendSurcharge ?? 0,
              p_seasonal_surcharge: charges?.seasonalSurcharge ?? 0,
              p_extra_guest_charge: charges?.extraGuestCharge ?? 0,
              p_add_ons: charges?.addOns ?? 0,
              p_discount: charges?.discount ?? 0,
              p_tax_rate: charges?.taxRate ?? 0.18,
              p_special_requests:
                patch.specialRequests ?? current?.specialRequests ?? null,
            });
            if (report(error, "Could not save the changes")) return;
            await refetch();
            return;
          }

          // Plain text fields need no RPC.
          const columns: Record<string, unknown> = {};
          if (patch.internalNotes !== undefined) columns.internal_notes = patch.internalNotes;
          if (patch.specialRequests !== undefined) columns.special_requests = patch.specialRequests;
          if (Object.keys(columns).length) {
            const { error } = await supabase.from("bookings").update(columns).eq("id", id);
            if (report(error, "Could not save the note")) return;
          }
          await refetch();
        })();
      },

      // `newGuest` is set by the manual booking form when reception is taking a
      // stay for someone with no customer record yet. Creating the guest and
      // the booking in one RPC means a date clash rolls both back together,
      // rather than stranding a half-made customer.
      createBooking: (booking, newGuest) => {
        void (async () => {
          if (newGuest) {
            const { error: guestError } = await supabase.rpc("create_booking_with_guest", {
              p_name: newGuest.name,
              p_phone: newGuest.phone,
              p_email: newGuest.email,
              p_villa_id: booking.villaId,
              p_room_ids: booking.roomIds,
              p_check_in: booking.checkIn,
              p_check_out: booking.checkOut,
              p_adults: booking.adults,
              p_children: booking.children,
              p_source: booking.source,
              p_nightly_rate: booking.charges.nightlyRate,
              p_discount: booking.charges.discount,
              p_tax_rate: booking.charges.taxRate,
              p_advance: booking.amountPaid,
              p_special_requests: booking.specialRequests ?? null,
            });
            if (report(guestError, "Could not create the booking")) return;
            await refetch();
            return;
          }

          const { error } = await supabase.rpc("create_booking", {
            p_customer_id: booking.customerId,
            p_villa_id: booking.villaId,
            p_room_ids: booking.roomIds,
            p_check_in: booking.checkIn,
            p_check_out: booking.checkOut,
            p_adults: booking.adults,
            p_children: booking.children,
            p_source: booking.source,
            p_nightly_rate: booking.charges.nightlyRate,
            p_discount: booking.charges.discount,
            p_tax_rate: booking.charges.taxRate,
            p_advance: booking.amountPaid,
            p_special_requests: booking.specialRequests ?? null,
          });
          if (report(error, "Could not create the booking")) return;
          await refetch();
        })();
      },

      approvePayment: (paymentId) => {
        void (async () => {
          const { error } = await supabase.rpc("approve_payment", { p_payment_id: paymentId });
          if (report(error, "Could not approve the payment")) return;
          await refetch();
        })();
      },

      rejectPayment: (paymentId, reason, note) => {
        void (async () => {
          const { error } = await supabase.rpc("reject_payment", {
            p_payment_id: paymentId,
            p_reason: reason,
            p_note: note ?? null,
          });
          if (report(error, "Could not reject the payment")) return;
          await refetch();
        })();
      },

      addPayment: (payment) => {
        void (async () => {
          const { error } = await supabase.from("payments").insert({
            booking_id: payment.bookingId,
            amount: payment.amount,
            method: payment.method,
            reference: payment.reference,
            receipt_path: payment.receiptImage ?? null,
            status: "uploaded",
          });
          if (report(error, "Could not submit the receipt")) return;
          await refetch();
        })();
      },

      setVillaMode: (villaId, mode) => {
        void (async () => {
          const { error } = await supabase.from("villas").update({ mode }).eq("id", villaId);
          if (report(error, "Could not switch the villa mode")) return;
          await refetch();
        })();
      },

      updateVilla: (villaId, patch) => {
        void (async () => {
          const columns: Record<string, unknown> = {};
          if (patch.baseRate !== undefined) columns.base_rate = patch.baseRate;
          if (patch.weekendRate !== undefined) columns.weekend_rate = patch.weekendRate;
          if (patch.seasonalRate !== undefined) columns.seasonal_rate = patch.seasonalRate;
          if (patch.checkInTime !== undefined) columns.check_in_time = patch.checkInTime;
          if (patch.checkOutTime !== undefined) columns.check_out_time = patch.checkOutTime;
          if (patch.description !== undefined) columns.description = patch.description;
          if (patch.wifiNetwork !== undefined) columns.wifi_network = patch.wifiNetwork;
          if (patch.wifiPassword !== undefined) columns.wifi_password = patch.wifiPassword;
          if (patch.mode !== undefined) columns.mode = patch.mode;
          if (patch.name !== undefined) columns.name = patch.name;
          if (patch.capacity !== undefined) columns.capacity = patch.capacity;
          if (patch.amenities !== undefined) columns.amenities = patch.amenities;
          if (patch.status !== undefined) columns.status = patch.status;
          if (!Object.keys(columns).length) return;

          const { error } = await supabase.from("villas").update(columns).eq("id", villaId);
          if (report(error, "Could not save the villa")) return;
          await refetch();
        })();
      },

      saveCustomer: (customer) => {
        void (async () => {
          const columns = {
            name: customer.name,
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            city: customer.city ?? "",
            preferences: customer.preferences ?? [],
            notes: customer.notes || null,
          };
          const { error } = customer.id
            ? await supabase.from("customers").update(columns).eq("id", customer.id)
            : await supabase.from("customers").insert(columns);
          if (report(error, "Could not save the guest")) return;
          await refetch();
        })();
      },

      saveRoom: (villaId, room) => {
        void (async () => {
          const columns = {
            villa_id: villaId,
            name: room.name,
            capacity: room.capacity ?? 2,
            base_rate: room.baseRate ?? 0,
          };
          const { error } = room.id
            ? await supabase.from("rooms").update(columns).eq("id", room.id)
            : await supabase.from("rooms").insert(columns);
          if (report(error, "Could not save the room")) return;
          await refetch();
        })();
      },

      deleteRoom: (roomId) => {
        void (async () => {
          const { error } = await supabase.from("rooms").delete().eq("id", roomId);
          // The guard trigger's message names the bookings in the way — it is
          // more useful than anything this layer could invent.
          if (report(error, "Could not remove the room")) return;
          await refetch();
        })();
      },

      // BR12 lives in a database trigger now: moving an order to `billed` folds
      // its total into the booking's food charge server-side.
      setFoodOrderStatus: (orderId, status) => {
        void (async () => {
          const { error } = await supabase.rpc("set_food_order_status", {
            p_order_id: orderId,
            p_status: status,
          });
          if (report(error, "Could not move the order")) return;
          await refetch();
        })();
      },

      createFoodOrder: async (order) => {
        const { error } = await supabase.rpc("place_food_order", {
          p_booking_id: order.bookingId,
          p_lines: order.lines.map((line) => ({
            menu_item_id: line.menuItemId,
            quantity: line.quantity,
          })),
          p_notes: order.notes ?? null,
        });
        // The kitchen's own words — "the kitchen opens when you arrive on
        // 18 Sep" is more use than anything this layer could invent.
        if (report(error, "Could not place the order")) {
          return { error: error?.message ?? "Could not place the order" };
        }
        await refetch();
        return { error: null };
      },

      createRequest: (request) => {
        void (async () => {
          const { error } = await supabase.from("guest_requests").insert({
            reference: request.reference,
            booking_id: request.bookingId,
            customer_id: request.customerId,
            villa_id: request.villaId,
            category: request.category,
            description: request.description,
            // Guests may only open at normal priority; RLS enforces it too.
            priority: "normal",
            status: "pending",
          });
          if (report(error, "Could not send the request")) return;
          await refetch();
        })();
      },

      updateRequest: (id, patch) => {
        void (async () => {
          const columns: Record<string, unknown> = {};
          if (patch.status !== undefined) columns.status = patch.status;
          if (patch.assignedTo !== undefined) columns.assigned_to = patch.assignedTo;
          if (patch.priority !== undefined) columns.priority = patch.priority;
          if (patch.assignedUser !== undefined) columns.assigned_user = patch.assignedUser ?? null;
          if (patch.resolutionNote !== undefined) {
            columns.resolution_note = patch.resolutionNote || null;
          }
          const { error } = await supabase.from("guest_requests").update(columns).eq("id", id);
          if (report(error, "Could not update the request")) return;
          await refetch();
        })();
      },

      createFeedback: (entry) => {
        void (async () => {
          const { error } = await supabase.from("feedback").insert({
            booking_id: entry.bookingId,
            customer_id: entry.customerId,
            villa_id: entry.villaId,
            rating: entry.rating,
            comment: entry.comment,
            reviewed: false,
          });
          if (report(error, "Could not send your feedback")) return;
          await refetch();
        })();
      },

      updateFeedback: (id, patch) => {
        void (async () => {
          const columns: Record<string, unknown> = {};
          if (patch.reviewed !== undefined) columns.reviewed = patch.reviewed;
          if (patch.reply !== undefined) columns.reply = patch.reply;
          const { error } = await supabase.from("feedback").update(columns).eq("id", id);
          if (report(error, "Could not save the reply")) return;
          await refetch();
        })();
      },

      // Timeline rows are written by database triggers and the RPCs, so the
      // client no longer logs its own. Kept as a no-op to hold the interface.
      logActivity: () => {},

      markNotificationsRead: () => {
        void (async () => {
          await supabase.from("notifications").update({ read: true }).eq("read", false);
          await refetch();
        })();
      },

      createInvoice: (bookingId) => {
        void (async () => {
          const { data, error } = await supabase.rpc("create_invoice", {
            p_booking_id: bookingId,
          });
          if (report(error, "Could not raise the invoice")) return;
          await refetch();
          const number = (data as { number?: string } | null)?.number;
          if (number) toast.success(`${number} raised`);
        })();
      },

      setInvoiceStatus: (id, status) => {
        void (async () => {
          const { error } = await supabase
            .from("invoices")
            .update({ status })
            .eq("id", id);
          if (report(error, "Could not update the invoice")) return;
          await refetch();
        })();
      },

      refresh: refetch,

      saveEmployee: (employee) => {
        void (async () => {
          const columns: Record<string, unknown> = {
            full_name: employee.fullName,
            designation: employee.designation ?? "",
            team: employee.team ?? null,
            phone: employee.phone ?? "",
            email: (employee.email ?? "").trim().toLowerCase(),
            date_of_joining: employee.dateOfJoining || null,
            employment_type: employee.employmentType ?? "full_time",
            status: employee.status ?? "active",
            address: employee.address ?? "",
            emergency_name: employee.emergencyName ?? "",
            emergency_phone: employee.emergencyPhone ?? "",
            id_document: employee.idDocument ?? "",
            notes: employee.notes ?? "",
          };
          // The code is allocated by the database on insert; never overwrite it.
          const { error } = employee.id
            ? await supabase.from("employees").update(columns).eq("id", employee.id)
            : await supabase.from("employees").insert({ ...columns, employee_code: "" });
          if (report(error, "Could not save the employee")) return;
          await refetch();
        })();
      },

      deleteEmployee: (id) => {
        void (async () => {
          const { error } = await supabase.from("employees").delete().eq("id", id);
          if (report(error, "Could not remove the employee")) return;
          await refetch();
        })();
      },

      savePay: (employeeId, monthlySalary, note) => {
        void (async () => {
          const { error } = await supabase.from("employee_pay").upsert({
            employee_id: employeeId,
            monthly_salary: monthlySalary,
            note: note ?? "",
            updated_at: new Date().toISOString(),
          });
          if (report(error, "Could not save the salary")) return;
          await refetch();
        })();
      },

      saveTax: (tax) => {
        void (async () => {
          const columns = {
            name: tax.name,
            rate: tax.rate ?? 0,
            kind: tax.kind ?? "gst",
            active: tax.active ?? true,
            sort_order: tax.sortOrder ?? 0,
          };
          const { error } = tax.id
            ? await supabase.from("taxes").update(columns).eq("id", tax.id)
            : await supabase.from("taxes").insert(columns);
          if (report(error, "Could not save the tax")) return;
          await refetch();
        })();
      },

      deleteTax: (id) => {
        void (async () => {
          const { error } = await supabase.from("taxes").delete().eq("id", id);
          if (report(error, "Could not remove the tax")) return;
          await refetch();
        })();
      },

      updateSettings: (patch) => {
        void (async () => {
          const columns: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(patch)) {
            const column = settingsColumns[key as keyof PropertySettings];
            if (column) columns[column] = value;
          }
          if (!Object.keys(columns).length) return;
          const { error } = await supabase
            .from("property_settings")
            .update(columns)
            .eq("id", true);
          if (report(error, "Could not save the settings")) return;
          await refetch();
        })();
      },

      saveMenuItem: (item) => {
        void (async () => {
          const columns = {
            name: item.name,
            description: item.description ?? "",
            price: item.price ?? 0,
            image: item.image || null,
            category: item.category,
            is_veg: item.isVeg ?? true,
            available: item.available ?? true,
            // Null means every villa, which is why it is not defaulted away.
            villa_id: item.villaId ?? null,
            sort_order: item.sortOrder ?? 0,
          };
          const { error } = item.id
            ? await supabase.from("menu_items").update(columns).eq("id", item.id)
            : await supabase.from("menu_items").insert(columns);
          if (report(error, "Could not save the dish")) return;
          await refetch();
        })();
      },

      deleteMenuItem: (id) => {
        void (async () => {
          const { error } = await supabase.from("menu_items").delete().eq("id", id);
          if (report(error, "Could not remove the dish")) return;
          await refetch();
        })();
      },
    };
  }, [
    villas, customers, bookings, payments, invoices, taxes, employees, employeePay, menuItems,
    foodOrders, requests, feedback, activity, notifications, settings, refetch,
  ]);

  if (!ready && session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-sand">
        <p className="text-sm text-stone-600" role="status" aria-live="polite">
          Loading Homes of Sanctuary…
        </p>
      </div>
    );
  }

  return <MockDataContext.Provider value={value}>{children}</MockDataContext.Provider>;
}
