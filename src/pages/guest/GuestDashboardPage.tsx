import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  ChefHat,
  ConciergeBell,
  Copy,
  FileText,
  Key,
  MessageSquareQuote,
  Receipt,
  Sparkles,
  Users,
  Wallet,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow, Logo, StatusBadge } from "@/components/common";
import { collage, photo } from "@/lib/assets";
import { stayTimes } from "@/services/domain";
import { useGuestStay } from "@/hooks/useGuest";
import { bookingStatus, foodOrderStatus, paymentStatus } from "@/lib/status";
import { formatDate, money, nightsBetween } from "@/lib/format";
import { orderTotal } from "@/services/domain";
import { useSession } from "@/services/session";

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

  // No booking yet is a perfectly normal state for a new account — it is an
  // invitation to book, not an error.
  if (!view) {
    return (
      <div className="p-5 sm:p-8">
        <section className="relative overflow-hidden rounded-2xl bg-ink text-sand">
          <img
            src={photo.hills}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-40"
          />
          <div className="relative p-8 sm:p-12">
            <Eyebrow className="text-gold-400">Nandi Hills · Bengaluru</Eyebrow>
            <h1 className="display-caps mt-3 text-4xl text-white sm:text-5xl">
              Welcome, {session?.name?.split(" ")[0]}
            </h1>
            <hr className="rule-gold mt-6 w-40" />
            <p className="mt-5 max-w-lg text-sand/80">
              You have no stay booked yet. Three houses sit above the escarpment — pick
              your dates and we will hold one for you.
            </p>
            <Button
              asChild
              className="mt-6 bg-gold/20 text-gold-200 ring-1 ring-gold/40 hover:bg-gold/30 hover:text-white"
            >
              <Link to="/guest/book">
                Book a stay
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <p className="mt-4 text-xs text-sand/55">
              Already booked with us over the phone? Ask us to link your booking to this
              email address.
            </p>
          </div>
        </section>

        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {collage.slice(0, 3).map((image) => (
            <li key={image.src} className="overflow-hidden rounded-2xl ring-1 ring-gold/20">
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                className="h-40 w-full object-cover transition-transform duration-700 hover:scale-105"
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { booking, villa, roomNames, totals } = view;
  const status = bookingStatus.get(booking.status);
  const pay = paymentStatus.get(booking.paymentStatus);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  // What was agreed for this stay, not the villa's standard hours.
  const times = stayTimes(booking, villa);
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
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 sm:p-8">
          <div>
            <Eyebrow className="text-gold-400">
              {upcoming ? "Your stay is coming up" : "You are staying with us"}
            </Eyebrow>
            <h1 className="mt-2 font-display text-4xl text-white sm:text-5xl">
              Welcome, {session?.name?.split(" ")[0]}
            </h1>
            <p className="mt-3 text-sand/85">
              {villa?.name} ·{" "}
              {booking.bookingMode === "whole"
                ? "Whole Villa"
                : roomNames.join(", ")}{" "}
              · {nights} {nights === 1 ? "night" : "nights"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <StatusBadge variant="outline" label={status.label} tone={status.tone} />
              <StatusBadge variant="outline" label={pay.label} tone={pay.tone} />
            </div>
          </div>
          <div className="mb-8 hidden sm:block">
            <p className="font-display text-4xl italic tracking-wide text-gold-400/80 -rotate-2">
              A home away
              <br />
              <span className="ml-8">from home</span>
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-6 p-5 sm:p-8">
        {/* --------------------------------------------------- at a glance */}
        <section className="flex flex-col sm:flex-row rounded-2xl bg-white p-2 shadow-soft ring-1 ring-ink/[0.07] divide-y sm:divide-y-0 sm:divide-x divide-gold/15">
          <div className="flex-1 flex gap-4 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand text-stone-600">
              <Calendar className="size-4" aria-hidden />
            </span>
            <div>
              <dt className="text-xs font-semibold text-stone-600">Check-in</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{formatDate(booking.checkIn)}</dd>
              <dd className="text-xs text-stone-600">from {times.arrival}</dd>
            </div>
          </div>
          <div className="flex-1 flex gap-4 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand text-stone-600">
              <Calendar className="size-4" aria-hidden />
            </span>
            <div>
              <dt className="text-xs font-semibold text-stone-600">Check-out</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{formatDate(booking.checkOut)}</dd>
              <dd className="text-xs text-stone-600">by {times.departure}</dd>
            </div>
          </div>
          <div className="flex-1 flex gap-4 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand text-stone-600">
              <Users className="size-4" aria-hidden />
            </span>
            <div>
              <dt className="text-xs font-semibold text-stone-600">Guests</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">
                {booking.adults} adults
                {booking.children > 0 && `, ${booking.children} children`}
              </dd>
            </div>
          </div>
          <div className="flex-1 flex gap-4 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand text-stone-600">
              <FileText className="size-4" aria-hidden />
            </span>
            <div>
              <dt className="text-xs font-semibold text-stone-600">Reference</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{booking.reference}</dd>
            </div>
          </div>
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
                className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07] transition-all hover:ring-gold/40"
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
                className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07] transition-all hover:ring-gold/40"
              >
                <Eyebrow className="text-gold-700">
                  {openRequests.length} open{" "}
                  {openRequests.length === 1 ? "request" : "requests"}
                </Eyebrow>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {openRequests[0].description}
                </p>
                <p className="mt-3 text-sm text-clay-600">View all requests →</p>
              </Link>
            )}
          </section>
        )}

        {/* ----------------------------------------------------------- wifi */}
        <section className="relative overflow-hidden rounded-2xl bg-ink text-sand shadow-lift">
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-1/2 opacity-20 mix-blend-overlay"
            style={{
              backgroundImage: "radial-gradient(ellipse at right, rgba(201,169,97,0.4), transparent 70%)"
            }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between p-6 sm:p-8">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Wifi className="size-4 text-gold-400" aria-hidden />
                <Eyebrow className="text-gold-400">Wi-Fi</Eyebrow>
              </div>
              <p className="mt-2 font-display text-3xl sm:text-4xl text-white">
                {villa?.wifiNetwork}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Key className="size-4 text-gold-400" aria-hidden />
                <p className="text-sm text-sand/80">
                  Password: <span className="ml-1 font-mono text-base text-white">{villa?.wifiPassword}</span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full border border-gold/30 px-3 text-gold-200 hover:bg-gold/15 hover:text-white"
                  onClick={copyWifi}
                >
                  <Copy aria-hidden className="mr-1.5 size-3.5" />
                  Copy
                </Button>
              </div>
            </div>
            
            <div className="mt-6 flex sm:mt-0 sm:items-center sm:pl-8 sm:border-l border-gold/20">
              <Button
                variant="outline"
                className="rounded-full border-gold/50 bg-transparent text-gold-200 hover:bg-gold/10 hover:text-white"
              >
                <Wifi className="mr-2 size-4" aria-hidden />
                Connect to Wi-Fi
              </Button>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- quick links */}
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <Eyebrow className="text-gold-700">Everything else</Eyebrow>
              <h2 className="mt-1 font-display text-3xl text-ink">Quick Access</h2>
            </div>
            <Link to="/guest" className="text-sm font-medium text-ink hover:text-clay-600">
              View all <span aria-hidden>→</span>
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LINKS.map(({ to, label, hint, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07] transition-all hover:ring-gold/40"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand text-ink">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{label}</span>
                    <span className="block text-xs text-stone-600">{hint}</span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-stone transition-transform group-hover:translate-x-1 group-hover:text-ink"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ----------------------------------------------------------- footer banner */}
        <section className="mt-8 overflow-hidden rounded-2xl bg-ink text-sand shadow-lift ring-1 ring-gold/30">
          <div className="relative flex items-center justify-between p-6 sm:p-8">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 w-full opacity-30 mix-blend-overlay"
              style={{
                backgroundImage: "radial-gradient(ellipse at bottom, rgba(201,169,97,0.4), transparent 70%)"
              }}
            />
            <div className="relative flex w-full items-center gap-6">
              <hr className="w-12 shrink-0 border-gold/40 sm:w-20" />
              <p className="font-display text-2xl sm:text-3xl italic tracking-wide text-gold-400">
                Good stays become great memories.
              </p>
              <div className="ml-auto opacity-80">
                <Logo variant="onDark" size="h-12" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
