import { Link } from "react-router-dom";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { WaitlistBoard } from "@/components/admin/WaitlistBoard";
import { useBookingViews, useWaitlist } from "@/hooks/useData";
import { bookingSource } from "@/lib/status";
import { formatDateRange, money, nightsBetween, relativeTime } from "@/lib/format";

/**
 * Everyone who has asked about a stay but has not been given one yet.
 *
 * Two kinds sit here: an enquiry for dates that are free (a booking still at
 * `inquiry`), and an enquiry for dates that are already sold (a waitlist
 * entry). They are different problems — one needs a price, the other needs a
 * cancellation — so they are kept apart rather than merged into one list.
 */
export default function EnquiriesPage() {
  const enquiries = useBookingViews().filter((v) => v.booking.status === "inquiry");
  const waiting = useWaitlist().filter((e) => e.status === "waiting");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Enquiries"
        description="Every guest who has asked about a stay and is still waiting to hear back."
        actions={
          <Button asChild size="sm">
            <Link to="/admin/bookings/new">
              <Plus aria-hidden />
              New enquiry
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open enquiries"
          value={enquiries.length}
          icon={<MessageCircle className="size-4" />}
        />
        <StatCard label="On the waiting list" value={waiting.length} hint="Dates already sold" />
        <StatCard
          label="Potential value"
          value={money(enquiries.reduce((sum, v) => sum + v.totals.total, 0))}
          hint="If every open enquiry converts"
        />
        <StatCard
          label="Oldest"
          value={
            enquiries.length
              ? relativeTime(
                  [...enquiries].sort((a, b) =>
                    a.booking.createdAt.localeCompare(b.booking.createdAt),
                  )[0].booking.createdAt,
                )
              : "—"
          }
          tone={enquiries.length ? "warn" : "default"}
        />
      </div>

      <section
        aria-labelledby="open"
        className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
      >
        <h2 id="open" className="px-6 pt-5 pb-3 text-xl text-ink">
          Awaiting a reply
        </h2>
        {enquiries.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<MessageCircle className="size-5" />}
            title="Nothing outstanding"
            description="Every enquiry has been quoted or turned into a booking."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/bookings/new">Record an enquiry</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-ink/8">
            {enquiries.map(({ booking, villa, customer, totals }) => (
              <li key={booking.id}>
                <Link
                  to={`/admin/bookings/${booking.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-gold/6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{customer?.name}</p>
                      <StatusBadge label={bookingSource[booking.source]} tone="uploaded" />
                    </div>
                    <p className="mt-0.5 text-sm text-stone-600">
                      {villa?.name} · {formatDateRange(booking.checkIn, booking.checkOut)} ·{" "}
                      {nightsBetween(booking.checkIn, booking.checkOut)} nights ·{" "}
                      {booking.adults + booking.children} guests
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums text-ink">{money(totals.total)}</p>
                    <p className="text-xs text-stone-600">
                      asked {relativeTime(booking.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="waitlist" className="space-y-4">
        <h2 id="waitlist" className="text-xl text-ink">
          Waiting list
        </h2>
        <WaitlistBoard />
      </section>
    </div>
  );
}
