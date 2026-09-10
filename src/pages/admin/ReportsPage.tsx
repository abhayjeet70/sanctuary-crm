import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, Coins, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Eyebrow, PageHeader, StatCard } from "@/components/common";
import { useBookingViews, useMockData, useTaxes, useVillas } from "@/hooks/useData";
import { monthlyFigures, occupancyRate, pct, taxBreakdown } from "@/services/domain";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { value: "12", label: "Last 12 months" },
  { value: "6", label: "Last 6 months" },
  { value: "3", label: "Last 3 months" },
  { value: "0", label: "Everything" },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const monthLabel = (month: string) => {
  const [year, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${year.slice(2)}`;
};

/**
 * Finances and reports.
 *
 * The owner's page. Everything here is a total across the book, which is
 * exactly what a manager does not get — see useShowsFinancials, and the route
 * guard that keeps them off it.
 *
 * Two numbers that are easy to confuse and are kept apart on purpose: what was
 * *billed* and what was *collected*. Only the second one pays wages.
 */
export default function ReportsPage() {
  const views = useBookingViews();
  const villas = useVillas();
  const taxes = useTaxes();
  const { payments, foodOrders, today } = useMockData();
  const [window, setWindow] = useState("12");

  const from = useMemo(() => {
    const months = Number(window);
    if (!months) return "0000-00";
    const d = new Date(`${today}T00:00:00`);
    d.setMonth(d.getMonth() - months + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [window, today]);

  const figures = useMemo(
    () =>
      monthlyFigures(
        views.map((v) => ({
          checkIn: v.booking.checkIn,
          status: v.booking.status,
          nights: v.booking.charges.nights,
          total: v.totals.total,
          tax: v.totals.tax,
          paid: v.totals.paid,
        })),
      ).filter((f) => f.month >= from),
    [views, from],
  );

  const totals = figures.reduce(
    (acc, f) => ({
      revenue: acc.revenue + f.revenue,
      tax: acc.tax + f.tax,
      collected: acc.collected + f.collected,
      nights: acc.nights + f.nights,
      bookings: acc.bookings + f.bookings,
    }),
    { revenue: 0, tax: 0, collected: 0, nights: 0, bookings: 0 },
  );

  const outstanding = totals.revenue - totals.collected;
  const days = figures.length * 30 || 1;
  const occupancy = occupancyRate(totals.nights, villas.length, days);
  const peak = [...figures].sort((a, b) => b.revenue - a.revenue)[0];

  // What was actually banked in the window, from approved receipts — a
  // different question from what the bookings say was paid.
  const approved = payments.filter((p) => p.status === "approved");
  const byMethod = approved.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});

  const foodRevenue = foodOrders
    .filter((o) => o.status === "billed")
    .reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.price * l.quantity, 0), 0);

  // Per villa, so the owner can see which house earns.
  const perVilla = villas
    .map((villa) => {
      const own = views.filter(
        (v) =>
          v.booking.villaId === villa.id &&
          v.booking.checkIn >= from &&
          v.booking.status !== "cancelled" &&
          v.booking.status !== "rejected" &&
          v.booking.status !== "inquiry",
      );
      return {
        villa,
        revenue: own.reduce((sum, v) => sum + v.totals.total, 0),
        nights: own.reduce((sum, v) => sum + v.booking.charges.nights, 0),
        bookings: own.length,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const taxLines = taxBreakdown(totals.tax, 0.18, taxes, false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The owner's view"
        title="Finances & reports"
        description="What the property billed, what it actually collected, and where it came from."
        actions={
          <div className="space-y-1.5">
            <Label htmlFor="report-window" className="sr-only">
              Period
            </Label>
            <Select value={window} onValueChange={setWindow}>
              <SelectTrigger id="report-window" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {figures.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="size-5" />}
          title="Nothing billed in this period"
          description="Widen the period, or take a booking."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Billed"
              value={money(totals.revenue)}
              hint={`${totals.bookings} stays`}
              icon={<Receipt className="size-4" />}
            />
            <StatCard label="Collected" value={money(totals.collected)} tone="accent" />
            <StatCard
              label="Outstanding"
              value={money(outstanding)}
              hint={outstanding > 0 ? "Still to come in" : "All settled"}
              tone={outstanding > 0 ? "warn" : "default"}
              icon={<Wallet className="size-4" />}
            />
            <StatCard
              label="Occupancy"
              value={pct(occupancy)}
              hint={`${totals.nights} room-nights`}
              icon={<BedDouble className="size-4" />}
            />
          </div>

          {/* ------------------------------------------------------ by month */}
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl text-ink">Month by month</h2>
              {peak && (
                <p className="text-sm text-stone-600">
                  Best month {monthLabel(peak.month)} · {money(peak.revenue)}
                </p>
              )}
            </div>
            <hr className="rule-gold my-4" />

            {/* A bar each, drawn in CSS. A chart library for six bars would be
                more to load than the page it sits on. */}
            <ul className="space-y-2">
              {figures.map((f) => {
                const share = peak?.revenue ? f.revenue / peak.revenue : 0;
                const collectedShare = f.revenue ? f.collected / f.revenue : 0;
                return (
                  <li key={f.month} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-stone-600">
                      {monthLabel(f.month)}
                    </span>
                    <span className="relative h-7 flex-1 overflow-hidden rounded-md bg-sand-200">
                      <span
                        className="absolute inset-y-0 left-0 bg-ink/15"
                        style={{ width: `${Math.round(share * 100)}%` }}
                        aria-hidden
                      />
                      <span
                        className="absolute inset-y-0 left-0 bg-gold/55"
                        style={{ width: `${Math.round(share * collectedShare * 100)}%` }}
                        aria-hidden
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink">
                      {money(f.revenue)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-gold/55" aria-hidden />
                Collected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-ink/15" aria-hidden />
                Billed but not yet in
              </span>
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* --------------------------------------------------- by villa */}
            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <Eyebrow className="text-gold-700">Which house earns</Eyebrow>
              <hr className="rule-gold my-4" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Villa</TableHead>
                    <TableHead className="text-center">Stays</TableHead>
                    <TableHead className="text-center">Nights</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perVilla.map(({ villa, revenue, nights, bookings }) => (
                    <TableRow key={villa.id}>
                      <TableCell>
                        <Link
                          to={`/admin/villas/${villa.id}`}
                          className="text-ink underline-offset-4 hover:text-clay hover:underline"
                        >
                          {villa.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{bookings}</TableCell>
                      <TableCell className="text-center tabular-nums">{nights}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            {/* ------------------------------------------------ tax and cash */}
            <div className="space-y-6">
              <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
                <Eyebrow className="text-gold-700">Tax collected</Eyebrow>
                <p className="mt-2 text-sm text-stone-600">
                  On what was billed in this period. For the return, not a substitute
                  for it.
                </p>
                <hr className="rule-gold my-4" />
                <ul className="space-y-1.5 text-sm">
                  {taxLines.map((line) => (
                    <li key={line.label} className="flex justify-between gap-4">
                      <span className="text-stone-600">{line.label}</span>
                      <span className="tabular-nums text-ink">{money(line.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-4 border-t border-gold/30 pt-2 font-medium">
                    <span>Total</span>
                    <span className="tabular-nums">{money(totals.tax)}</span>
                  </li>
                </ul>
              </section>

              <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
                <Eyebrow className="text-gold-400">How guests paid</Eyebrow>
                <p className="mt-1.5 text-xs text-sand/60">
                  Approved receipts, all time.
                </p>
                <hr className="rule-gold my-4 opacity-60" />
                {Object.keys(byMethod).length === 0 ? (
                  <p className="text-sm text-sand/60">Nothing approved yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {Object.entries(byMethod)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, amount]) => (
                        <li key={method} className="flex justify-between gap-4">
                          <span className="text-sand/70 capitalize">
                            {method.replace(/_/g, " ")}
                          </span>
                          <span className="tabular-nums">{money(amount)}</span>
                        </li>
                      ))}
                  </ul>
                )}
                {foodRevenue > 0 && (
                  <p className="mt-4 flex items-center justify-between gap-4 border-t border-gold/20 pt-3 text-sm">
                    <span className="flex items-center gap-2 text-sand/70">
                      <Coins className="size-4 text-gold-400" aria-hidden />
                      Kitchen, billed to rooms
                    </span>
                    <span className="tabular-nums">{money(foodRevenue)}</span>
                  </p>
                )}
              </section>
            </div>
          </div>

          <p className={cn("text-xs leading-relaxed text-stone-600")}>
            Revenue is counted against the month a stay checks in, and excludes
            cancelled, rejected and enquiry bookings. Occupancy treats each month as
            30 nights across {villas.length} villas, so a villa split into rooms can
            read above 100%.
          </p>

          <Button asChild variant="outline" size="sm">
            <Link to="/admin/invoices">Open the invoices</Link>
          </Button>
        </>
      )}
    </div>
  );
}
