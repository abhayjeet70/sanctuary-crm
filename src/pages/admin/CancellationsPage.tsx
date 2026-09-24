import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Download, Landmark, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { useBookingViews, useMockData } from "@/hooks/useData";
import { downloadCsv } from "@/lib/csv";
import { formatDate, money } from "@/lib/format";
import { periodPresets } from "@/lib/periods";
import type { Refund, RefundStatus } from "@/types";

const STATE = {
  not_due: { label: "No refund due", tone: "completed" },
  pending: { label: "Refund owed", tone: "pending" },
  processed: { label: "Refunded", tone: "confirmed" },
} as const;

const METHODS = ["UPI", "Bank transfer", "Cash", "Card reversal", "Other"];

/**
 * Cancelled bookings and the money that goes back.
 *
 * Every row is the same `refunds` record the guest sees on their own booking,
 * so what staff mark as sent here is what the guest reads there.
 */
export default function CancellationsPage() {
  const { refunds, today } = useMockData();
  const views = useBookingViews();
  const presets = periodPresets(today);

  const [from, setFrom] = useState(presets[5].from);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<RefundStatus | "all">("all");
  const [paying, setPaying] = useState<Refund | null>(null);

  const rows = useMemo(
    () =>
      refunds
        .filter((r) => r.cancelledAt.slice(0, 10) >= from && r.cancelledAt.slice(0, 10) <= to)
        .filter((r) => status === "all" || r.status === status)
        .map((r) => ({ refund: r, view: views.find((v) => v.booking.id === r.bookingId) })),
    [refunds, views, from, to, status],
  );

  const sum = (f: (r: Refund) => number, only?: RefundStatus) =>
    rows.filter(({ refund }) => !only || refund.status === only).reduce((n, { refund }) => n + f(refund), 0);

  const exportCsv = () =>
    downloadCsv(`cancellations-${from}-to-${to}`, [
      ["Booking", "Guest", "Villa", "Check-in", "Check-out", "Cancelled on", "Cancelled by", "Days before", "Paid", "Refund %", "Refund", "Retained", "Status", "Method", "Reference", "Sent on", "Reason"],
      ...rows.map(({ refund: r, view: v }) => [
        v?.booking.reference, v?.customer?.name, v?.villa?.name,
        v?.booking.checkIn, v?.booking.checkOut, r.cancelledAt.slice(0, 10), r.cancelledByRole,
        r.daysBefore, r.amountPaid, r.refundPercent, r.refundAmount, r.retained,
        STATE[r.status].label, r.method, r.reference, r.processedAt?.slice(0, 10), r.reason,
      ]),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Cancellations & refunds"
        description="Every cancelled stay, what was paid, what is owed back and what has been sent."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download aria-hidden />
            Spreadsheet
          </Button>
        }
      />

      <section className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-from">Cancelled from</Label>
            <Input id="c-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-to">To</Label>
            <Input id="c-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={from === p.from && to === p.to ? "default" : "outline"}
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-status">Refund status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RefundStatus | "all")}>
              <SelectTrigger id="c-status" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Refund owed</SelectItem>
                <SelectItem value="processed">Refunded</SelectItem>
                <SelectItem value="not_due">No refund due</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cancellations" value={rows.length} icon={<Ban className="size-4" />} />
        <StatCard
          label="Refunds still owed"
          value={money(sum((r) => r.refundAmount, "pending"))}
          tone="warn"
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Refunded"
          value={money(sum((r) => r.refundAmount, "processed"))}
          icon={<Undo2 className="size-4" />}
        />
        <StatCard
          label="Kept as cancellation charges"
          value={money(sum((r) => r.retained))}
          tone="accent"
          icon={<Landmark className="size-4" />}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No cancellations in this period"
          description="Widen the dates, or change the status filter."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Cancelled</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Refund</TableHead>
                <TableHead className="text-right">Kept</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ refund: r, view: v }) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link to={`/admin/bookings/${r.bookingId}`} className="font-medium text-ink underline-offset-2 hover:underline">
                      {v?.booking.reference ?? "—"}
                    </Link>
                    <p className="text-xs text-stone-600">
                      {v?.villa?.name} · {v && formatDate(v.booking.checkIn)}
                    </p>
                  </TableCell>
                  <TableCell>{v?.customer?.name}</TableCell>
                  <TableCell>
                    {formatDate(r.cancelledAt.slice(0, 10))}
                    <p className="text-xs text-stone-600">
                      {r.daysBefore}d before · by {r.cancelledByRole === "guest" ? "guest" : "staff"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.amountPaid)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.refundAmount)}
                    <p className="text-xs text-stone-600">{r.refundPercent}%</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.retained)}</TableCell>
                  <TableCell>
                    <StatusBadge label={STATE[r.status].label} tone={STATE[r.status].tone} />
                    {r.status === "processed" && (
                      <p className="mt-1 text-xs text-stone-600">
                        {r.method}
                        {r.reference ? ` · ${r.reference}` : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <Button size="sm" onClick={() => setPaying(r)}>
                        Mark refunded
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {paying && <ProcessDialog refund={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ProcessDialog({ refund, onClose }: { refund: Refund; onClose: () => void }) {
  const { processRefund } = useMockData();
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await processRefund(refund.id, method, reference, note);
    setBusy(false);
    if (error) return toast.error("Could not record it", { description: error });
    toast.success(`${money(refund.refundAmount)} recorded as refunded`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record the refund of {money(refund.refundAmount)}</DialogTitle>
          <DialogDescription>
            Do this after you have sent the money. The guest sees it on their booking.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="r-method">Sent by</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="r-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-ref">Transaction / UTR (optional)</Label>
            <Input id="r-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-note">Note (optional)</Label>
            <Textarea id="r-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Mark as refunded"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
