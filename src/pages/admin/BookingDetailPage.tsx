import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Check,
  Download,
  LogIn,
  LogOut,
  Printer,
  StickyNote,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ActivityTimeline,
  EmptyState,
  ErrorState,
  Eyebrow,
  StatusBadge,
} from "@/components/common";
import { FinancialBreakdown } from "@/components/booking/FinancialBreakdown";
import { InvoiceDocument } from "@/components/booking/InvoiceDocument";
import { EmailGuestButton, GuestAccessPanel } from "@/components/booking/GuestAccessPanel";
import { SendBookingDetails } from "@/components/booking/SendBookingDetails";
import { ReceiptViewer } from "@/components/payment/ReceiptViewer";
import { RejectPaymentDialog } from "@/components/payment/RejectPaymentDialog";
import {
  useActivity,
  useBookingInvoice,
  useBookingPayments,
  useBookingView,
  useMockData,
} from "@/hooks/useData";
import { bookingSource, bookingStatus, paymentStatus, titleCase } from "@/lib/status";
import { formatDate, formatDateTime, money, nightsBetween } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingStatus, PaymentRejectionReason } from "@/types";

/** Which lifecycle moves are offered, given where the booking currently is. */
function nextActions(status: BookingStatus) {
  const checkIn = { to: "checked_in" as const, label: "Check in", icon: LogIn };
  const inHouse = { to: "in_house" as const, label: "Mark in-house", icon: LogIn };
  const checkOut = { to: "checked_out" as const, label: "Check out", icon: LogOut };
  const complete = { to: "completed" as const, label: "Mark completed", icon: Check };

  switch (status) {
    case "confirmed":
    case "payment_approved":
      return [checkIn];
    case "checked_in":
      return [inHouse, checkOut];
    case "in_house":
      return [checkOut];
    case "checked_out":
      return [complete];
    default:
      return [];
  }
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const view = useBookingView(id);
  const payments = useBookingPayments(id);
  const invoice = useBookingInvoice(id);
  const activity = useActivity(id);
  const { updateBooking, approvePayment, rejectPayment, logActivity } = useMockData();

  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"cancel" | "no_show" | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  if (!view) {
    return (
      <ErrorState
        title="Booking not found"
        description="It may have been removed, or the link is from an older build."
        action={
          <Button asChild variant="outline" className="mt-2">
            <Link to="/admin/bookings">Back to bookings</Link>
          </Button>
        }
      />
    );
  }

  const { booking, villa, customer, roomNames, totals } = view;
  const status = bookingStatus.get(booking.status);
  const pay = paymentStatus.get(booking.paymentStatus);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const rejecting = payments.find((p) => p.id === rejectingId);

  const move = (to: BookingStatus, label: string) => {
    updateBooking(booking.id, { status: to });
    logActivity(booking.id, "booking", label, `${customer?.name} · ${villa?.name}`);
    toast.success(`${label} · ${booking.reference}`);
  };

  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    updateBooking(booking.id, {
      internalNotes: booking.internalNotes ? `${booking.internalNotes}\n\n${text}` : text,
    });
    logActivity(booking.id, "note", "Internal note added", text);
    setNote("");
    toast.success("Note added to the booking");
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- header */}
      <div>
        <Button asChild variant="link" size="sm" className="mb-2 -ml-2">
          <Link to="/admin/bookings">
            <ArrowLeft aria-hidden />
            All bookings
          </Link>
        </Button>

        <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-gold/15">
          <div className="relative h-40 sm:h-48">
            <img src={villa?.image} alt="" aria-hidden className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/45 to-transparent" />
            <div className="absolute inset-x-6 bottom-5 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <Eyebrow className="text-gold-400">
                  {booking.reference} · {bookingSource[booking.source]}
                </Eyebrow>
                <h1 className="display-caps mt-2 text-3xl text-white sm:text-4xl">
                  {customer?.name}
                </h1>
                <p className="mt-1.5 text-sm text-sand/80">
                  {villa?.name}
                  {booking.bookingMode === "split" && roomNames.length > 0
                    ? ` · ${roomNames.join(", ")}`
                    : " · Whole villa"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={status.label} tone={status.tone} />
                <StatusBadge label={pay.label} tone={pay.tone} />
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------- actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-gold/15 bg-sand-200/40 px-6 py-4">
            {nextActions(booking.status).map(({ to, label, icon: Icon }) => (
              <Button key={to} size="sm" onClick={() => move(to, label)}>
                <Icon aria-hidden />
                {label}
              </Button>
            ))}
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/bookings/${booking.id}/edit`}>Edit booking</Link>
            </Button>
            {booking.status !== "cancelled" && booking.status !== "no_show" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-status-cancelled hover:bg-status-cancelled-bg"
                  onClick={() => setConfirming("no_show")}
                >
                  <UserX aria-hidden />
                  Mark no-show
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-status-cancelled hover:bg-status-cancelled-bg"
                  onClick={() => setConfirming("cancel")}
                >
                  <Ban aria-hidden />
                  Cancel booking
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- body */}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Tabs defaultValue="stay" className="min-w-0">
          <TabsList>
            <TabsTrigger value="stay">Stay</TabsTrigger>
            <TabsTrigger value="payments">
              Payments
              {payments.length > 0 && (
                <span className="ml-1.5 text-xs text-stone-600">{payments.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------- stay */}
          <TabsContent value="stay" className="space-y-6 pt-5">
            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <Eyebrow className="text-gold-700">Guest</Eyebrow>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Detail label="Name">
                  <Link
                    to={`/admin/customers/${customer?.id}`}
                    className="text-ink underline-offset-4 hover:text-clay hover:underline"
                  >
                    {customer?.name}
                  </Link>
                </Detail>
                <Detail label="Phone">{customer?.phone}</Detail>
                <Detail label="Email">{customer?.email}</Detail>
              </dl>

              <hr className="rule-gold my-6" />

              <Eyebrow className="text-gold-700">Stay</Eyebrow>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Detail label="Villa">{villa?.name}</Detail>
                <Detail label="Rooms">
                  {booking.bookingMode === "whole"
                    ? "Whole villa — all 4 bedrooms"
                    : roomNames.join(", ")}
                </Detail>
                <Detail label="Source">{bookingSource[booking.source]}</Detail>
                <Detail label="Check-in">
                  {formatDate(booking.checkIn)} from {villa?.checkInTime}
                </Detail>
                <Detail label="Check-out">
                  {formatDate(booking.checkOut)} by {villa?.checkOutTime}
                </Detail>
                <Detail label="Nights">{nights}</Detail>
                <Detail label="Adults">{booking.adults}</Detail>
                <Detail label="Children">{booking.children}</Detail>
                <Detail label="Booked">{formatDate(booking.createdAt.slice(0, 10))}</Detail>
              </dl>
            </section>

            {booking.specialRequests && (
              <section className="rounded-xl bg-status-uploaded-bg p-6">
                <Eyebrow>Special requests — from the guest</Eyebrow>
                <p className="mt-3 text-sm leading-relaxed text-ink">
                  {booking.specialRequests}
                </p>
              </section>
            )}

            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <Eyebrow className="text-gold-700">Internal notes</Eyebrow>
              {booking.internalNotes ? (
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink">
                  {booking.internalNotes}
                </p>
              ) : (
                <p className="mt-3 text-sm text-stone-600">
                  Nothing noted. Anything added here stays internal to the property.
                </p>
              )}

              <div className="mt-5 space-y-2">
                <Label htmlFor="booking-note">Add a note</Label>
                <Textarea
                  id="booking-note"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Guest called about an early check-in on the 12th."
                />
                <Button size="sm" onClick={addNote} disabled={!note.trim()}>
                  <StickyNote aria-hidden />
                  Add note
                </Button>
              </div>
            </section>
          </TabsContent>

          {/* --------------------------------------------------- payments */}
          <TabsContent value="payments" className="space-y-4 pt-5">
            {payments.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Nothing has been recorded against this booking. The guest sees payment instructions in the portal."
              />
            ) : (
              payments.map((payment) => {
                const state = paymentStatus.get(payment.status);
                return (
                  <section
                    key={payment.id}
                    className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-gold/12"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-display text-2xl tabular-nums text-ink">
                          {money(payment.amount)}
                        </p>
                        <p className="mt-1 text-sm text-stone-600">
                          {payment.method === "upi" ? "UPI" : "Bank transfer"}
                          {payment.reference ? (
                            <>
                              {" · "}
                              <span className="font-mono">{payment.reference}</span>
                            </>
                          ) : (
                            <span className="text-stone"> · no reference given</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-stone">
                          Uploaded {formatDateTime(payment.createdAt)}
                          {payment.verifiedAt &&
                            ` · reviewed ${formatDateTime(payment.verifiedAt)} by ${payment.verifiedBy}`}
                        </p>
                      </div>
                      <StatusBadge label={state.label} tone={state.tone} />
                    </div>

                    {payment.status === "rejected" && (
                      <div className="mt-4 rounded-lg bg-status-cancelled-bg p-3 text-sm">
                        <p className="font-medium text-ink">
                          Rejected — {titleCase(payment.rejectionReason ?? "other")}
                        </p>
                        {payment.rejectionNote && (
                          <p className="mt-1 text-stone-600">{payment.rejectionNote}</p>
                        )}
                      </div>
                    )}

                    <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
                      <ReceiptViewer
                        src={payment.receiptImage}
                        alt={`Receipt for ${money(payment.amount)} from ${customer?.name}`}
                        className="aspect-[3/4]"
                      />
                      {payment.status === "uploaded" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              approvePayment(payment.id);
                              toast.success(`Payment approved · ${money(payment.amount)}`);
                            }}
                          >
                            <Check aria-hidden />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setRejectingId(payment.id)}
                          >
                            <X aria-hidden />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </TabsContent>

          {/* ---------------------------------------------------- invoice */}
          <TabsContent value="invoice" className="space-y-4 pt-5">
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button size="sm" onClick={() => window.print()}>
                <Printer aria-hidden />
                Print
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Download aria-hidden />
                Save as PDF
              </Button>
              <EmailGuestButton
                bookingId={booking.id}
                kind="invoice_ready"
                label="Email to guest"
              />
            </div>
            <InvoiceDocument view={view} invoice={invoice} className="rounded-xl" />
          </TabsContent>

          {/* --------------------------------------------------- timeline */}
          <TabsContent value="timeline" className="pt-5">
            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
              <ActivityTimeline events={activity} />
            </section>
          </TabsContent>
        </Tabs>

        {/* ------------------------------------------------------- money rail */}
        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <Eyebrow className="text-gold-400">Financials</Eyebrow>
            <FinancialBreakdown
              charges={booking.charges}
              totals={totals}
              tone="dark"
              className="mt-4"
            />
          </section>

          <SendBookingDetails view={view} />

          <GuestAccessPanel bookingId={booking.id} guestEmail={customer?.email} />

          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
            <Eyebrow className="text-gold-700">Guest preferences</Eyebrow>
            {customer?.preferences.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {customer.preferences.map((preference) => (
                  <li
                    key={preference}
                    className="rounded-full bg-sand-200 px-2.5 py-1 text-xs text-ink"
                  >
                    {preference}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-stone-600">Nothing recorded.</p>
            )}
          </section>
        </aside>
      </div>

      {/* ------------------------------------------------------------ dialogs */}
      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming === "cancel"
                ? `Cancel ${booking.reference}?`
                : `Mark ${booking.reference} as a no-show?`}
            </DialogTitle>
            <DialogDescription>
              {confirming === "cancel"
                ? `${villa?.name} will be released for ${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)} and the guest notified. This cannot be undone.`
                : `${customer?.name} did not arrive. The inventory is released and the booking closes.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Keep the booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const to = confirming === "cancel" ? "cancelled" : "no_show";
                move(to, confirming === "cancel" ? "Booking cancelled" : "Marked as no-show");
                setConfirming(null);
              }}
            >
              {confirming === "cancel" ? "Cancel booking" : "Mark no-show"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rejecting && (
        <RejectPaymentDialog
          payment={rejecting}
          guestName={customer?.name}
          open
          onOpenChange={(open) => !open && setRejectingId(null)}
          onConfirm={(reason: PaymentRejectionReason, note?: string) => {
            rejectPayment(rejecting.id, reason, note);
            toast.error("Payment rejected", { description: note ?? titleCase(reason) });
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className={cn("mt-1 text-ink")}>{children}</dd>
    </div>
  );
}
