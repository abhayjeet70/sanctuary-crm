import { Link } from "react-router-dom";
import {
  ArrowRight,
  BedDouble,
  ChefHat,
  ClipboardList,
  LogIn,
  LogOut,
  Plus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Eyebrow, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { useFoodOrderViews, useRequestViews, useTodayOverview } from "@/hooks/useData";
import { bookingStatus, foodOrderStatus, requestPriority } from "@/lib/status";
import { formatDate, formatTime, money, moneyShort, initials } from "@/lib/format";
import type { BookingView } from "@/hooks/useData";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { to: "/admin/bookings/new", label: "New booking", icon: Plus, primary: true },
  { to: "/admin/customers", label: "Add customer", icon: UserPlus },
  { to: "/admin/payments", label: "Verify payment", icon: Wallet },
  { to: "/admin/food", label: "Add food order", icon: ChefHat },
  { to: "/admin/requests", label: "View requests", icon: ClipboardList },
];

export default function DashboardPage() {
  const overview = useTodayOverview();
  const orders = useFoodOrderViews();
  const requests = useRequestViews();

  const activeOrders = orders.filter(
    (o) => o.order.status !== "billed" && o.order.status !== "cancelled",
  );
  const openRequests = requests.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatDate(overview.today)}
        title="Today at Sanctuary"
        description="Everything that needs a decision before the day gets away from you."
        actions={QUICK_ACTIONS.map(({ to, label, icon: Icon, primary }) => (
          <Button key={to} asChild variant={primary ? "default" : "outline"} size="sm">
            <Link to={to}>
              <Icon aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      />

      {/* ------------------------------------------------------------ figures */}
      <section aria-label="Today's figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Arrivals"
          value={overview.arrivals.length}
          hint={
            overview.arrivals[0]
              ? `${overview.arrivals[0].villa?.name} from ${overview.arrivals[0].villa?.checkInTime}`
              : "Nobody checking in"
          }
          icon={<LogIn className="size-4" />}
        />
        <StatCard
          label="Departures"
          value={overview.departures.length}
          hint={
            overview.departures[0]
              ? `${overview.departures[0].villa?.name} by ${overview.departures[0].villa?.checkOutTime}`
              : "Nobody checking out"
          }
          icon={<LogOut className="size-4" />}
        />
        <StatCard
          label="In house"
          value={overview.inHouse.reduce((n, v) => n + v.booking.adults + v.booking.children, 0)}
          hint={`${overview.inHouse.length} live stays`}
          icon={<BedDouble className="size-4" />}
        />
        <StatCard
          label="Awaiting verification"
          value={overview.pendingVerification}
          hint={overview.pendingVerification ? "Receipts need a decision" : "Queue is clear"}
          tone={overview.pendingVerification ? "warn" : "default"}
          icon={<Wallet className="size-4" />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ------------------------------------------------------- activity */}
        <section aria-labelledby="today-feed" className="xl:col-span-2">
          <div className="rounded-xl bg-white shadow-soft ring-1 ring-gold/12">
            <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
              <h2 id="today-feed" className="text-xl text-ink">
                Today's movements
              </h2>
              <Button asChild variant="link" size="sm">
                <Link to="/admin/calendar">
                  Calendar
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>

            {overview.arrivals.length + overview.departures.length + overview.inHouse.length ===
            0 ? (
              <EmptyState
                className="m-4"
                title="A quiet day"
                description="No arrivals, departures or guests in house. A good day for maintenance."
              />
            ) : (
              <ul className="divide-y divide-stone/15">
                {overview.arrivals.map((view) => (
                  <MovementRow key={`in-${view.booking.id}`} view={view} kind="in" />
                ))}
                {overview.departures.map((view) => (
                  <MovementRow key={`out-${view.booking.id}`} view={view} kind="out" />
                ))}
                {overview.inHouse.map((view) => (
                  <MovementRow key={`stay-${view.booking.id}`} view={view} kind="stay" />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* --------------------------------------------------------- money */}
        <div className="space-y-6">
          <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <Eyebrow className="text-gold-400">Outstanding balance</Eyebrow>
            <p className="text-gold-gradient mt-3 font-display text-4xl tabular-nums">
              {money(overview.outstandingBalance)}
            </p>
            <p className="mt-2 text-sm text-sand/60">
              Across every booking still holding inventory.
            </p>
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="mt-5 bg-gold/15 text-gold-200 ring-1 ring-gold/35 hover:bg-gold/25 hover:text-white"
            >
              <Link to="/admin/bookings">
                Open bookings
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </section>

          {/* ---------------------------------------------------- occupancy */}
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
            <Eyebrow className="text-gold-700">Villa occupancy</Eyebrow>
            <ul className="mt-4 space-y-3">
              {[...overview.occupiedVillas, ...overview.availableVillas].map((villa) => {
                const occupied = overview.occupiedVillas.some((v) => v.id === villa.id);
                return (
                  <li key={villa.id} className="flex items-center gap-3">
                    <img
                      src={villa.image}
                      alt=""
                      aria-hidden
                      className="size-10 rounded-lg object-cover ring-1 ring-gold/25"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/villas/${villa.id}`}
                        className="block truncate text-sm font-medium text-ink hover:text-clay"
                      >
                        {villa.name}
                      </Link>
                      <p className="text-xs text-stone-600">
                        {villa.mode === "whole" ? "Whole villa" : "Split into rooms"} ·{" "}
                        {villa.bedrooms} bedrooms
                      </p>
                    </div>
                    <StatusBadge
                      label={occupied ? "Occupied" : "Available"}
                      tone={occupied ? "inhouse" : "confirmed"}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {/* -------------------------------------------------- kitchen + requests */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white shadow-soft ring-1 ring-gold/12">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 className="text-xl text-ink">Active kitchen orders</h2>
            <Button asChild variant="link" size="sm">
              <Link to="/admin/food">
                Kitchen board
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          {activeOrders.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<ChefHat className="size-5" />}
              title="Kitchen is clear"
              description="No orders in progress right now."
            />
          ) : (
            <ul className="divide-y divide-stone/15">
              {activeOrders.slice(0, 5).map(({ order, villa, customer, roomName, total }) => {
                const status = foodOrderStatus.get(order.status);
                return (
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
                    <StatusBadge label={status.label} tone={status.tone} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl bg-white shadow-soft ring-1 ring-gold/12">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 className="text-xl text-ink">Open guest requests</h2>
            <Button asChild variant="link" size="sm">
              <Link to="/admin/requests">
                All requests
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          {openRequests.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<ClipboardList className="size-5" />}
              title="Nothing outstanding"
              description="Every guest request has been closed."
            />
          ) : (
            <ul className="divide-y divide-stone/15">
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
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- row */

function MovementRow({ view, kind }: { view: BookingView; kind: "in" | "out" | "stay" }) {
  const { booking, villa, customer, roomNames, totals } = view;
  const status = bookingStatus.get(booking.status);

  const meta = {
    in: { label: "Check-in", tone: "confirmed" as const, time: villa?.checkInTime, Icon: LogIn },
    out: { label: "Check-out", tone: "pending" as const, time: villa?.checkOutTime, Icon: LogOut },
    stay: { label: "In house", tone: "inhouse" as const, time: null, Icon: BedDouble },
  }[kind];

  return (
    <li>
      <Link
        to={`/admin/bookings/${booking.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-gold/6"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            kind === "in" && "bg-status-confirmed-bg text-status-confirmed",
            kind === "out" && "bg-status-pending-bg text-status-pending",
            kind === "stay" && "bg-status-inhouse-bg text-status-inhouse",
          )}
          aria-hidden
        >
          <meta.Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{customer?.name}</p>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <p className="mt-0.5 text-sm text-stone-600">
            {villa?.name}
            {roomNames.length > 0 && ` · ${roomNames.join(", ")}`} ·{" "}
            {booking.adults + booking.children} guests · {booking.reference}
          </p>
        </div>

        <div className="text-right">
          {meta.time && <p className="text-sm tabular-nums text-ink">{meta.time}</p>}
          <p className="text-xs text-stone-600">
            {totals.balance > 0 ? `${money(totals.balance)} due` : "Settled"}
          </p>
        </div>

        <StatusBadge label={status.label} tone={status.tone} className="hidden sm:inline-flex" />
      </Link>
    </li>
  );
}
