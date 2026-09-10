import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eyebrow } from "@/components/common";
import { BarList } from "@/components/charts/BarList";
import { Donut } from "@/components/charts/Donut";
import { groupRevenue, isEarned, leadTimeBuckets, type RevenueRow } from "@/services/domain";
import { money } from "@/lib/format";
import { titleCase } from "@/lib/status";

type Dimension = "villaId" | "source" | "status" | "month";

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "source", label: "booking source" },
  { value: "villaId", label: "villa" },
  { value: "status", label: "status" },
  { value: "month", label: "month" },
];

/**
 * "Bookings by —" and "Revenue by —", over the same cut of the book.
 *
 * Two questions of the same data that people genuinely ask separately: where
 * the *volume* comes from, and where the *money* comes from. They are rarely
 * the same answer — a channel can bring plenty of short cheap stays — which is
 * why they are two charts and not one with a toggle.
 */
export function FinanceAnalysis({
  rows,
  names,
}: {
  rows: RevenueRow[];
  /** Turns an id into something a person reads. */
  names: (dimension: Dimension, key: string) => string;
}) {
  const [byCount, setByCount] = useState<Dimension>("source");
  const [byMoney, setByMoney] = useState<Dimension>("villaId");

  // `month` is not a column on the row, so it is derived before grouping.
  const withMonth = rows.map((r) => ({ ...r, month: r.checkIn.slice(0, 7) }));
  const group = (d: Dimension) =>
    groupRevenue(withMonth as RevenueRow[], d as keyof RevenueRow).slice(0, 8);

  const counts = group(byCount);
  const revenue = group(byMoney);
  const lead = leadTimeBuckets(rows);
  const leadTotal = lead.reduce((n, b) => n + b.stays, 0);

  // Three slices, which is the cap that validates on every pair — beyond it a
  // donut stops being readable and this becomes a bar list.
  //
  // Earned stays only. Every other figure on this page excludes cancellations,
  // and a composition that quietly included them would disagree with the
  // totals directly above it.
  const earned = rows.filter((r) => isEarned(r.status));
  const composition = [
    {
      key: "rooms",
      label: "Accommodation",
      value: earned.reduce((n, r) => n + r.roomCharge + r.surcharges, 0),
    },
    { key: "food", label: "Food and beverage", value: earned.reduce((n, r) => n + r.food, 0) },
    { key: "extras", label: "Add-ons", value: earned.reduce((n, r) => n + r.addOns, 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Bookings by"
          value={byCount}
          onChange={setByCount}
          hint="How many stays each one brought."
        >
          <BarList
            data={counts.map((row) => ({
              key: row.key,
              label: names(byCount, row.key),
              value: row.stays,
              detail: `${row.nights} nights`,
            }))}
            format={(n) => `${n} ${n === 1 ? "stay" : "stays"}`}
          />
        </Panel>

        <Panel
          title="Revenue by"
          value={byMoney}
          onChange={setByMoney}
          hint="What each one actually billed."
        >
          <BarList
            data={revenue.map((row) => ({
              key: row.key,
              label: names(byMoney, row.key),
              value: row.gross,
              detail: `${row.stays} stays · ${row.nights} nights`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
          <Eyebrow className="text-gold-700">What the money is made of</Eyebrow>
          <p className="mt-2 text-sm text-stone-600">
            Before tax and before discounts.
          </p>
          <hr className="rule-gold my-4" />
          <Donut slices={composition} caption="Revenue composition" />
        </section>

        <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
          <Eyebrow className="text-gold-700">How far ahead people book</Eyebrow>
          <p className="mt-2 text-sm text-stone-600">
            A book full of last-minute arrivals cannot be sold at a shoulder rate three
            months out.
          </p>
          <hr className="rule-gold my-4" />
          <BarList
            data={lead.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              value: bucket.stays,
              detail: leadTotal
                ? `${Math.round((bucket.stays / leadTotal) * 100)}% of stays`
                : undefined,
            }))}
            format={(n) => `${n}`}
          />
        </section>
      </div>
    </div>
  );
}

function Panel({
  title,
  hint,
  value,
  onChange,
  children,
}: {
  title: string;
  hint: string;
  value: Dimension;
  onChange: (d: Dimension) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow className="text-gold-700">{title}</Eyebrow>
        <Select value={value} onValueChange={(v) => onChange(v as Dimension)}>
          <SelectTrigger
            className="h-7 w-auto gap-1 border-0 bg-sand-200 px-2.5 text-xs"
            aria-label={`${title} — choose how to group`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIMENSIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {titleCase(d.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-sm text-stone-600">{hint}</p>
      <hr className="rule-gold my-4" />
      {children}
    </section>
  );
}

export type { Dimension };
export { money };
