import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, CheckCheck, Lock, X } from "lucide-react";
import { useSession } from "@/services/session";
import { Button } from "@/components/ui/button";
import { EmptyState, Eyebrow, PageHeader, StatusBadge } from "@/components/common";
import { ReceiptViewer } from "@/components/payment/ReceiptViewer";
import { RejectPaymentDialog } from "@/components/payment/RejectPaymentDialog";
import { FinancialBreakdown } from "@/components/booking/FinancialBreakdown";
import { useMockData, usePaymentVerificationQueue } from "@/hooks/useData";
import { bookingSource, paymentStatus, titleCase } from "@/lib/status";
import { formatDateRange, formatDateTime, money, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentRejectionReason } from "@/types";

const METHOD_LABEL = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
} as const;

export default function PaymentQueuePage() {
  const queue = usePaymentVerificationQueue();
  const { approvePayment, rejectPayment } = useMockData();
  const { session } = useSession();
  const isOwner = session?.role === "admin";
  // The queue shrinks as decisions are made, so the cursor is clamped where it
  // is read rather than corrected in an effect — no cascading render.
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);

  if (queue.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Nothing waiting"
          title="Payment verification"
          description="Receipts uploaded by guests land here for a decision."
        />
        <EmptyState
          icon={<CheckCheck className="size-5" />}
          title="The queue is clear"
          description="Every receipt has been approved or rejected. New uploads appear here immediately."
          action={
            <Button asChild variant="outline" className="mt-2">
              <Link to="/admin/bookings">
                Back to bookings
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const current = queue[Math.min(index, queue.length - 1)];
  const { payment, view } = current;
  const { booking, villa, customer, roomNames, totals } = view;

  // The amount is the single most common reason a receipt gets rejected, so the
  // mismatch is called out rather than left for the eye to catch.
  const expected = totals.balance;
  const mismatch = payment.amount !== expected;

  const approve = () => {
    approvePayment(payment.id);
    toast.success(`Payment approved · ${booking.reference}`, {
      description: `${money(payment.amount)} recorded. ${customer?.name} is now confirmed.`,
    });
  };

  const reject = (reason: PaymentRejectionReason, note?: string) => {
    rejectPayment(payment.id, reason, note);
    toast.error(`Payment rejected · ${booking.reference}`, {
      description: note ?? titleCase(reason),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${queue.length} awaiting a decision`}
        title="Payment verification"
        description="Newest first. Open the receipt, check the amount and the reference, then decide."
      />

      <div className="grid gap-6 xl:grid-cols-[19rem_1fr]">
        {/* ------------------------------------------------------- the queue */}
        <nav aria-label="Verification queue" className="xl:sticky xl:top-20 xl:self-start">
          <ol className="space-y-2">
            {queue.map((row, rowIndex) => {
              const active = rowIndex === Math.min(index, queue.length - 1);
              return (
                <li key={row.payment.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(rowIndex)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full rounded-xl bg-white p-3 text-left shadow-soft transition-all",
                      active
                        ? "ring-2 ring-gold"
                        : "ring-1 ring-ink/[0.06] hover:ring-gold/40",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {row.view.customer?.name}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-ink">
                        {money(row.payment.amount)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-600">
                      {row.view.villa?.name} · {row.view.booking.reference}
                    </p>
                    <p className="mt-1 text-xs text-stone">
                      Uploaded {relativeTime(row.payment.createdAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ------------------------------------------------------ the decision */}
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.07]">
            <header className="flex flex-wrap items-start justify-between gap-4 p-6 pb-4">
              <div className="min-w-0">
                <Eyebrow className="text-gold-700">
                  {booking.reference} · {bookingSource[booking.source]}
                </Eyebrow>
                <h2 className="mt-1.5 text-2xl text-ink">{customer?.name}</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {villa?.name}
                  {booking.bookingMode === "split" && roomNames.length > 0
                    ? ` · ${roomNames.join(", ")}`
                    : " · Whole villa"}{" "}
                  · {formatDateRange(booking.checkIn, booking.checkOut)}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {customer?.phone} · {customer?.email}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge {...paymentStatus.get(payment.status)} />
                <Button asChild variant="link" size="sm">
                  <Link to={`/admin/bookings/${booking.id}`}>
                    Full booking
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </header>

            <div className="grid gap-6 border-t border-gold/15 p-6 lg:grid-cols-2">
              {/* Receipt */}
              <div>
                <Eyebrow className="mb-3">Uploaded receipt</Eyebrow>
                <ReceiptViewer
                  src={payment.receiptImage}
                  alt={`Payment receipt from ${customer?.name} for ${booking.reference}`}
                  className="aspect-[3/4] max-h-96"
                />
              </div>

              {/* What the guest says, vs what is owed */}
              <div className="space-y-5">
                <div>
                  <Eyebrow className="mb-3">What the guest submitted</Eyebrow>
                  <dl className="space-y-2 text-sm">
                    <Field label="Amount">
                      <span
                        className={cn(
                          "font-display text-2xl tabular-nums",
                          mismatch ? "text-clay-600" : "text-ink",
                        )}
                      >
                        {money(payment.amount)}
                      </span>
                    </Field>
                    <Field label="Method">{METHOD_LABEL[payment.method]}</Field>
                    <Field label="Transaction / UTR">
                      {payment.reference ? (
                        <span className="font-mono text-sm">{payment.reference}</span>
                      ) : (
                        <span className="text-sm text-stone-600">
                          Not provided
                          <span className="ml-1.5 text-xs">
                            — match on the receipt and amount
                          </span>
                        </span>
                      )}
                    </Field>
                    <Field label="Uploaded">{formatDateTime(payment.createdAt)}</Field>
                  </dl>
                </div>

                {mismatch && (
                  <div
                    role="alert"
                    className="flex gap-3 rounded-xl bg-status-pending-bg p-4"
                  >
                    <AlertTriangle
                      className="mt-0.5 size-4 shrink-0 text-status-pending"
                      aria-hidden
                    />
                    <div className="text-sm">
                      <p className="font-medium text-ink">
                        This is {payment.amount > expected ? "more" : "less"} than the balance
                      </p>
                      <p className="mt-1 text-stone-600">
                        {money(expected)} is outstanding; the guest sent{" "}
                        {money(payment.amount)}. Approving records it as a part payment —
                        reject it if the amount is wrong.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-sand-200/60 p-4">
                  <Eyebrow className="mb-2">What is owed</Eyebrow>
                  <FinancialBreakdown charges={booking.charges} totals={totals} />
                </div>
              </div>
            </div>

            {booking.specialRequests && (
              <div className="border-t border-gold/15 px-6 py-4">
                <Eyebrow className="mb-1.5">Special requests</Eyebrow>
                <p className="text-sm text-stone-600">{booking.specialRequests}</p>
              </div>
            )}

            <footer className="flex flex-wrap items-center gap-3 border-t border-gold/15 bg-sand-200/50 p-6">
              {/* Accepting money is kept apart from taking the booking. The
                  RPC refuses anyone but the owner; this only avoids offering
                  a button that would fail. */}
              {isOwner ? (
                <>
                  <Button onClick={approve}>
                    <Check aria-hidden />
                    Approve {money(payment.amount)}
                  </Button>
                  <Button variant="destructive" onClick={() => setRejecting(true)}>
                    <X aria-hidden />
                    Reject
                  </Button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-stone-600">
                  <Lock className="size-4 shrink-0" aria-hidden />
                  The owner accepts or refuses payments. You can open the receipt and
                  check it against the booking.
                </p>
              )}
              {queue.length > 1 && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setIndex((i) => (i + 1) % queue.length)}
                >
                  Skip for now
                  <ArrowRight aria-hidden />
                </Button>
              )}
            </footer>
          </section>
        </div>
      </div>

      <RejectPaymentDialog
        payment={payment}
        guestName={customer?.name}
        open={rejecting}
        onOpenChange={setRejecting}
        onConfirm={reject}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-stone-600">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
