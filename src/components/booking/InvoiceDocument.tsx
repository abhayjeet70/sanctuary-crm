import { money, formatDate, formatDateRange, nightsBetween } from "@/lib/format";
import { logo } from "@/lib/assets";
import { useSettings, useTaxes } from "@/hooks/useData";
import { amountInWords, taxBreakdown } from "@/services/domain";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";
import type { Invoice } from "@/types";

/**
 * The printable tax invoice, shared by the admin booking detail and the guest
 * portal. Print styles live in `index.css` under `@media print`.
 *
 * Laid out to what an Indian tax invoice is expected to carry: both GSTINs,
 * the SAC of the service, the place of supply, the tax split into its
 * components, the total in words, and a declaration. The tax split follows
 * the place of supply — CGST + SGST when the guest's state matches the
 * property's, IGST when it does not.
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
  // Identity, tax numbers and payment details all come from Settings, so an
  // invoice can never disagree with what the guest was told to pay into.
  const settings = useSettings();
  const taxes = useTaxes();

  // Place of supply. Where we do not know the guest's state we assume our own,
  // which is the common case and the conservative one: CGST + SGST is what a
  // walk-in from Bengaluru should see.
  const homeState = (settings?.state ?? "Karnataka").trim().toLowerCase();
  const guestState = (customer?.state ?? "").trim().toLowerCase();
  const interState = guestState !== "" && guestState !== homeState;
  const placeOfSupply = customer?.state?.trim() || settings?.state || "Karnataka";

  const taxLines = taxBreakdown(totals.tax, booking.charges.taxRate, taxes, interState);

  return (
    <article
      className={cn("bg-white p-8 text-ink shadow-soft ring-1 ring-gold/15 sm:p-10", className)}
      aria-label={`Invoice for booking ${booking.reference}`}
      data-print-root
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <img src={logo.onLight} alt="Homes of Sanctuary" className="h-16 w-auto rounded-md" />
          <p className="mt-4 font-medium">{settings?.legalName ?? "Homes of Sanctuary"}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            {settings?.addressLine1 ?? "Nandi Hills"}
            {settings?.addressLine2 ? `, ${settings.addressLine2}` : ""}
            <br />
            {[settings?.city, settings?.state, settings?.postcode]
              .filter(Boolean)
              .join(", ") || "Chikkaballapur, Karnataka 562103"}
            <br />
            {settings?.country || "India"}
          </p>
          <dl className="mt-3 space-y-0.5 text-sm">
            {settings?.showGstinOnInvoice && settings.gstin && (
              <div className="flex gap-2">
                <dt className="text-stone-600">GSTIN</dt>
                <dd className="font-mono">{settings.gstin}</dd>
              </div>
            )}
            {settings?.pan && (
              <div className="flex gap-2">
                <dt className="text-stone-600">PAN</dt>
                <dd className="font-mono">{settings.pan}</dd>
              </div>
            )}
            {settings?.contactPhone && (
              <div className="flex gap-2">
                <dt className="text-stone-600">Phone</dt>
                <dd>{settings.contactPhone}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="text-right">
          <p className="label-caps text-gold-700">Tax invoice</p>
          <p className="mt-1 font-display text-2xl">{invoice?.number ?? "Draft"}</p>
          <dl className="mt-3 space-y-0.5 text-sm text-stone-600">
            <div className="flex justify-end gap-2">
              <dt>Invoice date</dt>
              <dd className="text-ink">
                {formatDate(invoice?.issuedAt ?? booking.createdAt.slice(0, 10))}
              </dd>
            </div>
            <div className="flex justify-end gap-2">
              <dt>Booking</dt>
              <dd className="text-ink">{booking.reference}</dd>
            </div>
            <div className="flex justify-end gap-2">
              <dt>Place of supply</dt>
              <dd className="text-ink">
                {placeOfSupply}
                {!interState && settings?.stateCode ? ` (${settings.stateCode})` : ""}
              </dd>
            </div>
            <div className="flex justify-end gap-2">
              <dt>SAC</dt>
              <dd className="font-mono text-ink">{settings?.hsnCode || "996311"}</dd>
            </div>
          </dl>
        </div>
      </header>

      <hr className="rule-gold my-8" />

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <p className="label-caps">Billed to</p>
          <p className="mt-2 font-medium">{customer?.name}</p>
          {customer?.email && <p className="text-sm text-stone-600">{customer.email}</p>}
          {customer?.phone && <p className="text-sm text-stone-600">{customer.phone}</p>}
          {(customer?.city || customer?.state) && (
            <p className="text-sm text-stone-600">
              {[customer?.city, customer?.state].filter(Boolean).join(", ")}
            </p>
          )}
        </section>

        <section className="sm:text-right">
          <p className="label-caps">Stay</p>
          <p className="mt-2 font-medium">{villa?.name}</p>
          <p className="text-sm text-stone-600">
            {booking.bookingMode === "whole" ? "Whole villa" : roomNames.join(", ") || "Rooms"}
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
          {taxLines.map((line) => (
            <tr key={line.label}>
              <th scope="row" className="py-1 text-right font-normal text-stone-600">
                {line.label}
              </th>
              <td className="py-1 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
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

      <p className="mt-6 rounded-lg bg-sand-200/60 p-3 text-sm">
        <span className="label-caps block text-gold-700">Total in words</span>
        <span className="mt-1 block">{amountInWords(totals.total)}</span>
      </p>

      <hr className="rule-gold my-8" />

      <div className="flex flex-wrap items-end justify-between gap-8">
        <p className="max-w-md text-xs leading-relaxed text-stone-600">
          {settings?.invoiceDeclaration ||
            "We declare that this invoice shows the actual price of the services described and that all particulars are true and correct."}
        </p>
        <div className="text-right">
          <p className="text-sm font-medium">
            For {settings?.legalName || "Homes of Sanctuary"}
          </p>
          <p className="mt-10 border-t border-stone/40 pt-1.5 text-xs text-stone-600">
            {settings?.signatoryName || "Authorised signatory"}
          </p>
        </div>
      </div>

      <hr className="rule-gold my-8" />

      <footer className="space-y-2 text-xs leading-relaxed text-stone-600">
        {(settings?.upiId || settings?.accountNumber) && (
          <p>
            Payment by
            {settings?.upiId && (
              <>
                {" "}
                UPI to <span className="font-mono text-ink">{settings.upiId}</span>
              </>
            )}
            {settings?.upiId && settings?.accountNumber && " or"}
            {settings?.accountNumber && (
              <>
                {" "}
                transfer to <span className="font-mono text-ink">{settings.accountNumber}</span>
                {settings.ifsc && (
                  <>
                    {" "}
                    (IFSC <span className="font-mono text-ink">{settings.ifsc}</span>)
                  </>
                )}
              </>
            )}
            . Please quote {booking.reference} so it can be matched.
          </p>
        )}
        {settings?.invoiceTerms && <p className="whitespace-pre-line">{settings.invoiceTerms}</p>}
        <p>
          {settings?.invoiceFooter ||
            [settings?.tradingName, settings?.addressLine1, settings?.city]
              .filter(Boolean)
              .join(" · ")}
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
