import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChefHat,
  ConciergeBell,
  Copy,
  MessageSquareQuote,
  Receipt,
  Sparkles,
  Wallet,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { useGuestStay } from "@/hooks/useGuest";
import { bookingStatus, foodOrderStatus, paymentStatus } from "@/lib/status";
import { formatDate, formatDateRange, money, nightsBetween } from "@/lib/format";
import { orderTotal } from "@/services/domain";
import { useSession } from "@/services/mock/MockSessionProvider";

const LINKS = [
  { to: "/guest/booking", label: "Booking", hint: "Dates, rooms and guests", icon: Receipt },
  { to: "/guest/payment", label: "Payment", hint: "Balance and receipts", icon: Wallet },
  { to: "/guest/food", label: "Order food", hint: "In-villa dining", icon: ChefHat },
  { to: "/guest/requests", label: "Requests", hint: "Ask the team for anything", icon: ConciergeBell },
  { to: "/guest/amenities", label: "The villa", hint: "Amenities and Wi-Fi", icon: Sparkles },
  { to: "/guest/feedback", label: "Feedback", hint: "Tell us how it went", icon: MessageSquareQuote },
];

export default function GuestDashboardPage() {
  const { session } = useSession();
  const { view, orders, requests, today } = useGuestStay();

  if (!view) {
    return (
      <ErrorState
        className="m-5"
        title="No stay found"
        description="There is no booking attached to this guest yet."
      />
    );
  }

  const { booking, villa, roomNames, totals } = view;
  const status = bookingStatus.get(booking.status);
  const pay = paymentStatus.get(booking.paymentStatus);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const upcoming = booking.checkIn > today;
  const liveOrder = orders.find(
    (o) => o.status !== "billed" && o.status !== "cancelled" && o.status !== "served",
  );
  const openRequests = requests.filter(
    (r) => r.status !== "completed" && r.status !== "rejected",
  );

  const copyWifi = async () => {
    try {
      await navigator.clipboard.writeText(villa?.wifiPassword ?? "");
      toast.success("Wi-Fi password copied");
    } catch {
      toast.error("Could not copy — the password is shown above");
    }
  };

  return (
    <div className="pb-8">
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <img
          src={villa?.image}
          alt={`${villa?.name} at Homes of Sanctuary`}
          className="h-72 w-full object-cover sm:h-96"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/15" />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_15%,rgba(201,169,97,0.22),transparent_60%)]"
        />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <Eyebrow className="text-gold-400">
            {upcoming ? "Your stay is coming up" : "You are staying with us"}
          </Eyebrow>
          <h1 className="display-caps mt-2 text-4xl text-white sm:text-5xl">
            Welcome, {session?.name?.split(" ")[0]}
          </h1>
          <hr className="rule-gold mt-5 w-40" />
          <p className="mt-4 text-sand/85">
            {villa?.name} ·{" "}
            {booking.bookingMode === "whole"
              ? "whole villa"
              : roomNames.join(", ")}{" "}
            · {nights} {nights === 1 ? "night" : "nights"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge label={status.label} tone={status.tone} />
            <StatusBadge label={pay.label} tone={pay.tone} />
          </div>
        </div>
      </section>

      <div className="space-y-6 p-5 sm:p-8">
        {/* --------------------------------------------------- at a glance */}
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-gold/15">
          <Eyebrow className="text-gold-700">Your stay</Eyebrow>
          <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <div>
              <dt className="label-caps">Check-in</dt>
              <dd className="mt-1 text-ink">{formatDate(booking.checkIn)}</dd>
              <dd className="text-xs text-stone-600">from {villa?.checkInTime}</dd>
            </div>
            <div>
              <dt className="label-caps">Check-out</dt>
              <dd className="mt-1 text-ink">{formatDate(booking.checkOut)}</dd>
              <dd className="text-xs text-stone-600">by {villa?.checkOutTime}</dd>
            </div>
            <div>
              <dt className="label-caps">Guests</dt>
              <dd className="mt-1 text-ink">
                {booking.adults} adults
                {booking.children > 0 && `, ${booking.children} children`}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Reference</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{booking.reference}</dd>
            </div>
          </dl>
        </section>

        {/* -------------------------------------------------------- balance */}
        {totals.balance > 0 && (
          <section className="rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <Eyebrow className="text-gold-400">Balance due</Eyebrow>
            <p className="text-gold-gradient mt-2 font-display text-4xl tabular-nums">
              {money(totals.balance)}
            </p>
            <p className="mt-2 text-sm text-sand/70">
              {money(totals.paid)} of {money(totals.total)} received. Settle by UPI or bank
              transfer and upload the receipt — we will confirm it the same day.
            </p>
            <Button
              asChild
              className="mt-5 bg-gold/20 text-gold-200 ring-1 ring-gold/40 hover:bg-gold/30 hover:text-white"
            >
              <Link to="/guest/payment">
                Pay or upload a receipt
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </section>
        )}

        {/* ------------------------------------------------- live activity */}
        {(liveOrder || openRequests.length > 0) && (
          <section className="grid gap-4 sm:grid-cols-2">
            {liveOrder && (
              <Link
                to="/guest/food"
                className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gold/15 transition-all hover:ring-gold/40"
              >
                <Eyebrow className="text-gold-700">Your order</Eyebrow>
                <p className="mt-2 font-display text-lg text-ink">
                  {liveOrder.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <StatusBadge {...foodOrderStatus.get(liveOrder.status)} />
                  <span className="tabular-nums text-ink">
                    {money(orderTotal(liveOrder.lines))}
                  </span>
                </div>
              </Link>
            )}
            {openRequests.length > 0 && (
              <Link
                to="/guest/requests"
                className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gold/15 transition-all hover:ring-gold/40"
              >
                <Eyebrow className="text-gold-700">
                  {openRequests.length} open{" "}
                  {openRequests.length === 1 ? "request" : "requests"}
                </Eyebrow>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {openRequests[0].description}
                </p>
                <p className="mt-3 text-sm text-clay">View all requests →</p>
              </Link>
            )}
          </section>
        )}

        {/* ----------------------------------------------------------- wifi */}
        <section className="overflow-hidden rounded-2xl bg-ink text-sand shadow-lift ring-1 ring-gold/30">
          <div className="relative p-6">
            <div
              aria-hidden
              className="absolute -top-12 -right-12 size-40 rounded-full bg-gold/15 blur-2xl"
            />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Wifi className="size-4 text-gold-400" aria-hidden />
                <Eyebrow className="text-gold-400">Wi-Fi</Eyebrow>
              </div>
              <p className="text-gold-gradient mt-4 font-display text-3xl">
                {villa?.wifiNetwork}
              </p>
              <hr className="rule-gold mt-4" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="font-mono text-lg tracking-wide text-sand">
                  {villa?.wifiPassword}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gold-200 hover:bg-gold/15 hover:text-white"
                  onClick={copyWifi}
                >
                  <Copy aria-hidden />
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- quick links */}
        <section>
          <Eyebrow className="mb-3 text-gold-700">Everything else</Eyebrow>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LINKS.map(({ to, label, hint, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gold/12 transition-all hover:ring-gold/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/12 text-gold-700">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{label}</span>
                    <span className="block text-xs text-stone-600">{hint}</span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-stone transition-transform group-hover:translate-x-1 group-hover:text-clay"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-xs text-stone-600">
          {villa?.name} · {formatDateRange(booking.checkIn, booking.checkOut)}
        </p>
      </div>
    </div>
  );
}
