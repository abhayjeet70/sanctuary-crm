import { logo } from "@/lib/assets";
import { usePreferencesForBooking, useSettings } from "@/hooks/useData";
import { formatDate, money, nightsBetween } from "@/lib/format";
import { bookingStatus } from "@/lib/status";
import { stayTimes, toISODate } from "@/services/domain";
import { MEALS, OCCASIONS, label } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { lines } from "@/components/booking/StayInfo";
import { CalendarDays, Coffee, Home, IndianRupee, Phone, Ticket, User, Users, UtensilsCrossed } from "lucide-react";
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

  const arrangements = [
    ...(prefs?.occasions.map((o) => label(OCCASIONS, o)) ?? []),
    prefs?.allergies ? `Allergies noted: ${prefs.allergies}` : null,
    prefs?.dietaryNotes || null,
    prefs?.foodNotes || null,
    booking.specialRequests || null,
  ].filter(Boolean) as string[];

  const meals = prefs?.meals.length
    ? prefs.meals.map((m) => label(MEALS, m)).join(", ")
    : "À la carte — not included";
  const guests =
    `${booking.adults} ${booking.adults === 1 ? "Adult" : "Adults"}` +
    (booking.children > 0 ? ` + ${booking.children} ${booking.children === 1 ? "Child" : "Children"}` : "");
  const important = lines(settings?.importantInfo);

  const rows: [React.ElementType, string, React.ReactNode, string?][] = [
    [User, "Guest name", customer?.name, undefined],
    [Phone, "Phone number", customer?.phone || "—", undefined],
    [Home, "Villa", villa?.name, booking.bookingMode === "whole" ? "Whole villa" : roomNames.join(", ")],
    [CalendarDays, "Check-in date & time", formatDate(booking.checkIn), times.arrival],
    [CalendarDays, "Check-out date & time", formatDate(booking.checkOut), times.departure],
    [Users, "Number of guests", guests, `${nights} ${nights === 1 ? "night" : "nights"}`],
    totals.balance > 0
      ? [IndianRupee, "Total amount", money(totals.total), `Balance ${money(totals.balance)}`]
      : [IndianRupee, "Total amount paid", money(totals.paid), undefined],
    [UtensilsCrossed, "Meals", meals, undefined],
    [Coffee, "Breakfast", settings?.breakfastLine || "—", undefined],
    [Ticket, "Booking status", status.label, undefined],
  ];

  return (
    <article
      className={cn("bg-sand p-6 text-ink shadow-soft ring-1 ring-ink/[0.07] sm:p-10", className)}
      aria-label={`Booking voucher for ${booking.reference}`}
      data-print-root
    >
      <header className="text-center">
        <img src={logo.onLight} alt="Homes of Sanctuary" className="mx-auto h-20 w-auto" />
        <p className="mt-3 text-sm text-gold-700">
          at {settings?.addressLine1 ?? "Nandi Hills"}
        </p>
        <h2 className="display-caps mt-4 text-2xl text-forest sm:text-3xl">
          Booking confirmation voucher
        </h2>
        <hr className="rule-gold mx-auto my-4 max-w-xs" />
        <p className="mx-auto max-w-md text-sm leading-relaxed text-stone-600">
          Thank you for choosing {settings?.tradingName ?? "Homes of Sanctuary"}. We are
          delighted to confirm your booking details as below.
        </p>
        <p className="mt-2 text-xs text-stone-600">
          Reference {booking.reference} · Issued {formatDate(toISODate(new Date()))}
        </p>
      </header>

      <dl className="mt-6 overflow-hidden rounded-xl ring-1 ring-forest/30">
        {rows.map(([Icon, name, value, extra]) => (
          <div key={name} className="grid grid-cols-[42%_1fr] border-b border-sand/60 last:border-0">
            <dt className="flex items-center gap-2.5 bg-forest px-3 py-3 text-[11px] font-medium tracking-[0.12em] text-sand uppercase sm:px-4">
              <Icon className="size-4 shrink-0 text-gold-200" aria-hidden />
              {name}
            </dt>
            <dd className="flex flex-wrap items-center gap-x-3 bg-white px-3 py-3 text-sm font-medium sm:px-4">
              {name === "Booking status" ? (
                <span className="rounded bg-forest px-2.5 py-0.5 text-xs tracking-wider text-sand uppercase">
                  {value}
                </span>
              ) : (
                value
              )}
              {extra && <span className="text-xs font-normal text-stone-600">{extra}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {(times.arrivalArranged || times.departureArranged) && (
        <p className="mt-2 text-xs text-stone-600">Times shown were arranged with you.</p>
      )}

      {arrangements.length > 0 && (
        <section aria-label="Arrangements" className="mt-5 text-sm">
          <p className="label-caps text-gold-700">We have noted</p>
          <ul className="mt-1.5 space-y-1 leading-relaxed">
            {arrangements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-[1.3fr_1fr]">
        <section aria-label="Important information" className="rounded-xl border border-gold/40 bg-white/60 p-4">
          <p className="text-sm font-medium tracking-wide text-gold-700 uppercase">
            Important information
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
            <li>Standard check-in {times.arrival}, check-out {times.departure}</li>
            {important.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
        <p className="flex items-center justify-center rounded-xl border border-gold/40 bg-white/60 p-4 text-center font-display text-lg leading-snug text-forest italic">
          We look forward to hosting you for a peaceful and memorable stay.
        </p>
      </div>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-ink/10 pt-4 text-xs text-stone-600">
        <span>{[settings?.city, settings?.state].filter(Boolean).join(", ")}</span>
        {settings?.contactPhone && <span>{settings.contactPhone}</span>}
        {settings?.website && <span>{settings.website}</span>}
        {settings?.instagram && <span>{settings.instagram}</span>}
      </footer>
    </article>
  );
}
