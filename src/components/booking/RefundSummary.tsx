import { Eyebrow, StatusBadge } from "@/components/common";
import { formatDate, money } from "@/lib/format";
import type { Refund } from "@/types";

/** What to print where a cancelled booking would otherwise say "Paid in full". */
export function refundBadge(refund: Refund): { label: string; tone: "pending" | "confirmed" | "completed" } {
  if (refund.status === "pending") return { label: "Refund pending", tone: "pending" };
  if (refund.status === "processed") {
    return { label: refund.refundAmount >= refund.amountPaid ? "Refunded" : "Part refunded", tone: "confirmed" };
  }
  return { label: refund.retained > 0 ? "Cancellation charge applied" : "Nothing to refund", tone: "completed" };
}

const STATE = {
  not_due: { label: "No refund due", tone: "completed" },
  pending: { label: "Refund pending", tone: "pending" },
  processed: { label: "Refunded", tone: "confirmed" },
} as const;

/** What happened to the money when a booking was cancelled. Same card for the
 *  guest and for staff, so both are reading one record. */
export function RefundSummary({ refund, audience }: { refund: Refund; audience: "guest" | "admin" }) {
  const state = STATE[refund.status];
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow className="text-gold-700">Cancellation &amp; refund</Eyebrow>
        <StatusBadge label={state.label} tone={state.tone} />
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Item k="Cancelled" v={`${formatDate(refund.cancelledAt.slice(0, 10))} · by ${refund.cancelledByRole === "guest" ? (audience === "guest" ? "you" : "the guest") : "our team"}`} />
        <Item k="Days before check-in" v={String(refund.daysBefore)} />
        <Item k="Paid" v={money(refund.amountPaid)} />
        <Item k={`Refund (${refund.refundPercent}%)`} v={money(refund.refundAmount)} strong />
        {refund.retained > 0 && <Item k="Kept as cancellation charge" v={money(refund.retained)} />}
        {refund.feeWaived && <Item k="Charge" v="Waived by our team" />}
      </dl>

      {refund.reason && <p className="mt-3 text-sm text-stone-600">Reason: {refund.reason}</p>}

      <p className="mt-3 text-sm text-stone-600">
        {refund.status === "pending" &&
          (audience === "guest"
            ? "Our team will send your refund and mark it here once it is on its way."
            : "Send the money, then record it from Cancellations & refunds.")}
        {refund.status === "processed" &&
          `Sent ${refund.processedAt ? formatDate(refund.processedAt.slice(0, 10)) : ""} by ${refund.method}${refund.reference ? ` · ref ${refund.reference}` : ""}.`}
        {refund.status === "not_due" && "Nothing had been paid, or the policy returns nothing at this point."}
      </p>
    </section>
  );
}

function Item({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-stone-600">{k}</dt>
      <dd className={strong ? "font-display text-lg tabular-nums text-ink" : "text-ink"}>{v}</dd>
    </div>
  );
}
