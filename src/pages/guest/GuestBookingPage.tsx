import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { FinancialBreakdown } from "@/components/booking/FinancialBreakdown";
import { stayTimes } from "@/services/domain";
import { useGuestStay } from "@/hooks/useGuest";
import { bookingStatus, bookingSource, paymentStatus } from "@/lib/status";
import { formatDate, formatDateRange, nightsBetween } from "@/lib/format";

/** The lifecycle as the guest sees it — the internal states are collapsed into
 *  the four moments they actually care about. */
const GUEST_STEPS = [
  { key: "booked", label: "Booked", hint: "We have your dates" },
  { key: "paid", label: "Payment received", hint: "Advance confirmed" },
  { key: "arrived", label: "Checked in", hint: "Welcome" },
  { key: "done", label: "Checked out", hint: "Until next time" },
] as const;

export default function GuestBookingPage() {
  const { view, bookings } = useGuestStay();

  if (!view) return <ErrorState className="m-5" title="No stay found" />;
  const { booking, villa, roomNames, totals } = view;

  const status = bookingStatus.get(booking.status);
  const pay = paymentStatus.get(booking.paymentStatus);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  // What was agreed for this stay, not the villa's standard hours.
  const times = stayTimes(booking, villa);

  const reached = ["checked_out", "completed"].includes(booking.status)
    ? 4
    : ["checked_in", "in_house"].includes(booking.status)
      ? 3
      : ["confirmed", "payment_approved"].includes(booking.status)
        ? 2
        : 1;

  const others = bookings.filter((b) => b.booking.id !== booking.id);

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">{booking.reference}</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Your booking</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge label={status.label} tone={status.tone} />
          <StatusBadge label={pay.label} tone={pay.tone} />
        </div>
      </header>

      {/* --------------------------------------------------------- progress */}
      <section
        aria-label="Where your booking has got to"
        className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]"
      >
        <ol className="grid gap-4 sm:grid-cols-4">
          {GUEST_STEPS.map((step, index) => {
            const done = index + 1 <= reached;
            const current = index + 1 === reached;
            return (
              <li key={step.key} className="flex gap-3 sm:block">
                <span
                  aria-hidden
                  className={
                    done
                      ? "block h-1 w-1 rounded-full bg-gold sm:h-1 sm:w-full"
                      : "block h-1 w-1 rounded-full bg-stone-300 sm:h-1 sm:w-full"
                  }
                />
                <div className="sm:mt-3">
                  <p
                    className={
                      current
                        ? "text-sm font-semibold text-gold-700"
                        : done
                          ? "text-sm font-medium text-ink"
                          : "text-sm text-stone-600"
                    }
                  >
                    {step.label}
                    {current && <span className="sr-only"> — current stage</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-600">{step.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ------------------------------------------------------------- stay */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-ink/[0.07]">
        <img src={villa?.image} alt={villa?.name} className="h-44 w-full object-cover" />
        <div className="p-6">
          <h2 className="font-display text-2xl text-ink">{villa?.name}</h2>
          <p className="mt-1 text-sm text-stone-600">
            {booking.bookingMode === "whole"
              ? "The whole villa is yours — all four bedrooms."
              : `Your rooms: ${roomNames.join(", ")}`}
          </p>

          <hr className="rule-gold my-5" />

          <dl className="grid gap-5 sm:grid-cols-3">
            {[
              ["Check-in", `${formatDate(booking.checkIn)}, from ${times.arrival}`],
              ["Check-out", `${formatDate(booking.checkOut)}, by ${times.departure}`],
              ["Nights", String(nights)],
              ["Adults", String(booking.adults)],
              ["Children", String(booking.children)],
              ["Booked via", bookingSource[booking.source]],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="label-caps">{label}</dt>
                <dd className="mt-1 text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {booking.specialRequests && (
            <div className="mt-5 rounded-xl bg-sand-200/70 p-4">
              <Eyebrow>What you asked us for</Eyebrow>
              <p className="mt-1.5 text-sm text-ink">{booking.specialRequests}</p>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ money */}
      <section className="rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
        <Eyebrow className="text-gold-400">What it comes to</Eyebrow>
        <FinancialBreakdown
          charges={booking.charges}
          totals={totals}
          tone="dark"
          className="mt-4"
        />
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            asChild
            className="bg-gold/20 text-gold-200 ring-1 ring-gold/40 hover:bg-gold/30 hover:text-white"
          >
            <Link to="/guest/payment">
              {totals.balance > 0 ? "Settle the balance" : "Payment history"}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="text-sand/75 hover:bg-sand/12 hover:text-sand">
            <Link to="/guest/invoice">View invoice</Link>
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------------ other stays */}
      {others.length > 0 && (
        <section>
          <Eyebrow className="mb-3 text-gold-700">Your other stays</Eyebrow>
          <ul className="space-y-3">
            {others.map(({ booking: other, villa: otherVilla }) => {
              const otherStatus = bookingStatus.get(other.status);
              return (
                <li
                  key={other.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]"
                >
                  <img
                    src={otherVilla?.image}
                    alt=""
                    aria-hidden
                    className="size-12 rounded-lg object-cover ring-1 ring-gold/25"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{otherVilla?.name}</p>
                    <p className="text-xs text-stone-600">
                      {formatDateRange(other.checkIn, other.checkOut)} · {other.reference}
                    </p>
                  </div>
                  <StatusBadge label={otherStatus.label} tone={otherStatus.tone} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
