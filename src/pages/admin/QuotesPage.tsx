import { Link } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { SendBookingDetails } from "@/components/booking/SendBookingDetails";
import { useBookingViews } from "@/hooks/useData";
import { bookingSource, bookingStatus } from "@/lib/status";
import { formatDateRange, money, nightsBetween, relativeTime } from "@/lib/format";

/**
 * A quote is a priced stay the guest has not paid for yet.
 *
 * There is no separate quote record on purpose: the booking already carries
 * the whole breakdown, and a quote that lives apart from the booking is a
 * second set of numbers to keep in step. A booking sitting at `inquiry` or
 * `pending_payment` *is* the quote; accepting it just moves it along.
 */
const QUOTE_STATES = ["inquiry", "pending_payment"] as const;

export default function QuotesPage() {
  const quotes = useBookingViews()
    .filter((v) => (QUOTE_STATES as readonly string[]).includes(v.booking.status))
    .sort((a, b) => b.booking.createdAt.localeCompare(a.booking.createdAt));

  const awaitingPayment = quotes.filter((v) => v.booking.status === "pending_payment");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Quotes"
        description="Priced stays the guest has not paid for yet — what is on the table, and what it is worth."
        actions={
          <Button asChild size="sm">
            <Link to="/admin/bookings/new">
              <Plus aria-hidden />
              New quote
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open quotes" value={quotes.length} icon={<FileText className="size-4" />} />
        <StatCard
          label="Accepted, unpaid"
          value={awaitingPayment.length}
          tone={awaitingPayment.length ? "warn" : "default"}
          hint="Waiting on a deposit"
        />
        <StatCard
          label="On the table"
          value={money(quotes.reduce((sum, v) => sum + v.totals.total, 0))}
        />
        <StatCard
          label="Average quote"
          value={
            quotes.length
              ? money(quotes.reduce((sum, v) => sum + v.totals.total, 0) / quotes.length)
              : money(0)
          }
        />
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="No open quotes"
          description="Every priced stay has either been paid for or let go."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/bookings/new">Price a stay</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {quotes.map((view) => {
            const { booking, villa, customer, totals } = view;
            const status = bookingStatus.get(booking.status);
            return (
              <article
                key={booking.id}
                className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/admin/bookings/${booking.id}`}
                      className="text-lg text-ink hover:text-clay-600"
                    >
                      {customer?.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-stone-600">
                      {villa?.name} · {formatDateRange(booking.checkIn, booking.checkOut)} ·{" "}
                      {nightsBetween(booking.checkIn, booking.checkOut)} nights
                    </p>
                  </div>
                  <StatusBadge label={status.label} tone={status.tone} />
                </div>

                <dl className="mt-4 space-y-1.5 text-sm">
                  <Line
                    label={`Villa rate × ${booking.charges.nights}`}
                    value={money(totals.roomCharge)}
                  />
                  {totals.surcharges > 0 && (
                    <Line label="Surcharges" value={money(totals.surcharges)} />
                  )}
                  {totals.extras > 0 && <Line label="Food & add-ons" value={money(totals.extras)} />}
                  {totals.discount > 0 && (
                    <Line label="Discount" value={`− ${money(totals.discount)}`} />
                  )}
                  <Line label="Tax" value={money(totals.tax)} />
                  <div className="flex items-baseline justify-between border-t border-ink/8 pt-2 font-medium text-ink">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{money(totals.total)}</dd>
                  </div>
                  {totals.paid > 0 && (
                    <Line label="Paid so far" value={money(totals.paid)} />
                  )}
                </dl>

                <p className="mt-3 text-xs text-stone-600">
                  {bookingSource[booking.source]} · quoted {relativeTime(booking.createdAt)} ·{" "}
                  {booking.reference}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/admin/bookings/${booking.id}`}>Open booking</Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/admin/bookings/${booking.id}/edit`}>Reprice</Link>
                  </Button>
                  <SendBookingDetails view={view} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-stone-600">
      <dt>{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
