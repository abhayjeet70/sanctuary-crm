import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Brush,
  ChefHat,
  ClipboardList,
  IndianRupee,
  LogIn,
  LogOut,
  Plus,
  Star,
  UserPlus,
  Wallet,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Eyebrow, StatusBadge, Photo } from "@/components/common";
import { useShowsFinancials, useSession } from "@/services/session";
import {
  useBookingViews,
  useFeedbackViews,
  useFoodOrderViews,
  useMockData,
  useRequestViews,
  useTodayOverview,
  useVillas,
} from "@/hooks/useData";
import { bookingStatus, requestPriority, titleCase, type Tone } from "@/lib/status";
import { formatDate, formatTime, initials, money, moneyShort, relativeTime } from "@/lib/format";
import { orderTotal, stayTimes } from "@/services/domain";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";

/** Tailwind cannot see a class it never reads literally, so the tone dots are
 *  a lookup rather than `bg-status-${tone}`. */
const DOT: Record<Tone, string> = {
  pending: "bg-status-pending",
  uploaded: "bg-status-uploaded",
  confirmed: "bg-status-confirmed",
  inhouse: "bg-status-inhouse",
  cancelled: "bg-status-cancelled",
  completed: "bg-status-completed",
};

const QUICK_ACTIONS = [
  { to: "/admin/customers?add=1", label: "Guest", icon: UserPlus },
  { to: "/admin/food", label: "Food order", icon: ChefHat },
];

const MORE_ACTIONS = [
  { to: "/admin/payments", label: "Verify a payment" },
  { to: "/admin/requests", label: "View requests" },
  { to: "/admin/housekeeping", label: "Housekeeping board" },
  { to: "/admin/calendar", label: "Open the calendar" },
];

