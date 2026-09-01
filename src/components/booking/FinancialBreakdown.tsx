import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import type { BookingCharges } from "@/types";
import type { BookingTotals } from "@/services/domain";

/** BR6 — money is never shown as a single "amount". Every line the booking
 *  carries gets its own row, and the balance never renders negative. */
export function FinancialBreakdown({
  charges,
  totals,
  className,
  tone = "light",
}: {
  charges: BookingCharges;
  totals: BookingTotals;
  className?: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  const lines: { label: string; detail?: string; amount: number; muted?: boolean }[] = [
    {
      label: "Villa rate",
      detail: `${money(charges.nightlyRate)} × ${charges.nights} ${charges.nights === 1 ? "night" : "nights"}`,
      amount: totals.roomCharge,
    },
    ...(charges.weekendSurcharge
      ? [{ label: "Weekend surcharge", amount: charges.weekendSurcharge }]
      : []),
    ...(charges.seasonalSurcharge
      ? [{ label: "Seasonal surcharge", amount: charges.seasonalSurcharge }]
      : []),
    ...(charges.extraGuestCharge
      ? [{ label: "Extra guest charge", amount: charges.extraGuestCharge }]
      : []),
    ...(charges.food ? [{ label: "Food & beverage", amount: charges.food }] : []),
    ...(charges.addOns ? [{ label: "Add-ons", amount: charges.addOns }] : []),
    ...(charges.discount ? [{ label: "Discount", amount: -charges.discount }] : []),
  ];

  return (
    <dl className={cn("text-sm", className)}>
      {lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className={dark ? "text-sand/70" : "text-stone-600"}>
            {line.label}
            {line.detail && (
              <span className={cn("ml-2 text-xs", dark ? "text-sand/45" : "text-stone")}>
                {line.detail}
              </span>
            )}
          </dt>
          <dd
            className={cn(
              "shrink-0 tabular-nums",
              line.amount < 0
                ? "text-status-confirmed"
                : dark
                  ? "text-sand"
                  : "text-ink",
            )}
          >
            {line.amount < 0 ? `− ${money(-line.amount)}` : money(line.amount)}
          </dd>
        </div>
      ))}

      <div
        className={cn(
          "mt-2 flex items-baseline justify-between gap-4 border-t pt-3",
          dark ? "border-gold/25" : "border-stone/25",
        )}
      >
        <dt className={dark ? "text-sand/70" : "text-stone-600"}>Subtotal</dt>
        <dd className={cn("tabular-nums", dark ? "text-sand" : "text-ink")}>
          {money(totals.subtotal)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 py-1.5">
        <dt className={dark ? "text-sand/70" : "text-stone-600"}>
          GST
          <span className={cn("ml-2 text-xs", dark ? "text-sand/45" : "text-stone")}>
            {Math.round(charges.taxRate * 100)}%
          </span>
        </dt>
        <dd className={cn("tabular-nums", dark ? "text-sand" : "text-ink")}>{money(totals.tax)}</dd>
      </div>

      <div
        className={cn(
          "mt-2 flex items-baseline justify-between gap-4 border-t pt-3",
          dark ? "border-gold/40" : "border-gold/40",
        )}
      >
        <dt className={cn("label-caps", dark ? "text-gold-400" : "text-gold-700")}>Grand total</dt>
        <dd
          className={cn(
            "font-display text-2xl tabular-nums",
            dark ? "text-gold-gradient" : "text-ink",
          )}
        >
          {money(totals.total)}
        </dd>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <dt className={dark ? "text-sand/70" : "text-stone-600"}>Amount paid</dt>
        <dd className={cn("tabular-nums", dark ? "text-sand" : "text-ink")}>
          {money(totals.paid)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 py-1.5">
        <dt className={cn("font-medium", dark ? "text-sand" : "text-ink")}>Balance due</dt>
        <dd
          className={cn(
            "font-medium tabular-nums",
            totals.balance > 0 ? "text-clay" : "text-status-confirmed",
          )}
        >
          {totals.balance > 0 ? money(totals.balance) : "Settled"}
        </dd>
      </div>
    </dl>
  );
}
