import { logo } from "@/lib/assets";
import { usePreferencesForBooking, useSettings } from "@/hooks/useData";
import { formatDate, money, nightsBetween } from "@/lib/format";
import { bookingSource, bookingStatus, paymentStatus } from "@/lib/status";
import { stayTimes } from "@/services/domain";
import { CUISINES, DIETARY, MEALS, OCCASIONS, label } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";

/**
 * The booking voucher — what a guest is sent to say "yes, you are coming".
 *
 * Deliberately not the invoice. An invoice is a tax document that proves what
 * was charged; a voucher is the thing somebody shows at a gate and reads on
 * the drive up. So it leads with the villa and the hours, carries the
 * arrangements the kitchen and the desk have already been told about, and
 * keeps money to one honest line rather than a GST breakdown.
 *
 * Printing is the same machinery as the invoice: `data-print-root` is what
 * the print stylesheet reveals, which is how "Save as PDF" produces this page
 * and nothing around it.
 */
export function VoucherDocument({
  view,
  className,
}: {
  view: BookingView;
  className?: string;
}) {
  const { booking, villa, customer, roomNames, totals } = view;
  const settings = useSettings();
  const prefs = usePreferencesForBooking(booking.id);

  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  // What was agreed, not the villa's standard hours — a guest who arranged a
  // late arrival must not be handed a voucher contradicting it.
  const times = stayTimes(booking, villa);
  const status = bookingStatus.get(booking.status);
  const payment = paymentStatus.get(booking.paymentStatus);

  const dining = [
    prefs && prefs.dietary !== "none" ? DIETARY[prefs.dietary] : null,
    prefs?.meals.length ? prefs.meals.map((m) => label(MEALS, m)).join(", ") : null,
    prefs?.cuisines.length ? prefs.cuisines.map((c) => label(CUISINES, c)).join(", ") : null,
  ].filter(Boolean) as string[];

  const arrangements = [
    ...(prefs?.occasions.map((o) => label(OCCASIONS, o)) ?? []),
    prefs?.allergies ? `Allergies noted: ${prefs.allergies}` : null,
    prefs?.dietaryNotes || null,
    prefs?.foodNotes || null,
    booking.specialRequests || null,
  ].filter(Boolean) as string[];

  return (
    <article
      className={cn("bg-white p-8 text-ink shadow-soft ring-1 ring-ink/[0.07] sm:p-10", className)}
      aria-label={`Booking voucher for ${booking.reference}`}
      data-print-root
    >
      {/* ------------------------------------------------------------ head */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <img src={logo.onLight} alt="Homes of Sanctuary" className="h-16 w-auto rounded-md" />
          <p className="mt-4 font-medium">{settings?.tradingName ?? "Homes of Sanctuary"}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            {settings?.addressLine1 ?? "Nandi Hills"}
            {settings?.addressLine2 ? `, ${settings.addressLine2}` : ""}
            <br />
            {[settings?.city, settings?.state, settings?.postcode].filter(Boolean).join(" ")}
            {settings?.contactPhone && (
              <>
                <br />
                {settings.contactPhone}
              </>
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="label-caps text-gold-700">Booking voucher</p>
          <p className="mt-2 font-display text-3xl">{booking.reference}</p>
          <p className="mt-2 text-sm text-stone-600">
            Issued {formatDate(new Date().toISOString().slice(0, 10))}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sand-200 px-3 py-1 text-xs font-medium">
            <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
            {status.label}
          </p>
        </div>
      </header>

      <hr className="rule-gold my-8" />

      {/* ----------------------------------------------------------- guest */}
      <section aria-label="Guest">
        <p className="label-caps text-gold-700">Reserved for</p>
        <p className="mt-2 font-display text-2xl">{customer?.name}</p>
        <p className="mt-1 text-sm text-stone-600">
          {[customer?.phone, customer?.email].filter(Boolean).join(" · ")}
          {customer?.country && customer.country !== "India" && ` · ${customer.country}`}
        </p>
      </section>

      {/* ------------------------------------------------------------ stay */}
      <section aria-label="Your stay" className="mt-8 rounded-xl bg-sand-200/60 p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="label-caps text-gold-700">Arrive</p>
            <p className="mt-1.5 font-display text-xl">{formatDate(booking.checkIn)}</p>
            <p className="text-sm text-stone-600">
              From {times.arrival}
              {times.arrivalArranged && " — arranged with you"}
            </p>
          </div>
          <div>
            <p className="label-caps text-gold-700">Depart</p>
            <p className="mt-1.5 font-display text-xl">{formatDate(booking.checkOut)}</p>
            <p className="text-sm text-stone-600">
              By {times.departure}
              {times.departureArranged && " — arranged with you"}
            </p>
          </div>
        </div>

        <hr className="my-5 border-ink/10" />

        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-4">
          <Fact label="Villa">{villa?.name}</Fact>
          <Fact label={booking.bookingMode === "whole" ? "Bedrooms" : "Your rooms"}>
            {booking.bookingMode === "whole"
              ? `All ${villa?.bedrooms ?? 0}`
              : roomNames.join(", ") || "To be assigned"}
          </Fact>
          <Fact label="Nights">{nights}</Fact>
          <Fact label="Guests">
            {booking.adults} {booking.adults === 1 ? "adult" : "adults"}
            {booking.children > 0 && ` · ${booking.children} children`}
          </Fact>
        </dl>
      </section>

      {/* ---------------------------------------------------------- dining */}
      {dining.length > 0 && (
        <section aria-label="Dining" className="mt-8">
          <p className="label-caps text-gold-700">Dining</p>
          <ul className="mt-2 space-y-1 text-sm">
            {dining.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------- arrangements */}
      {arrangements.length > 0 && (
        <section aria-label="Arrangements" className="mt-6">
          <p className="label-caps text-gold-700">We have noted</p>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed">
            {arrangements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ----------------------------------------------------------- money */}
      <section aria-label="Amount" className="mt-8 rounded-xl border border-gold/35 p-6">
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-stone-600">Total for the stay, taxes included</dt>
            <dd className="font-display text-xl tabular-nums">{money(totals.total)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-stone-600">Received</dt>
            <dd className="tabular-nums">{money(totals.paid)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-ink/10 pt-2">
            <dt className="font-medium">
              {totals.balance > 0 ? "Balance due" : "Settled in full"}
            </dt>
            <dd className="font-medium tabular-nums">
              {totals.balance > 0 ? money(totals.balance) : "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-stone-600">
          Payment status: {payment.label}
          {totals.balance > 0 && settings?.upiId && (
            <>
              {" · "}Pay by UPI to {settings.upiId} quoting {booking.reference}, then upload
              the receipt in your guest portal.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-stone-600">
          A full tax invoice is issued separately. Booked via {bookingSource[booking.source]}.
        </p>
      </section>

      {/* ------------------------------------------------------- practical */}
      <section aria-label="Before you arrive" className="mt-8">
        <p className="label-caps text-gold-700">Before you arrive</p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-stone-600">
          <li>
            Please carry a government photo ID for every adult — we are required to record
            it at check-in.
          </li>
          <li>
            Check-in from {times.arrival}, check-out by {times.departure}. Tell us if your
            plans change and we will do what we can.
          </li>
          {villa?.wifiNetwork && (
            <li>Wi-Fi, amenities and the house directory are in your guest portal.</li>
          )}
          <li>
            The road up the last stretch is narrow. Daylight arrival is easier if you have
            the choice.
          </li>
          {settings?.contactPhone && (
            <li>Anything at all before you set off: {settings.contactPhone}.</li>
          )}
        </ul>
      </section>

      <hr className="rule-gold my-8" />

      <footer className="flex flex-wrap items-end justify-between gap-6 text-xs text-stone-600">
        <p className="max-w-sm leading-relaxed">
          This voucher confirms the reservation described above. Please bring it, or the
          booking reference, when you arrive.
        </p>
        <p className="text-right">
          {settings?.tradingName ?? "Homes of Sanctuary"}
          <br />
          {settings?.contactEmail}
        </p>
      </footer>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
