import { AlertTriangle } from "lucide-react";
import { Eyebrow } from "@/components/common";
import {
  agedReceivables,
  efficiencyRatios,
  hotelKpis,
  pct,
  revenueBreakdown,
  taxBreakdown,
  type RevenueRow,
  type TaxComponent,
} from "@/services/domain";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The statement pack.
 *
 * Laid out the way the lodging industry lays it out — revenue by operated
 * department, then the statistics beside it, then receivables — because a
 * report an accountant recognises is one they can check.
 *
 * It deliberately stops at Total Operating Revenue. A Summary Operating
 * Statement continues down through departmental expenses, undistributed
 * operating expenses, and Gross Operating Profit; this system holds none of
 * those — no food cost, no utilities, no laundry, no commissions. GOP and
 * GOPPAR computed from revenue and payroll alone would be invented numbers
 * wearing industry names, which is worse than leaving them out and saying so.
 */
export function OperatingStatement({
  rows,
  villas,
  days,
  months,
  monthlyPayroll,
  taxes,
  legalName,
  from,
  to,
  today,
}: {
  rows: RevenueRow[];
  villas: number;
  days: number;
  months: number;
  /** Null when no salaries are recorded — not zero. */
  monthlyPayroll: number | null;
  taxes: TaxComponent[];
  legalName: string;
  from: string;
  to: string;
  today: string;
}) {
  const revenue = revenueBreakdown(rows);
  const kpis = hotelKpis(rows, villas, days);
  const ratios = efficiencyRatios(rows, kpis.availableNights, monthlyPayroll, months);
  const aged = agedReceivables(rows, today);
  const taxLines = taxBreakdown(revenue.tax, 0.18, taxes, false);

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06] sm:p-8">
        <div className="text-center">
          <p className="font-display text-xl text-ink">{legalName}</p>
          <p className="label-caps mt-1 text-gold-700">Summary of operating revenue</p>
          <p className="mt-1 text-sm text-stone-600">
            {from} to {to} · {days} days
          </p>
        </div>

        <hr className="rule-gold my-6" />

        <table className="w-full text-sm">
          <caption className="sr-only">Operating revenue by department</caption>
          <tbody>
            <Head>Operating revenue</Head>
            <Line label="Rooms" amount={revenue.accommodation} indent />
            <Line label="Food and beverage" amount={revenue.food} indent />
            <Line label="Other operated departments" amount={revenue.addOns} indent />
            {revenue.discount > 0 && (
              <Line label="Less: discounts and allowances" amount={-revenue.discount} indent />
            )}
            <Total label="Total operating revenue" amount={revenue.net} />

            <Head>Taxes collected</Head>
            {taxLines.map((line) => (
              <Line key={line.label} label={line.label} amount={line.amount} indent />
            ))}
            <Total label="Gross billed to guests" amount={revenue.gross} />

            <Head>Settlement</Head>
            <Line label="Received against the period" amount={revenue.collected} indent />
            <Line label="Outstanding at close" amount={revenue.outstanding} indent />
          </tbody>
        </table>

        <p className="mt-6 flex items-start gap-3 rounded-lg bg-status-pending-bg p-4 text-xs leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />
          <span>
            <span className="block font-medium">This is the revenue half of the statement.</span>
            A full Summary Operating Statement continues through departmental expenses,
            undistributed operating expenses and Gross Operating Profit. This system
            records no costs — food, utilities, laundry, commissions — so GOP, GOPPAR and
            EBITDA are not shown rather than estimated. Everything above is measured, not
            modelled.
          </span>
        </p>
      </section>

      {/* --------------------------------------------------------- statistics */}
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06] sm:p-8">
        <Eyebrow className="text-gold-700">Statistics</Eyebrow>
        <hr className="rule-gold my-4" />

        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          <Group title="Occupancy and rate">
            <Stat label="Available nights" value={String(kpis.availableNights)} />
            <Stat label="Nights sold" value={String(kpis.roomNights)} />
            <Stat label="Occupancy" value={pct(kpis.occupancy)} />
            <Stat label="ADR" value={money(kpis.adr)} note="Rooms revenue ÷ nights sold" />
            <Stat label="RevPAR" value={money(kpis.revpar)} note="Rooms revenue ÷ available" />
            <Stat
              label="TRevPAR"
              value={money(ratios.trevpar)}
              note="All revenue ÷ available"
            />
          </Group>

          <Group title="Demand">
            <Stat label="Stays" value={String(kpis.stays)} />
            <Stat label="Average length of stay" value={`${kpis.alos.toFixed(1)} nights`} />
            <Stat label="Cancellations" value={String(kpis.cancelled)} />
            <Stat label="Cancellation rate" value={pct(kpis.cancellationRate)} />
            <Stat label="Discount rate" value={pct(ratios.discountRate)} note="Off list" />
          </Group>

          <Group title="Food and beverage">
            <Stat label="F&B revenue" value={money(revenue.food)} />
            <Stat
              label="Capture rate"
              value={pct(ratios.fbCaptureRate)}
              note="Stays that ordered"
            />
            <Stat label="Per occupied night" value={money(ratios.fbPerNight)} />
          </Group>

          <Group title="Cash">
            <Stat label="Collection rate" value={pct(ratios.collectionRate)} />
            <Stat
              label="Days sales outstanding"
              value={`${ratios.dso} days`}
              note="How long a rupee waits"
            />
            <Stat label="Outstanding" value={money(revenue.outstanding)} />
          </Group>

          <Group title="Labour">
            {ratios.payrollRatio === null ? (
              <p className="text-sm text-stone-600">
                No salaries recorded. Add them on an employee&rsquo;s record and payroll
                ratios appear here.
              </p>
            ) : (
              <>
                <Stat label="Payroll for the period" value={money((monthlyPayroll ?? 0) * months)} />
                <Stat
                  label="Payroll to revenue"
                  value={pct(ratios.payrollRatio)}
                  tone={ratios.payrollRatio > 0.35 ? "warn" : undefined}
                />
                <Stat
                  label="Labour cost per occupied night"
                  value={money(ratios.labourCpor ?? 0)}
                  note="The CPOR labour component"
                />
              </>
            )}
          </Group>
        </div>
      </section>

      {/* ------------------------------------------------------- receivables */}
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06] sm:p-8">
        <Eyebrow className="text-gold-700">Schedule of receivables</Eyebrow>
        <p className="mt-2 text-sm text-stone-600">
          Aged from check-out, which is when the bill falls due.
        </p>
        <hr className="rule-gold my-4" />
        <table className="w-full text-sm">
          <tbody>
            <Line label="Not yet due" amount={aged.notYetDue} indent />
            <Line label="1 to 30 days" amount={aged.upTo30} indent />
            <Line label="31 to 60 days" amount={aged.upTo60} indent />
            <Line label="Over 60 days" amount={aged.over60} indent danger={aged.over60 > 0} />
            <Total label="Total receivable" amount={revenue.outstanding} />
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <th
        colSpan={2}
        scope="colgroup"
        className="label-caps pt-5 pb-2 text-left text-gold-700"
      >
        {children}
      </th>
    </tr>
  );
}

function Line({
  label,
  amount,
  indent,
  danger,
}: {
  label: string;
  amount: number;
  indent?: boolean;
  danger?: boolean;
}) {
  return (
    <tr className="border-b border-stone/10">
      <th
        scope="row"
        className={cn(
          "py-2 text-left font-normal",
          indent && "pl-4",
          danger ? "text-status-cancelled" : "text-stone-600",
        )}
      >
        {label}
      </th>
      <td
        className={cn(
          "py-2 text-right tabular-nums",
          danger ? "font-medium text-status-cancelled" : "text-ink",
        )}
      >
        {amount < 0 ? `(${money(-amount)})` : money(amount)}
      </td>
    </tr>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-t-2 border-gold/40">
      <th scope="row" className="py-2.5 text-left font-medium text-ink">
        {label}
      </th>
      <td className="py-2.5 text-right font-display text-lg tabular-nums text-ink">
        {money(amount)}
      </td>
    </tr>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <dl className="mt-2 space-y-1.5">{children}</dl>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stone/10 pb-1.5">
      <dt className="text-sm text-stone-600">
        {label}
        {note && <span className="block text-xs text-stone">{note}</span>}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          tone === "warn" ? "font-medium text-clay-600" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
