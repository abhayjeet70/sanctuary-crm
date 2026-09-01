import { Link } from "react-router-dom";
import { LogOut, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevBadge, Eyebrow, Logo, StatusBadge } from "@/components/common";
import { useSession, MOCK_GUEST_BOOKING_ID } from "@/services/mock/MockSessionProvider";
import { useBookingView } from "@/hooks/useData";
import { bookingStatus, paymentStatus } from "@/lib/status";
import { formatDateRange, money, nightsBetween } from "@/lib/format";

/**
 * Holding screen for the guest portal, showing the fixture stay the mock guest
 * is signed in to. The full portal (Module 7) is built after the admin modules.
 */
export default function GuestPlaceholder() {
  const { session, signOut } = useSession();
  const view = useBookingView(MOCK_GUEST_BOOKING_ID);

  if (!view) return null;
  const { booking, villa, totals } = view;
  const status = bookingStatus.get(booking.status);
  const payment = paymentStatus.get(booking.paymentStatus);

  return (
    <div className="min-h-dvh bg-sand">
      <header className="relative overflow-hidden bg-ink text-sand">
        <img
          src={villa?.image}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="relative mx-auto max-w-3xl px-6 py-10 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo variant="onDark" size="h-16 sm:h-20" />
            <div className="flex items-center gap-2">
              <DevBadge className="bg-sand/12 text-sand" />
              <Button
                variant="ghost"
                size="sm"
                className="text-sand hover:bg-sand/12"
                onClick={signOut}
              >
                <LogOut aria-hidden />
                Sign out
              </Button>
            </div>
          </div>

          <Eyebrow className="mt-12 text-gold-400">Your stay is confirmed</Eyebrow>
          <h1 className="display-caps mt-3 text-4xl text-white sm:text-5xl">
            Welcome, {session?.name?.split(" ")[0]}
          </h1>
          <p className="mt-4 text-base text-sand/80">
            {villa?.name} · {formatDateRange(booking.checkIn, booking.checkOut)} ·{" "}
            {nightsBetween(booking.checkIn, booking.checkOut)} nights
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <StatusBadge label={status.label} tone={status.tone} />
            <StatusBadge label={payment.label} tone={payment.tone} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10 sm:px-8">
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-gold/15">
          <p className="label-caps text-gold-700">Your stay</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Check-in", `${formatDateRange(booking.checkIn, booking.checkIn).split(" – ")[0]} from ${villa?.checkInTime}`],
              ["Check-out", `${formatDateRange(booking.checkOut, booking.checkOut).split(" – ")[0]} by ${villa?.checkOutTime}`],
              ["Guests", `${booking.adults} adults · ${booking.children} children`],
              ["Booking reference", booking.reference],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="label-caps">{label}</dt>
                <dd className="mt-1 text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
          <div className="flex items-center gap-2">
            <Wifi className="size-4 text-gold-400" aria-hidden />
            <p className="label-caps text-gold-400">Wi-Fi</p>
          </div>
          <p className="text-gold-gradient mt-4 font-display text-2xl">{villa?.wifiNetwork}</p>
          <hr className="rule-gold mt-3" />
          <p className="mt-3 font-mono text-sm tracking-wide text-sand">
            {villa?.wifiPassword}
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-gold/15">
          <p className="label-caps text-gold-700">Payment</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Total</dt>
              <dd className="tabular-nums text-ink">{money(totals.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Paid</dt>
              <dd className="tabular-nums text-ink">{money(totals.paid)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone/25 pt-2 font-medium">
              <dt className="text-ink">Balance due</dt>
              <dd className="tabular-nums text-clay">{money(totals.balance)}</dd>
            </div>
          </dl>
        </section>

        <p className="pt-2 text-sm text-stone-600">
          Food ordering, requests, the invoice and feedback arrive with Module 7.{" "}
          <Link to="/design-system" className="text-clay underline underline-offset-4">
            View the design system
          </Link>
        </p>
      </main>
    </div>
  );
}