/** Morning, afternoon or evening — the desk reads this screen all day. */
function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { session } = useSession();
  const showsFinancials = useShowsFinancials();
  const overview = useTodayOverview();
  const villas = useVillas();
  const bookings = useBookingViews();
  const orders = useFoodOrderViews();
  const requests = useRequestViews();
  const feedback = useFeedbackViews();
  const { today } = useMockData();

  const firstName = (session?.name ?? "").split(" ")[0];

  /* ------------------------------------------------------------- money */

  const revenue = useMemo(() => {
    // What the property earns for *tonight*: one night of each live stay,
    // plus anything the kitchen and the add-ons have sold today. Not the
    // booking totals — those belong to the nights they cover.
    const live = bookings.filter(
      (v) =>
        v.booking.checkIn <= today &&
        v.booking.checkOut > today &&
        v.booking.status !== "cancelled" &&
        v.booking.status !== "rejected",
    );
    const rooms = live.reduce((sum, v) => sum + v.booking.charges.nightlyRate, 0);
    const addOns = live.reduce(
      (sum, v) => sum + v.booking.charges.addOns / Math.max(1, v.booking.charges.nights),
      0,
    );
    const food = orders
      .filter((o) => o.order.placedAt.slice(0, 10) === today && o.order.status !== "cancelled")
      .reduce((sum, o) => sum + orderTotal(o.order.lines), 0);
    return { rooms, food, addOns, total: rooms + food + addOns };
  }, [bookings, orders, today]);

  /* --------------------------------------------------------- occupancy */

  const occupancy = useMemo(() => {
    const occupied = overview.occupiedVillas.length;
    const cleaning = villas.filter(
      (v) => !overview.occupiedVillas.some((o) => o.id === v.id) && v.rooms.some((r) => r.status === "cleaning"),
    ).length;
    const maintenance = villas.filter((v) => v.status === "maintenance").length;
    const available = Math.max(0, villas.length - occupied - cleaning - maintenance);
    return {
      occupied,
      cleaning,
      maintenance,
      available,
      percent: villas.length ? Math.round((occupied / villas.length) * 100) : 0,
    };
  }, [villas, overview.occupiedVillas]);

  /* ---------------------------------------------------- needs attention */

  const attention = useMemo(() => {
    const rows: {
      id: string;
      issue: string;
      who: string;
      where: string;
      since: string;
      action: string;
      to: string;
      tone: Tone;
    }[] = [];

    for (const { booking, villa, customer, totals } of bookings) {
      if (booking.paymentStatus === "uploaded") {
        rows.push({
          id: `p-${booking.id}`,
          issue: "Payment to verify",
          who: customer?.name ?? "Guest",
          where: villa?.name ?? "",
          since: booking.createdAt,
          action: "Verify",
          to: "/admin/payments",
          tone: "uploaded",
        });
      }
      if (booking.checkOut < today && (booking.status === "in_house" || booking.status === "checked_in")) {
        rows.push({
          id: `o-${booking.id}`,
          issue: "Checkout overdue",
          who: customer?.name ?? "Guest",
          where: villa?.name ?? "",
          since: booking.checkOut,
          action: "Open",
          to: `/admin/bookings/${booking.id}`,
          tone: "cancelled",
        });
      }
      if (booking.checkIn === today && booking.status === "pending_payment") {
        rows.push({
          id: `a-${booking.id}`,
          issue: "Arriving unpaid",
          who: customer?.name ?? "Guest",
          where: `${villa?.name ?? ""} · ${money(totals.balance)} due`,
          since: booking.createdAt,
          action: "Contact",
          to: `/admin/bookings/${booking.id}`,
          tone: "pending",
        });
      }
    }

    for (const { request, villa, customer } of requests) {
      const open = request.status !== "completed" && request.status !== "rejected";
      if (!open || (request.priority !== "urgent" && request.priority !== "high")) continue;
      rows.push({
        id: `r-${request.id}`,
        issue: request.description,
        who: customer?.name ?? "Guest",
        where: villa?.name ?? "",
        since: request.createdAt,
        action: request.assignedTo ? "Open" : "Assign",
        to: "/admin/requests",
        tone: requestPriority.get(request.priority).tone,
      });
    }

    for (const { order, villa, customer } of orders) {
      if (order.status !== "placed" && order.status !== "confirmation_pending") continue;
      rows.push({
        id: `f-${order.id}`,
        issue: "Food order unconfirmed",
        who: customer?.name ?? "Guest",
        where: villa?.name ?? "",
        since: order.placedAt,
        action: "Kitchen",
        to: "/admin/food",
        tone: "pending",
      });
    }

    return rows.sort((a, b) => a.since.localeCompare(b.since));
  }, [bookings, requests, orders, today]);

  /* ------------------------------------------------------------ funnel */

  const funnel = useMemo(() => {
    const month = today.slice(0, 7);
    const ofMonth = bookings.filter((v) => v.booking.createdAt.slice(0, 7) === month);
    const reached = (states: string[]) =>
      ofMonth.filter((v) => states.includes(v.booking.status)).length;
    const past = [
      "confirmed",
      "payment_approved",
      "checked_in",
      "in_house",
      "checked_out",
      "completed",
    ];
    return [
      { label: "Enquiries", value: ofMonth.length },
      {
        label: "Quoted",
        value: reached(["pending_payment", "payment_uploaded", ...past]),
      },
      { label: "Confirmed", value: reached(past) },
      { label: "Checked in", value: reached(["checked_in", "in_house", "checked_out", "completed"]) },
      { label: "Completed", value: reached(["completed"]) },
    ];
  }, [bookings, today]);

  const conversion = funnel[0].value
    ? Math.round((funnel[2].value / funnel[0].value) * 100)
    : 0;

  /* -------------------------------------------------------- satisfaction */

  const rating = feedback.length
    ? feedback.reduce((sum, f) => sum + f.entry.rating, 0) / feedback.length
    : 0;

  /* ------------------------------------------------------------ schedule */

  const schedule = useMemo(() => {
    const rows = [
      ...overview.departures.map((v) => ({
        view: v,
        kind: "out" as const,
        time: stayTimes(v.booking, v.villa).departure,
      })),
      ...overview.arrivals.map((v) => ({
        view: v,
        kind: "in" as const,
        time: stayTimes(v.booking, v.villa).arrival,
      })),
    ];
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  }, [overview.arrivals, overview.departures]);

  const activeOrders = orders.filter(
    (o) => o.order.status !== "billed" && o.order.status !== "cancelled",
  );
  const openRequests = requests.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- greeting */}
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Eyebrow className="text-gold-700">{formatDate(today)}</Eyebrow>
          <h1 className="mt-2 text-3xl text-ink sm:text-4xl">
            {greeting(new Date().getHours())}
            {firstName && `, ${firstName}`}
          </h1>
          <p className="mt-2 text-sm text-stone-600">Everything at Sanctuary, at a glance.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link to="/admin/bookings/new">
              <Plus aria-hidden />
              New booking
            </Link>
          </Button>
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Button key={to} asChild variant="outline" size="sm">
              <Link to={to}>
                <Icon aria-hidden />
                {label}
              </Link>
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {MORE_ACTIONS.map((action) => (
                <DropdownMenuItem key={action.to} asChild>
                  <Link to={action.to}>{action.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ------------------------------------------------------- the strip */}
      <section aria-label="Today at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          to="/admin/frontdesk"
          label="Arrivals today"
          value={overview.arrivals.length}
          icon={<LogIn className="size-4" />}
          lines={[
            {
              text: `${overview.arrivals.filter((v) => v.booking.status === "confirmed").length} confirmed`,
              tone: "confirmed",
            },
            {
              text: `${overview.arrivals.filter((v) => v.totals.balance > 0).length} with a balance`,
              tone: "pending",
            },
          ]}
        />
        <Tile
          to="/admin/frontdesk"
          label="Departures today"
          value={overview.departures.length}
          icon={<LogOut className="size-4" />}
          lines={[
            {
              text: overview.departures.some((v) => v.totals.balance > 0)
                ? "Some balances open"
                : "All settled",
              tone: overview.departures.some((v) => v.totals.balance > 0) ? "pending" : "confirmed",
            },
          ]}
        />
        <Tile
          to="/admin/bookings"
          label="In house"
          value={overview.inHouse.reduce(
            (n, v) => n + v.booking.adults + v.booking.children,
            0,
          )}
          icon={<BedDouble className="size-4" />}
          lines={[{ text: `${overview.inHouse.length} live stays`, tone: "inhouse" }]}
        />
        <Tile
          to="/admin/payments"
          label="Awaiting verification"
          value={overview.pendingVerification}
          icon={<Wallet className="size-4" />}
          lines={[
            {
              text: overview.pendingVerification
                ? `${money(overview.outstandingBalance)} outstanding`
                : "Queue is clear",
              tone: overview.pendingVerification ? "uploaded" : "confirmed",
            },
          ]}
        />
      </section>

      {/* ---------------------------------------------- revenue + occupancy */}
      <div className="grid gap-4 lg:grid-cols-2">
        {showsFinancials && (
          <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <div className="flex items-start justify-between gap-3">
              <Eyebrow className="text-gold-400">Revenue today</Eyebrow>
              <IndianRupee className="size-4 text-sand/50" aria-hidden />
            </div>
            <p className="text-gold-gradient mt-3 font-display text-4xl tabular-nums">
              {money(revenue.total)}
            </p>
            <dl className="mt-5 space-y-2 text-sm">
              <RevenueLine label="Rooms" value={revenue.rooms} />
              <RevenueLine label="Food & beverages" value={revenue.food} />
              <RevenueLine label="Add-ons" value={revenue.addOns} />
            </dl>
            <p className="mt-4 border-t border-gold/20 pt-3 text-sm text-sand/60">
              {money(overview.outstandingBalance)} still to collect across open bookings.
            </p>
          </section>
        )}

        <section
          className={cn(
            "rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]",
            !showsFinancials && "lg:col-span-2",
          )}
        >
          <Eyebrow className="text-gold-700">Occupancy</Eyebrow>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <Donut percent={occupancy.percent} />
            <ul className="min-w-40 flex-1 space-y-2 text-sm">
              <Legend tone="inhouse" label="Occupied" value={occupancy.occupied} />
              <Legend tone="confirmed" label="Available" value={occupancy.available} />
              <Legend tone="pending" label="Cleaning" value={occupancy.cleaning} />
              <Legend tone="cancelled" label="Maintenance" value={occupancy.maintenance} />
            </ul>
          </div>
        </section>
      </div>

      {/* ------------------------------------ attention · villas · schedule */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title="Needs attention"
          badge={attention.length}
          link={{ to: "/admin/requests", label: "All requests" }}
          className="xl:col-span-2"
        >
          {attention.length === 0 ? (
            <EmptyState
              className="m-4"
              title="Nothing is waiting on you"
              description="No payment, request or checkout is overdue."
            />
          ) : (
            <ul className="divide-y divide-ink/8">
              {attention.slice(0, 6).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", DOT[row.tone])}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{row.issue}</p>
                    <p className="truncate text-xs text-stone-600">
                      {row.who}
                      {row.where && ` · ${row.where}`} · {relativeTime(row.since)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={row.to}>{row.action}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Today's schedule" link={{ to: "/admin/calendar", label: "Calendar" }}>
          {schedule.length === 0 ? (
            <EmptyState
              className="m-4"
              title="A quiet day"
              description="Nobody arriving or leaving today."
            />
          ) : (
            <ul className="divide-y divide-ink/8">
              {schedule.map(({ view, kind, time }) => (
                <li key={`${kind}-${view.booking.id}`}>
                  <Link
                    to={`/admin/bookings/${view.booking.id}`}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-gold/6"
                  >
                    <span className="w-14 shrink-0 text-xs tabular-nums text-stone-600">
                      {time}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        kind === "in" ? "bg-status-confirmed" : "bg-status-pending",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{view.customer?.name}</p>
                      <p className="truncate text-xs text-stone-600">
                        {kind === "in" ? "Check-in" : "Check-out"} · {view.villa?.name}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ----------------------------------------------------- villa status */}
      <section aria-labelledby="villa-status" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="villa-status" className="text-xl text-ink">
            Villa status
          </h2>
          <Button asChild variant="link" size="sm">
            <Link to="/admin/villas">
              All villas
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {villas.map((villa) => {
            const stay = overview.inHouse.find((v) => v.booking.villaId === villa.id);
            const cleaning = villa.rooms.some((r) => r.status === "cleaning");
            const state =
              villa.status === "maintenance"
                ? { label: "Maintenance", tone: "cancelled" as const, Icon: Wrench }
                : stay
                  ? { label: "Occupied", tone: "inhouse" as const, Icon: BedDouble }
                  : cleaning
                    ? { label: "Cleaning", tone: "pending" as const, Icon: Brush }
                    : { label: "Available", tone: "confirmed" as const, Icon: BedDouble };
            return (
              <article
                key={villa.id}
                className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
              >
                <Photo src={villa.image} alt="" aria-hidden className="h-28 w-full object-cover" />
                <div className="p-4">
                  <Link
                    to={`/admin/villas/${villa.id}`}
                    className="text-sm font-medium text-ink hover:text-clay-600"
                  >
                    {villa.name}
                  </Link>
                  <div className="mt-2">
                    <StatusBadge label={state.label} tone={state.tone} />
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    {stay
                      ? `${stay.customer?.name} · out ${formatDate(stay.booking.checkOut)}`
                      : villa.mode === "whole"
                        ? "Whole villa · ready to book"
                        : `${villa.rooms.filter((r) => r.status === "available").length} of ${villa.rooms.length} rooms free`}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ------------------------------- bookings · funnel · satisfaction */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title="Recent bookings"
          link={{ to: "/admin/bookings", label: "All bookings" }}
          className="xl:col-span-2"
        >
          <ul className="divide-y divide-ink/8">
            {[...bookings]
              .sort((a, b) => b.booking.createdAt.localeCompare(a.booking.createdAt))
              .slice(0, 6)
              .map((view) => (
                <BookingRow key={view.booking.id} view={view} />
              ))}
          </ul>
        </Panel>

        <div className="space-y-6">
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <Eyebrow className="text-gold-700">Booking funnel · this month</Eyebrow>
            <ul className="mt-4 space-y-2">
              {funnel.map((step) => {
                const width = funnel[0].value
                  ? Math.max(6, Math.round((step.value / funnel[0].value) * 100))
                  : 0;
                return (
                  <li key={step.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-stone-600">{step.label}</span>
                    <span className="h-5 flex-1 rounded-md bg-sand-200">
                      <span
                        className="block h-5 rounded-md bg-gold/45"
                        style={{ width: `${width}%` }}
                        aria-hidden
                      />
                    </span>
                    <span className="w-6 text-right text-sm tabular-nums text-ink">
                      {step.value}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex items-center gap-2 border-t border-ink/8 pt-3 text-sm text-stone-600">
              <ArrowUpRight className="size-4 text-clay-600" aria-hidden />
              <span className="font-medium text-ink">{conversion}%</span> of this month's enquiries
              reached a confirmed booking.
            </p>
          </section>

          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow className="text-gold-700">Guest satisfaction</Eyebrow>
              <Button asChild variant="link" size="sm">
                <Link to="/admin/feedback">All feedback</Link>
              </Button>
            </div>
            {feedback.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<Star className="size-5" />}
                title="No feedback yet"
                description="Ratings appear here once guests have replied."
              />
            ) : (
              <>
                <p className="mt-3 font-display text-4xl text-ink tabular-nums">
                  {rating.toFixed(1)}
                  <span className="ml-1 text-base text-stone-600">/ 5</span>
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  From {feedback.length} {feedback.length === 1 ? "review" : "reviews"}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = feedback.filter(
                      (f) => Math.round(f.entry.rating) === star,
                    ).length;
                    const width = Math.round((count / feedback.length) * 100);
                    return (
                      <li key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-stone-600">{star}★</span>
                        <span className="h-2 flex-1 rounded-full bg-sand-200">
                          <span
                            className="block h-2 rounded-full bg-status-confirmed"
                            style={{ width: `${width}%` }}
                            aria-hidden
                          />
                        </span>
                        <span className="w-5 text-right tabular-nums text-stone-600">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      {/* -------------------------------------------------- kitchen + floor */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Active kitchen orders" link={{ to: "/admin/food", label: "Kitchen board" }}>
          {activeOrders.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<ChefHat className="size-5" />}
              title="Kitchen is clear"
              description="No orders in progress right now."
            />
          ) : (
            <ul className="divide-y divide-ink/8">
              {activeOrders.slice(0, 5).map(({ order, villa, customer, roomName, total }) => (
                <li key={order.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {customer?.name}
                      <span className="ml-2 font-normal text-stone-600">
                        {villa?.name}
                        {roomName && ` · ${roomName}`}
                      </span>
                    </p>
                    <p className="truncate text-xs text-stone-600">
                      {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-ink">{moneyShort(total)}</span>
                  <StatusBadge label={titleCase(order.status)} tone="inhouse" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open guest requests" link={{ to: "/admin/requests", label: "All requests" }}>
          {openRequests.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<ClipboardList className="size-5" />}
              title="Nothing outstanding"
              description="Every guest request has been closed."
            />
          ) : (
            <ul className="divide-y divide-ink/8">
              {openRequests.slice(0, 5).map(({ request, villa, customer }) => {
                const priority = requestPriority.get(request.priority);
                return (
                  <li key={request.id} className="flex flex-wrap items-start gap-3 px-6 py-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[0.6875rem] font-semibold text-stone-600">
                      {initials(customer?.name ?? "")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{request.description}</p>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {customer?.name} · {villa?.name} · {formatTime(request.createdAt)}
                      </p>
                    </div>
                    <StatusBadge label={priority.label} tone={priority.tone} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

/** A figure in the top strip, with the one or two lines that qualify it. */
function Tile({
  to,
  label,
  value,
  icon,
  lines,
}: {
  to: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  lines: { text: string; tone: Tone }[];
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06] transition-all hover:shadow-lift hover:ring-gold/30"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label-caps">{label}</p>
        <span className="text-stone" aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-3xl leading-none text-ink tabular-nums">{value}</p>
      <hr className="rule-gold mt-3 opacity-70" />
      <ul className="mt-2 space-y-1">
        {lines.map((line) => (
          <li key={line.text} className="flex items-center gap-2 text-xs text-stone-600">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", DOT[line.tone])}
            />
            {line.text}
          </li>
        ))}
      </ul>
      <span className="mt-3 inline-flex items-center gap-1 text-xs text-clay-600 opacity-0 transition-opacity group-hover:opacity-100">
        Open
        <ArrowRight className="size-3" aria-hidden />
      </span>
    </Link>
  );
}

function Panel({
  title,
  badge,
  link,
  className,
  children,
}: {
  title: string;
  badge?: number;
  link?: { to: string; label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]", className)}
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
        <h2 className="flex items-center gap-2 text-xl text-ink">
          {title}
          {badge ? (
            <span className="min-w-5 rounded-full bg-clay-600 px-1.5 py-0.5 text-center text-[0.625rem] font-semibold text-white tabular-nums">
              {badge}
            </span>
          ) : null}
        </h2>
        {link && (
          <Button asChild variant="link" size="sm">
            <Link to={link.to}>
              {link.label}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function RevenueLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-sand/60">{label}</dt>
      <dd className="tabular-nums text-sand">{money(value)}</dd>
    </div>
  );
}

function Legend({ tone, label, value }: { tone: Tone; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2 text-stone-600">
      <span aria-hidden className={cn("size-2 rounded-full", DOT[tone])} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </li>
  );
}

/** Occupancy as a ring. The number inside carries the value; the ring is
 *  decoration, which is why the percentage is written out in text. */
function Donut({ percent }: { percent: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="12" className="stroke-sand-200" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-status-inhouse"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl text-ink tabular-nums">{percent}%</span>
        <span className="text-[0.625rem] tracking-wide text-stone-600 uppercase">Occupied</span>
      </div>
    </div>
  );
}

function BookingRow({ view }: { view: BookingView }) {
  const { booking, villa, customer, totals } = view;
  const status = bookingStatus.get(booking.status);
  return (
    <li>
      <Link
        to={`/admin/bookings/${booking.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 transition-colors hover:bg-gold/6"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[0.6875rem] font-semibold text-stone-600"
          aria-hidden
        >
          {initials(customer?.name ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {customer?.name}
            <span className="ml-2 font-normal text-stone-600">{booking.reference}</span>
          </p>
          <p className="truncate text-xs text-stone-600">
            {villa?.name} · {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
          </p>
        </div>
        <span className="text-sm tabular-nums text-ink">{moneyShort(totals.total)}</span>
        <StatusBadge label={status.label} tone={status.tone} />
      </Link>
    </li>
  );
}
