import { money, formatDate, formatDateRange, nightsBetween } from "@/lib/format";
import { logo } from "@/lib/assets";
import { useSettings, useTaxes } from "@/hooks/useData";
import { amountInWords, taxBreakdown } from "@/services/domain";
import { cn } from "@/lib/utils";
import { lines } from "@/components/booking/StayInfo";
import { useSignatureUrl } from "@/hooks/useSignature";
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

  const signatureUrl = useSignatureUrl(settings?.signaturePath || undefined);

  const taxLines = taxBreakdown(totals.tax, booking.charges.taxRate, taxes, interState);

  // The charge lines, as the rows of the ledger: [description, qty, rate, amount].
  type Row = [string, string, number | null, number];
  const c = booking.charges;
  const items: Row[] = [
    [
      `Villa tariff — ${villa?.name} (${booking.bookingMode === "whole" ? "whole villa" : roomNames.join(", ") || "rooms"})`,
      `${nights} ${nights === 1 ? "night" : "nights"}`,
      c.nightlyRate,
      totals.roomCharge,
    ],
  ];
  if (c.weekendSurcharge > 0) items.push(["Weekend surcharge", "", null, c.weekendSurcharge]);
  if (c.seasonalSurcharge > 0) items.push(["Seasonal surcharge", "", null, c.seasonalSurcharge]);
  if (c.extraGuestCharge > 0) items.push(["Extra guest charge", "", null, c.extraGuestCharge]);
  if (c.food > 0) items.push(["Food bill", "", c.food, c.food]);
  if (c.addOns > 0) items.push(["Add-ons", "", c.addOns, c.addOns]);
  if (c.discount > 0) items.push(["Discount", "", null, -c.discount]);
  // The paper form always has ten lettered lines; blank ones are kept so the
  // printed page reads as the familiar ledger rather than a short receipt.
  const LINES = Math.max(10, items.length);
  const ledger: (Row | null)[] = Array.from({ length: LINES }, (_, i) => items[i] ?? null);

  const cell = "border border-ink/70 px-2 py-1 print:px-1.5 print:py-px";
  const num = "text-right tabular-nums";
  const plain = (n: number) => money(n).replace("₹", "");
  const mode = [settings?.upiId && "UPI", settings?.accountNumber && "Bank transfer (NEFT)"]
    .filter(Boolean)
    .join(" / ");
  const terms = lines(settings?.invoiceTerms || settings?.bookingPolicy).join(" ");
  const bank = [
    settings?.bankName,
    settings?.accountNumber && `Account No: ${settings.accountNumber}`,
    settings?.ifsc && `IFSC Code: ${settings.ifsc}`,
    settings?.upiId && `UPI: ${settings.upiId}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={cn("bg-white p-6 text-[13px] text-ink shadow-soft ring-1 ring-ink/[0.07] sm:p-8 print:text-[10.5px] print:leading-tight", className)}
      aria-label={`Invoice for booking ${booking.reference}`}
      data-print-root
    >
      <header className="mb-3 flex print:mb-1.5 items-center justify-center gap-4">
        <img src={logo.onLight} alt="Homes of Sanctuary" className="h-14 w-auto rounded-md print:h-9" />
        <h2 className="font-display text-2xl font-semibold tracking-wide uppercase sm:text-3xl print:text-xl">
          {settings?.legalName || "Homes of Sanctuary"}
        </h2>
      </header>

      <div className="border border-ink/70">
        <p className="border-b border-ink/70 bg-sand-300 py-1.5 text-center tracking-wide uppercase">
          Tax invoice
        </p>

        {/* ------------------------------------------------ parties and refs */}
        <div className="grid sm:grid-cols-2">
          <div className="border-b border-ink/70 sm:border-r sm:border-b-0">
            <p className="border-b border-ink/40 px-2 py-0.5 text-xs font-semibold italic underline">
              Exporter / Invoicer
            </p>
            <div className="space-y-0.5 px-3 py-2 leading-relaxed print:py-1">
              <p className="font-semibold">{settings?.legalName}</p>
              <p>
                {[settings?.addressLine1, settings?.addressLine2].filter(Boolean).join(", ")}
                <br />
                {[settings?.city, settings?.postcode].filter(Boolean).join(" - ")}
                <br />
                {[settings?.state, settings?.country].filter(Boolean).join(", ")}
              </p>
              {settings?.contactPhone && <p>Phone No : {settings.contactPhone}</p>}
              {settings?.showGstinOnInvoice && settings.gstin && <p>GSTIN : {settings.gstin}</p>}
            </div>
            <p className="border-y border-ink/40 px-2 py-0.5 text-xs font-semibold italic underline">
              Customer / Invoicee
            </p>
            <p className="px-3 py-2 font-semibold print:py-1">{customer?.name}</p>
          </div>

          <div>
            <Ref k="Invoice No" v={invoice?.number ?? "Draft"} bold />
            <Ref
              k="Invoice Date"
              v={formatDate(invoice?.issuedAt ?? booking.createdAt.slice(0, 10))}
            />
            <Ref k="Pan card" v={settings?.pan || "—"} bold />
            <Ref k="Stay Date" v={formatDateRange(booking.checkIn, booking.checkOut)} />
            <div className="px-3 py-2 text-right leading-relaxed print:py-1">
              <p>
                <span className="mr-3">Contact Person</span>
                <span className="text-ink-500">Name: {customer?.name}</span>
              </p>
              <p>
                <span className="mr-3">Email Id</span>
                <span className="text-ink-500">{customer?.email || "—"}</span>
              </p>
              <p>
                <span className="mr-3">Mobile no</span>
                <span className="text-ink-500">{customer?.phone || "—"}</span>
              </p>
              <p className="mt-1 text-xs text-stone-600">
                Booking {booking.reference} · Place of supply {placeOfSupply}
                {!interState && settings?.stateCode ? ` (${settings.stateCode})` : ""} · SAC{" "}
                {settings?.hsnCode || "996311"}
              </p>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------- transactions */}
        <table className="w-full border-collapse border-t border-ink/70">
          <caption className="sr-only">Charges for booking {booking.reference}</caption>
          <thead>
            <tr className="bg-sand-300">
              <th scope="col" className={cn(cell, "w-8")} />
              <th scope="col" className={cn(cell, "font-normal")}>Transaction details</th>
              <th scope="col" className={cn(cell, "w-20 font-normal")}>Qty</th>
              <th scope="col" className={cn(cell, "w-24 font-normal")}>Rate</th>
              <th scope="col" className={cn(cell, "w-32 font-normal")}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cell} />
              <td className={cn(cell, "text-center font-semibold uppercase")} colSpan={4}>
                {settings?.tradingName || "Homes of Sanctuary"}
              </td>
            </tr>
            {ledger.map((row, i) => (
              <tr key={i} className="h-6 print:h-[14px]">
                <td className={cn(cell, "text-center text-xs")}>({String.fromCharCode(97 + i)})</td>
                <td className={cell}>{row?.[0]}</td>
                <td className={cn(cell, "text-right")}>{row?.[1]}</td>
                <td className={cn(cell, num)}>{row?.[2] != null ? plain(row[2]) : ""}</td>
                <td className={cn(cell, num, row && row[3] < 0 && "text-status-confirmed")}>
                  {row ? plain(row[3]) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <Total k="Total" v={totals.subtotal} />
            {taxLines.map((t) => (
              <Total key={t.label} k={t.label} v={t.amount} />
            ))}
            <Total k="Grand Total" v={totals.total} strong />
            <Total k="Amount paid" v={totals.paid} />
            <Total k={totals.balance > 0 ? "Balance due" : "Balance"} v={totals.balance} />
          </tfoot>
        </table>

        {/* ---------------------------------------------- words and payment */}
        <dl className="border-t border-ink/70">
          <Pair k="Amount (in words) :" v={amountInWords(totals.total)} />
          <Pair k="Payment Terms :" v={terms || "—"} small />
          <Pair k="Mode of payment :" v={mode || "—"} />
          <Pair k="Name and address of the bank :" v={bank || "—"} small />
        </dl>

        {/* ---------------------------------------------------- declaration */}
        <div className="grid border-t border-ink/70 sm:grid-cols-[1.4fr_1fr]">
          <div className="border-b border-ink/70 sm:border-r sm:border-b-0">
            <p className="border-b border-ink/70 py-0.5 text-center text-xs font-semibold uppercase">
              Declaration
            </p>
            <p className="p-3 text-xs leading-relaxed print:p-1.5 print:text-[9.5px]">
              {settings?.invoiceDeclaration ||
                "We declare that the accommodation services mentioned in this invoice have been provided as stated. The information contained in this invoice is true and correct to the best of my knowledge, and the charges are in accordance with the agreed terms and conditions."}
            </p>
          </div>
          <div className="flex flex-col justify-between p-3 print:p-1.5">
            <p className="text-xs font-semibold uppercase">
              For {settings?.legalName || "Homes of Sanctuary"}
            </p>
            {signatureUrl ? (
              <img
                src={signatureUrl}
                alt="Authorised signature"
                className="mt-2 ml-auto max-h-16 w-auto max-w-full object-contain print:max-h-12"
              />
            ) : (
              <span className="mt-10 block print:mt-5" />
            )}
            <p className="mt-1 border-t border-ink/30 pt-1.5 text-right text-xs text-stone-600">
              {settings?.signatoryName || "Authorised signatory"}
            </p>
          </div>
        </div>
      </div>

      {settings?.invoiceFooter && (
        <p className="mt-3 text-center text-xs text-stone-600">{settings.invoiceFooter}</p>
      )}
    </article>
  );

  function Total({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
    return (
      <tr className={strong ? "font-semibold" : undefined}>
        <th scope="row" colSpan={4} className="border border-ink/70 px-2 py-1 text-right font-[inherit] print:py-px">
          {k}
        </th>
        <td className="border border-ink/70 px-2 py-1 text-right tabular-nums print:py-px">{plain(v)}</td>
      </tr>
    );
  }
}

function Ref({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="grid grid-cols-2 items-center border-b border-ink/40">
      <span className="bg-sand-200/70 px-3 py-2.5 text-right print:py-1">{k}</span>
      <span className={cn("px-3 py-2.5 print:py-1", bold && "font-semibold")}>{v}</span>
    </div>
  );
}

function Pair({ k, v, small }: { k: string; v: string; small?: boolean }) {
  return (
    <div className="grid grid-cols-[38%_1fr] border-b border-ink/70 last:border-b-0">
      <dt className="border-r border-ink/70 px-3 py-1.5 font-semibold print:py-0.5">{k}</dt>
      <dd className={cn("px-2 py-1.5 print:py-0.5", small && "text-xs leading-snug")}>{v}</dd>
    </div>
  );
}
