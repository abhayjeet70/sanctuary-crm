import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard, StatusBadge } from "@/components/common";
import { downloadCsv } from "@/lib/csv";
import { formatDate, money } from "@/lib/format";
import { bookingStatus } from "@/lib/status";
import type { BookingView } from "@/hooks/useData";
import type { Refund } from "@/types";

const CLOSED = ["cancelled", "rejected", "no_show"];

/**
 * Every booking in the period with what it earned, what came back and what the
 * property kept. A cancelled stay is never room revenue: its billed figure is
 * zero, and whatever the policy let the property keep shows as cancellation
 * income instead.
 */
export function BookingsReport({
  views,
  refunds,
  from,
  to,
}: {
  views: BookingView[];
  refunds: Refund[];
  from: string;
  to: string;
}) {
  const [show, setShow] = useState<"all" | "active" | "cancelled">("all");

  const rows = useMemo(
    () =>
      views
        .map((v) => {
          const refund = refunds.find((r) => r.bookingId === v.booking.id);
          const closed = CLOSED.includes(v.booking.status);
          const collected = refund ? refund.amountPaid : v.totals.paid;
          const refunded = refund?.refundAmount ?? 0;
          return {
            v,
            refund,
            closed,
            billed: closed ? 0 : v.totals.total,
            collected,
            refunded,
            kept: collected - refunded,
          };
        })
        .filter((r) => show === "all" || (show === "cancelled" ? r.closed : !r.closed))
        .sort((a, b) => b.v.booking.checkIn.localeCompare(a.v.booking.checkIn)),
    [views, refunds, show],
  );

  const total = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const cancelledCount = rows.filter((r) => r.closed).length;
  const cancellationIncome = total((r) => (r.closed ? r.kept : 0));

  const exportCsv = () =>
    downloadCsv(`bookings-${from}-to-${to}`, [
      ["Booking", "Guest", "Villa", "Check-in", "Check-out", "Nights", "Source", "Status", "Billed", "Collected", "Refunded", "Refund status", "Kept", "Cancellation income"],
      ...rows.map(({ v, refund, closed, billed, collected, refunded, kept }) => [
        v.booking.reference, v.customer?.name, v.villa?.name, v.booking.checkIn, v.booking.checkOut,
        v.booking.charges.nights, v.booking.source, bookingStatus.get(v.booking.status).label,
        billed, collected, refunded, refund?.status ?? "", kept, closed ? kept : 0,
      ]),
      ["Total", "", "", "", "", "", "", "", total((r) => r.billed), total((r) => r.collected), total((r) => r.refunded), "", total((r) => r.kept), cancellationIncome],
    ]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Bookings" value={rows.length} hint={`${cancelledCount} cancelled or closed`} />
        <StatCard label="Billed (earned stays)" value={money(total((r) => r.billed))} />
        <StatCard label="Collected" value={money(total((r) => r.collected))} tone="accent" />
        <StatCard label="Refunded" value={money(total((r) => r.refunded))} tone="warn" />
        <StatCard label="Cancellation income" value={money(cancellationIncome)} hint="kept from cancelled stays" />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {(["all", "active", "cancelled"] as const).map((k) => (
          <Button key={k} size="sm" variant={show === k ? "default" : "outline"} onClick={() => setShow(k)}>
            {k === "all" ? "All bookings" : k === "active" ? "Active & completed" : "Cancelled / closed"}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}>
          <Download aria-hidden />
          Download this table
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Stay</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="text-right">Kept</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ v, refund, billed, collected, refunded, kept }) => {
              const s = bookingStatus.get(v.booking.status);
              return (
                <TableRow key={v.booking.id}>
                  <TableCell>
                    <Link to={`/admin/bookings/${v.booking.id}`} className="font-medium underline-offset-2 hover:underline">
                      {v.booking.reference}
                    </Link>
                    <p className="text-xs text-stone-600">{v.customer?.name}</p>
                  </TableCell>
                  <TableCell>
                    {v.villa?.name}
                    <p className="text-xs text-stone-600">
                      {formatDate(v.booking.checkIn)} · {v.booking.charges.nights}n
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={s.label} tone={s.tone} />
                    {refund && refund.status === "pending" && (
                      <p className="mt-1 text-xs text-status-pending">refund owed</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(billed)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(collected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{refunded ? money(refunded) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(kept)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">Total</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(total((r) => r.billed))}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(total((r) => r.collected))}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(total((r) => r.refunded))}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(total((r) => r.kept))}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
