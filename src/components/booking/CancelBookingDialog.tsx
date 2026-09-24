import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Hourglass, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/services/supabase/client";
import { toQuote } from "@/services/supabase/mappers";
import { useMockData, useWaitlist } from "@/hooks/useData";
import { policyFields, policyLines } from "@/lib/cancellation";
import { datesOverlap } from "@/services/domain";
import { formatDate, money } from "@/lib/format";
import type { BookingView } from "@/hooks/useData";
import type { CancellationQuote } from "@/types";

/**
 * Cancel a stay, and see what it costs first.
 *
 * Shared by the guest and by staff. The numbers are never worked out here —
 * they come from `cancellation_quote`, the same function `cancel_booking` uses,
 * so the warning on screen and the refund actually recorded cannot differ.
 * Staff additionally see who is waiting for the dates and may waive the fee.
 */
export function CancelBookingDialog({
  view,
  open,
  onOpenChange,
  role,
}: {
  view: BookingView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "guest" | "admin";
}) {
  const { booking, villa } = view;
  const { cancelBooking, settings } = useMockData();
  const waitlist = useWaitlist();

  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [waive, setWaive] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuote(null);
    setFailed(null);
    setWaive(false);
    setUnderstood(false);
    void supabase
      .rpc("cancellation_quote", { p_booking_id: booking.id })
      .then(({ data, error }) => {
        if (error) return setFailed(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setQuote(toQuote(row));
      });
  }, [open, booking.id]);

  const waiting = waitlist.filter(
    (w) =>
      w.status === "waiting" &&
      (!w.villaId || w.villaId === booking.villaId) &&
      datesOverlap(w.checkIn, w.checkOut, booking.checkIn, booking.checkOut),
  );

  const refund = quote ? (waive ? quote.amountPaid : quote.refundAmount) : 0;
  const kept = quote ? quote.amountPaid - refund : 0;

  const confirm = async () => {
    setBusy(true);
    const { error } = await cancelBooking(booking.id, reason.trim(), waive);
    setBusy(false);
    if (error) return toast.error("Could not cancel", { description: error });
    toast.success(`${booking.reference} cancelled`, {
      description: refund > 0 ? `${money(refund)} will be refunded.` : "No refund was due.",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel {booking.reference}?</DialogTitle>
          <DialogDescription>
            {villa?.name} · {formatDate(booking.checkIn)} to {formatDate(booking.checkOut)}
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p role="alert" className="rounded-xl bg-status-cancelled-bg p-3 text-sm text-ink">
            {failed}
          </p>
        ) : !quote ? (
          <p className="flex items-center gap-2 py-6 text-sm text-stone-600">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Working out the refund…
          </p>
        ) : !quote.canCancel ? (
          <p role="alert" className="rounded-xl bg-status-cancelled-bg p-3 text-sm text-ink">
            {quote.blockedReason ?? "This booking cannot be cancelled."}
          </p>
        ) : (
          <div className="space-y-4">
            {/* ------------------------------------------- the money */}
            <dl className="divide-y divide-ink/8 rounded-xl bg-sand-200/50 text-sm">
              <Row k="Paid so far" v={money(quote.amountPaid)} />
              <Row
                k={`Cancelling ${quote.daysBefore} ${quote.daysBefore === 1 ? "day" : "days"} before check-in`}
                v={quote.isFree ? "Free cancellation" : `${waive ? 100 : quote.refundPercent}% refund`}
              />
              {kept > 0 && <Row k="Kept as cancellation charge" v={`− ${money(kept)}`} tone="bad" />}
              <Row k="You get back" v={money(refund)} strong />
            </dl>

            {/* ------------------------------------------- consequences */}
            <div className="rounded-xl bg-status-pending-bg p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-ink">
                <AlertTriangle className="size-4 text-status-pending" aria-hidden />
                Before you go ahead
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-ink/85">
                <li>The dates are released straight away and can be booked by someone else.</li>
                <li>The booking voucher stops being valid.</li>
                {kept > 0 && (
                  <li>{money(kept)} is kept under the cancellation policy, as agreed at booking.</li>
                )}
                {refund > 0 ? (
                  <li>
                    {money(refund)} is returned to the account it was paid from once our team
                    sends it — you can follow its status here.
                  </li>
                ) : (
                  quote.amountPaid === 0 && <li>Nothing has been paid, so nothing is owed either way.</li>
                )}
                <li>This cannot be undone. A new stay would be a new booking at current availability.</li>
              </ul>
            </div>

            {policyLines(policyFields(villa?.cancellationPolicy, settings)).length > 0 && (
              <details className="text-xs text-stone-600">
                <summary className="cursor-pointer hover:text-ink">The cancellation policy</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {policyLines(settings).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
            )}

            {role === "admin" && waiting.length > 0 && (
              <p className="flex items-start gap-2 rounded-xl bg-status-confirmed-bg p-3 text-sm text-ink">
                <Hourglass className="mt-0.5 size-4 shrink-0 text-status-confirmed" aria-hidden />
                <span>
                  {waiting.length} {waiting.length === 1 ? "guest is" : "guests are"} waiting for
                  these dates. After cancelling, offer the villa from the{" "}
                  <Link to="/admin/waitlist" className="underline underline-offset-2">
                    waiting list
                  </Link>
                  .
                </span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Reason (optional)</Label>
              <Textarea
                id="cancel-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={role === "guest" ? "Plans changed" : "Guest requested by phone"}
              />
            </div>

            {role === "admin" && quote.amountPaid > 0 && quote.refundPercent < 100 && (
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={waive}
                  onChange={(e) => setWaive(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-clay)]"
                />
                Waive the cancellation charge and refund in full
              </label>
            )}

            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-clay)]"
              />
              I understand the above and want to cancel this booking.
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep the booking
          </Button>
          {quote?.canCancel && (
            <Button
              variant="destructive"
              disabled={!understood || busy}
              onClick={() => void confirm()}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {busy ? "Cancelling…" : "Cancel booking"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-stone-600">{k}</dt>
      <dd
        className={
          strong
            ? "font-display text-xl tabular-nums text-ink"
            : tone === "bad"
              ? "tabular-nums text-status-cancelled"
              : "tabular-nums text-ink"
        }
      >
        {v}
      </dd>
    </div>
  );
}
