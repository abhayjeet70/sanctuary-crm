import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BedDouble,
  Coins,
  Download,
  Printer,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Eyebrow, PageHeader, StatCard } from "@/components/common";
import {
  useBookingViews,
  useCustomers,
  useMockData,
  useTaxes,
  useVillas,
} from "@/hooks/useData";
import {
  agedReceivables,
  daysBetween,
  groupRevenue,
  hotelKpis,
  isEarned,
  monthlyFigures,
  pct,
  revenueBreakdown,
  taxBreakdown,
  toISODate,
  type RevenueRow,
} from "@/services/domain";
import { downloadCsv } from "@/lib/csv";
import { money } from "@/lib/format";
import { titleCase } from "@/lib/status";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[Number(m.split("-")[1]) - 1]} ${m.slice(2, 4)}`;

/** Ranges a property actually asks for, the financial year included. */
function presets(today: string) {
  const d = new Date(`${today}T00:00:00`);
  const y = d.getFullYear();
  const startOfMonth = new Date(y, d.getMonth(), 1);
  const startOfLastMonth = new Date(y, d.getMonth() - 1, 1);
  const endOfLastMonth = new Date(y, d.getMonth(), 0);
  // India runs April to March, which is what the GST return is filed against.
  const fyStart = new Date(d.getMonth() >= 3 ? y : y - 1, 3, 1);

  return [
    { id: "mtd", label: "This month", from: toISODate(startOfMonth), to: today },
    {
      id: "last",
      label: "Last month",
      from: toISODate(startOfLastMonth),
      to: toISODate(endOfLastMonth),
    },
    { id: "fy", label: "Financial year to date", from: toISODate(fyStart), to: today },
    {
      id: "12m",
      label: "Last 12 months",
      from: toISODate(new Date(y - 1, d.getMonth(), d.getDate())),
      to: today,
    },
  ];
}

/**
 * Finances and reports — the owner's page.
 *
 * Stays are counted against the month they check in, and only stays that were
 * actually earned: a cancellation is not revenue no matter what was quoted.
 * "Billed" and "collected" are kept apart throughout, because only the second
 * one pays wages.
 */
export default function ReportsPage() {
  const views = useBookingViews();
  const villas = useVillas();
  const customers = useCustomers();
  const taxes = useTaxes();
  const { payments, foodOrders, settings, today } = useMockData();

  const ranges = presets(today);
  const [from, setFrom] = useState(ranges[2].from);
  const [to, setTo] = useState(today);

  const rows: RevenueRow[] = useMemo(
    () =>
      views
        .filter((v) => v.booking.checkIn >= from && v.booking.checkIn <= to)
        .map((v) => ({
          checkIn: v.booking.checkIn,
          checkOut: v.booking.checkOut,
          status: v.booking.status,
          source: v.booking.source,
          villaId: v.booking.villaId,
          customerId: v.booking.customerId,
          nights: v.booking.charges.nights,
          roomCharge: v.totals.roomCharge,
          surcharges: v.totals.surcharges,
          food: v.booking.charges.food,
          addOns: v.booking.charges.addOns,
          discount: v.booking.charges.discount,
          tax: v.totals.tax,
          total: v.totals.total,
          paid: v.totals.paid,
          balance: v.totals.balance,
        })),
    [views, from, to],
  );

  const days = daysBetween(from, to);
  const revenue = revenueBreakdown(rows);
  const kpis = hotelKpis(rows, villas.length, days);
  const aged = agedReceivables(rows, today);
  const figures = monthlyFigures(rows);
  const byVilla = groupRevenue(rows, "villaId");
  const bySource = groupRevenue(rows, "source");
  const byGuest = groupRevenue(rows, "customerId").slice(0, 5);
  const peak = [...figures].sort((a, b) => b.revenue - a.revenue)[0];
  const taxLines = taxBreakdown(revenue.tax, 0.18, taxes, false);

  const villaName = (id: string) => villas.find((v) => v.id === id)?.name ?? "—";
  const guestName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";

  const exportCsv = () => {
    const heading = [
      [settings?.legalName ?? "Homes of Sanctuary"],
      [`Financial report ${from} to ${to}`],
      [],
    ];

    const summary = [
      ["Summary"],
      ["Metric", "Value"],
      ["Stays", kpis.stays],
      ["Room nights", kpis.roomNights],
      ["Available nights", kpis.availableNights],
      ["Occupancy", pct(kpis.occupancy)],
      ["ADR", kpis.adr],
      ["RevPAR", kpis.revpar],
      ["Average length of stay", kpis.alos.toFixed(1)],
      ["Cancellations", kpis.cancelled],
      [],
      ["Revenue"],
      ["Accommodation", revenue.accommodation],
      ["Food and beverage", revenue.food],
      ["Add-ons", revenue.addOns],
      ["Discounts", -revenue.discount],
      ["Net of tax", revenue.net],
      ["Tax", revenue.tax],
      ["Gross billed", revenue.gross],
      ["Collected", revenue.collected],
      ["Outstanding", revenue.outstanding],
      [],
      ["Outstanding by age"],
      ["Not yet due", aged.notYetDue],
      ["Up to 30 days", aged.upTo30],
      ["31 to 60 days", aged.upTo60],
      ["Over 60 days", aged.over60],
      [],
      ["By month"],
      ["Month", "Stays", "Nights", "Billed", "Tax", "Collected"],
      ...figures.map((f) => [f.month, f.bookings, f.nights, f.revenue, f.tax, f.collected]),
      [],
      ["By villa"],
      ["Villa", "Stays", "Nights", "Billed"],
      ...byVilla.map((r) => [villaName(r.key), r.stays, r.nights, r.gross]),
      [],
      ["By source"],
      ["Source", "Stays", "Nights", "Billed"],
      ...bySource.map((r) => [titleCase(r.key), r.stays, r.nights, r.gross]),
      [],
      // Every stay behind the totals, so the numbers can be checked rather
      // than taken on trust.
      ["Every stay in the period"],
      [
        "Check-in", "Check-out", "Villa", "Guest", "Source", "Status",
        "Nights", "Accommodation", "Food", "Add-ons", "Discount",
        "Tax", "Gross", "Paid", "Balance",
      ],
      ...rows.map((r) => [
        r.checkIn, r.checkOut, villaName(r.villaId), guestName(r.customerId),
        titleCase(r.source), titleCase(r.status), r.nights,
        r.roomCharge + r.surcharges, r.food, r.addOns, r.discount,
        r.tax, r.total, r.paid, r.balance,
      ]),
    ];

    downloadCsv(`sanctuary-report-${from}-to-${to}.csv`, [...heading, ...summary]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The owner's view"
        title="Finances & reports"
        description="What the property billed, what it actually collected, and how it is trading."
      />

      {/* ------------------------------------------------------ the period */}
      <section className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className="w-44"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ranges.map((range) => (
              <Button
                key={range.id}
                variant={from === range.from && to === range.to ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFrom(range.from);
                  setTo(range.to);
                }}
              >
                {range.label}
              </Button>
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download aria-hidden />
              Spreadsheet
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden />
              PDF
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-stone-600">
          {days} days · stays counted against their check-in date. The spreadsheet is a
          CSV, which Excel, Numbers and Sheets all open directly; PDF goes through your
          browser's print dialog — choose "Save as PDF".
        </p>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="size-5" />}
          title="No stays in this period"
          description="Widen the dates, or pick one of the ranges above."
        />
      ) : (
        <div data-print-flow className="space-y-6">
          {/* Only shown on paper, where the screen's date picker is gone. */}
          <div className="hidden print:block">
            <h1 className="font-display text-2xl">
              {settings?.legalName ?? "Homes of Sanctuary"}
            </h1>
            <p className="text-sm text-stone-600">
              Financial report · {from} to {to}
            </p>
          </div>

          {/* ------------------------------------------------------ headline */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Gross billed"
              value={money(revenue.gross)}
              hint={`${kpis.stays} stays`}
              icon={<Receipt className="size-4" />}
            />
            <StatCard label="Collected" value={money(revenue.collected)} tone="accent" />
            <StatCard
              label="Outstanding"
              value={money(revenue.outstanding)}
              hint={revenue.outstanding > 0 ? "Still to come in" : "All settled"}
              tone={revenue.outstanding > 0 ? "warn" : "default"}
              icon={<Wallet className="size-4" />}
            />
            <StatCard
              label="Occupancy"
              value={pct(kpis.occupancy)}
              hint={`${kpis.roomNights} of ${kpis.availableNights} nights`}
              icon={<BedDouble className="size-4" />}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="ADR" value={money(kpis.adr)} hint="Per night sold" />
            <StatCard label="RevPAR" value={money(kpis.revpar)} hint="Per night available" />
            <StatCard
              label="Average stay"
              value={`${kpis.alos.toFixed(1)} nights`}
              hint={`${kpis.stays} stays`}
            />
            <StatCard
              label="Cancelled"
              value={kpis.cancelled}
              hint={`${pct(kpis.cancellationRate)} of all bookings`}
              tone={kpis.cancellationRate > 0.2 ? "warn" : "default"}
            />
          </div>

          {/* -------------------------------------------------- where it came */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <Eyebrow className="text-gold-700">Where the money came from</Eyebrow>
              <hr className="rule-gold my-4" />
              <ul className="space-y-1.5 text-sm">
                <Row label="Accommodation" amount={revenue.accommodation} />
                <Row label="Food and beverage" amount={revenue.food} />
                <Row label="Add-ons" amount={revenue.addOns} />
                {revenue.discount > 0 && (
                  <Row label="Discounts given" amount={-revenue.discount} />
                )}
                <li className="flex justify-between gap-4 border-t border-gold/30 pt-2">
                  <span className="text-stone-600">Net of tax</span>
                  <span className="tabular-nums text-ink">{money(revenue.net)}</span>
                </li>
                {taxLines.map((line) => (
                  <Row key={line.label} label={line.label} amount={line.amount} muted />
                ))}
                <li className="flex justify-between gap-4 border-t border-gold/40 pt-2 font-medium">
                  <span>Gross billed</span>
                  <span className="font-display text-lg tabular-nums">
                    {money(revenue.gross)}
                  </span>
                </li>
              </ul>
            </section>

            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <Eyebrow className="text-gold-700">Outstanding, by age</Eyebrow>
              <p className="mt-2 text-sm text-stone-600">
                Aged from check-out, which is when the bill falls due.
              </p>
              <hr className="rule-gold my-4" />
              <ul className="space-y-1.5 text-sm">
                <Row label="Not yet due" amount={aged.notYetDue} />
                <Row label="Up to 30 days" amount={aged.upTo30} />
                <Row label="31 to 60 days" amount={aged.upTo60} />
                <li className="flex justify-between gap-4">
                  <span className={aged.over60 > 0 ? "text-status-cancelled" : "text-stone-600"}>
                    Over 60 days
                  </span>
                  <span
                    className={`tabular-nums ${aged.over60 > 0 ? "font-medium text-status-cancelled" : "text-ink"}`}
                  >
                    {money(aged.over60)}
                  </span>
                </li>
                <li className="flex justify-between gap-4 border-t border-gold/30 pt-2 font-medium">
                  <span>Total owed</span>
                  <span className="tabular-nums">{money(revenue.outstanding)}</span>
                </li>
              </ul>
              {aged.over60 > 0 && (
                <p role="alert" className="mt-4 rounded-lg bg-status-cancelled-bg p-3 text-sm text-ink">
                  {money(aged.over60)} has been owed for more than two months.
                </p>
              )}
            </section>
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

          {/* ------------------------------------------------- the breakdowns */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Breakdown
              title="Which house earns"
              head="Villa"
              rows={byVilla.map((r) => ({ ...r, label: villaName(r.key) }))}
            />
            <Breakdown
              title="Where bookings come from"
              head="Source"
              rows={bySource.map((r) => ({ ...r, label: titleCase(r.key) }))}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <Eyebrow className="text-gold-700">Best guests in this period</Eyebrow>
              <hr className="rule-gold my-4" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="text-center">Stays</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byGuest.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <Link
                          to={`/admin/customers/${r.key}`}
                          className="text-ink underline-offset-4 hover:text-clay hover:underline"
                        >
                          {guestName(r.key)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{r.stays}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.gross)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
              <Eyebrow className="text-gold-400">How guests paid</Eyebrow>
              <p className="mt-1.5 text-xs text-sand/60">Approved receipts, all time.</p>
              <hr className="rule-gold my-4 opacity-60" />
              <ul className="space-y-2 text-sm">
                {Object.entries(
                  payments
                    .filter((p) => p.status === "approved")
                    .reduce<Record<string, number>>((acc, p) => {
                      acc[p.method] = (acc[p.method] ?? 0) + p.amount;
                      return acc;
                    }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount]) => (
                    <li key={method} className="flex justify-between gap-4">
                      <span className="text-sand/70">{titleCase(method)}</span>
                      <span className="tabular-nums">{money(amount)}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-4 flex items-center justify-between gap-4 border-t border-gold/20 pt-3 text-sm">
                <span className="flex items-center gap-2 text-sand/70">
                  <Coins className="size-4 text-gold-400" aria-hidden />
                  Kitchen, billed to rooms
                </span>
                <span className="tabular-nums">
                  {money(
                    foodOrders
                      .filter((o) => o.status === "billed")
                      .reduce(
                        (sum, o) => sum + o.lines.reduce((n, l) => n + l.price * l.quantity, 0),
                        0,
                      ),
                  )}
                </span>
              </p>
            </section>
          </div>

          <p className="text-xs leading-relaxed text-stone-600">
            Revenue counts a stay against its check-in date and excludes cancelled,
            rejected, no-show and enquiry bookings — {rows.filter((r) => !isEarned(r.status)).length}{" "}
            of the {rows.length} bookings in this period. Available nights are{" "}
            {villas.length} villas × {days} days, so a villa let by the room can read
            above 100%. ADR counts accommodation only; dinner is not a room rate.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <li className="flex justify-between gap-4">
      <span className={muted ? "text-stone-600" : "text-stone-600"}>{label}</span>
      <span className="tabular-nums text-ink">
        {amount < 0 ? `− ${money(-amount)}` : money(amount)}
      </span>
    </li>
  );
}

function Breakdown({
  title,
  head,
  rows,
}: {
  title: string;
  head: string;
  rows: { key: string; label: string; gross: number; stays: number; nights: number }[];
}) {
  const top = rows[0]?.gross ?? 0;
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <Eyebrow className="text-gold-700">{title}</Eyebrow>
      <hr className="rule-gold my-4" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{head}</TableHead>
            <TableHead className="text-center">Stays</TableHead>
            <TableHead className="text-center">Nights</TableHead>
            <TableHead className="text-right">Billed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                <span className="block text-ink">{row.label}</span>
                <span
                  className="mt-1 block h-1 rounded-full bg-gold/45"
                  style={{ width: `${top ? Math.round((row.gross / top) * 100) : 0}%` }}
                  aria-hidden
                />
              </TableCell>
              <TableCell className="text-center tabular-nums">{row.stays}</TableCell>
              <TableCell className="text-center tabular-nums">{row.nights}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.gross)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
