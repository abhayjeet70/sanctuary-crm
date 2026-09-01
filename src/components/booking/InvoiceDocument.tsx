import { money, formatDate, formatDateRange, nightsBetween } from "@/lib/format";
import { logo } from "@/lib/assets";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";
import type { Invoice } from "@/types";

/**
 * The printable invoice, shared by the admin booking detail and the guest
 * portal. Print styles live in `index.css` under `@media print`.
 */
export function InvoiceDocument({
  view,
  invoice,
  className,
}: {
  view: BookingView;
  invoice?: Invoice;
  className?: string;
}) {
  const { booking, villa, customer, roomNames, totals } = view;
  const nights = nightsBetween(booking.checkIn, booking.checkOut);

  return (
    <article
      className={cn("bg-white p-8 text-ink shadow-soft ring-1 ring-gold/15 sm:p-10", className)}
      aria-label={`Invoice for booking ${booking.reference}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <img src={logo.onLight} alt="Homes of Sanctuary" className="h-16 w-auto rounded-md" />
          <p className="mt-4 text-sm leading-relaxed text-stone-600">
            Homes of Sanctuary
            <br />
            Nandi Hills, Chikkaballapur
            <br />
            Karnataka 562103, India
          </p>
        </div>
        <div className="text-right">
          <p className="label-caps text-gold-700">Tax invoice</p>
          <p className="mt-1 font-display text-2xl">{invoice?.number ?? "Draft"}</p>
          <p className="mt-2 text-sm text-stone-600">
            Issued {formatDate(invoice?.issuedAt ?? booking.createdAt.slice(0, 10))}
          </p>
          <p className="text-sm text-stone-600">Booking {booking.reference}</p>
        </div>
      </header>

      <hr className="rule-gold my-8" />

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <p className="label-caps">Billed to</p>
          <p className="mt-2 font-medium">{customer?.name}</p>
          <p className="text-sm text-stone-600">{customer?.email}</p>
          <p className="text-sm text-stone-600">{customer?.phone}</p>
          <p className="text-sm text-stone-600">{customer?.city}</p>
        </section>
        <section>
          <p className="label-caps">Stay</p>
          <p className="mt-2 font-medium">{villa?.name}</p>
          <p className="text-sm text-stone-600">
            {booking.bookingMode === "whole"
              ? "Whole villa"
              : roomNames.join(", ") || "Rooms"}
          </p>
          <p className="text-sm text-stone-600">
            {formatDateRange(booking.checkIn, booking.checkOut)} · {nights}{" "}
            {nights === 1 ? "night" : "nights"}
          </p>
          <p className="text-sm text-stone-600">
            {booking.adults} adults
            {booking.children > 0 && ` · ${booking.children} children`}
          </p>
        </section>
      </div>

      <table className="mt-10 w-full text-sm">
        <caption className="sr-only">Charges for booking {booking.reference}</caption>
        <thead>
          <tr className="border-b border-gold/30 text-left">
            <th scope="col" className="label-caps pb-2">
              Description
            </th>
            <th scope="col" className="label-caps pb-2 text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone/15">
          <Line
            label={`${villa?.name} — ${booking.bookingMode === "whole" ? "whole villa" : roomNames.join(", ")}`}
            detail={`${money(booking.charges.nightlyRate)} × ${booking.charges.nights} nights`}
            amount={totals.roomCharge}
          />
          {booking.charges.weekendSurcharge > 0 && (
            <Line label="Weekend surcharge" amount={booking.charges.weekendSurcharge} />
          )}
          {booking.charges.seasonalSurcharge > 0 && (
            <Line label="Seasonal surcharge" amount={booking.charges.seasonalSurcharge} />
          )}
          {booking.charges.extraGuestCharge > 0 && (
            <Line label="Extra guest charge" amount={booking.charges.extraGuestCharge} />
          )}
          {booking.charges.food > 0 && (
            <Line label="Food & beverage" detail="In-villa dining" amount={booking.charges.food} />
          )}
          {booking.charges.addOns > 0 && <Line label="Add-ons" amount={booking.charges.addOns} />}
          {booking.charges.discount > 0 && (
            <Line label="Discount" amount={-booking.charges.discount} />
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-gold/30">
            <th scope="row" className="pt-3 text-right font-normal text-stone-600">
              Subtotal
            </th>
            <td className="pt-3 text-right tabular-nums">{money(totals.subtotal)}</td>
          </tr>
          <tr>
            <th scope="row" className="py-1 text-right font-normal text-stone-600">
              GST {Math.round(booking.charges.taxRate * 100)}%
            </th>
            <td className="py-1 text-right tabular-nums">{money(totals.tax)}</td>
          </tr>
          <tr className="border-t border-gold/40">
            <th scope="row" className="pt-3 text-right font-medium">
              Grand total
            </th>
            <td className="pt-3 text-right font-display text-xl tabular-nums">
              {money(totals.total)}
            </td>
          </tr>
          <tr>
            <th scope="row" className="py-1 text-right font-normal text-stone-600">
              Amount paid
            </th>
            <td className="py-1 text-right tabular-nums">{money(totals.paid)}</td>
          </tr>
          <tr>
            <th scope="row" className="text-right font-medium">
              Balance due
            </th>
            <td
              className={cn(
                "text-right font-medium tabular-nums",
                totals.balance > 0 ? "text-clay" : "text-status-confirmed",
              )}
            >
              {totals.balance > 0 ? money(totals.balance) : "Settled"}
            </td>
          </tr>
        </tfoot>
      </table>

      <hr className="rule-gold my-8" />

      <footer className="text-xs leading-relaxed text-stone-600">
        <p>
          Payment by UPI or bank transfer. Please quote {booking.reference} with your
          transfer so it can be matched.
        </p>
        <p className="mt-2">
          This is a mock invoice generated in the UI phase of the CRM and is not a
          valid tax document.
        </p>
      </footer>
    </article>
  );
}

function Line({
  label,
  detail,
  amount,
}: {
  label: string;
  detail?: string;
  amount: number;
}) {
  return (
    <tr>
      <td className="py-2.5">
        <span className="block">{label}</span>
        {detail && <span className="block text-xs text-stone-600">{detail}</span>}
      </td>
      <td
        className={cn(
          "py-2.5 text-right tabular-nums",
          amount < 0 && "text-status-confirmed",
        )}
      >
        {amount < 0 ? `− ${money(-amount)}` : money(amount)}
      </td>
    </tr>
  );
}
