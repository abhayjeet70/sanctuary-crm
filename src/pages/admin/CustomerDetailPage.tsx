import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ActivityTimeline,
  EmptyState,
  ErrorState,
  Eyebrow,
  StatCard,
  StatusBadge,
} from "@/components/common";
import {
  useBookingViews,
  useCustomerStats,
  useFeedbackViews,
  useMockData,
  useRequestViews,
} from "@/hooks/useData";
import { CustomerDialog } from "@/components/admin/CustomerDialog";
import { bookingStatus, paymentStatus, requestStatus, titleCase } from "@/lib/status";
import { formatDate, formatDateRange, initials, money } from "@/lib/format";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const stats = useCustomerStats(id);
  const views = useBookingViews();
  const requests = useRequestViews();
  const feedback = useFeedbackViews();
  const { invoices, activity } = useMockData();
  const [editing, setEditing] = useState(false);

  if (!stats) {
    return (
      <ErrorState
        title="Guest not found"
        action={
          <Button asChild variant="outline" className="mt-2">
            <Link to="/admin/customers">Back to guests</Link>
          </Button>
        }
      />
    );
  }

  const { customer, bookingCount, spend, lastStay } = stats;
  const own = views.filter((v) => v.booking.customerId === customer.id);
  const ownIds = new Set(own.map((v) => v.booking.id));
  const ownRequests = requests.filter((r) => r.request.customerId === customer.id);
  const ownFeedback = feedback.filter((f) => f.entry.customerId === customer.id);
  const ownInvoices = invoices.filter((i) => ownIds.has(i.bookingId));
  const ownActivity = activity
    .filter((event) => ownIds.has(event.entityId))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <Button asChild variant="link" size="sm" className="-ml-2">
        <Link to="/admin/customers">
          <ArrowLeft aria-hidden />
          All guests
        </Link>
      </Button>

      {/* ------------------------------------------------------------ header */}
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/15">
        <div className="flex flex-wrap items-start gap-5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xl text-gold-700">
            {initials(customer.name)}
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow className="text-gold-700">Guest</Eyebrow>
            <h1 className="display-caps mt-1.5 text-3xl text-ink">{customer.name}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-600">
              <a
                href={`tel:${customer.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-1.5 hover:text-clay"
              >
                <Phone className="size-3.5" aria-hidden />
                {customer.phone}
              </a>
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-1.5 hover:text-clay"
              >
                <Mail className="size-3.5" aria-hidden />
                {customer.email}
              </a>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden />
                {customer.city}
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        </div>

        {editing && (
          <CustomerDialog customer={customer} onClose={() => setEditing(false)} />
        )}

        {customer.preferences.length > 0 && (
          <>
            <hr className="rule-gold my-5" />
            <Eyebrow className="mb-2">Preferences</Eyebrow>
            <ul className="flex flex-wrap gap-2">
              {customer.preferences.map((preference) => (
                <li
                  key={preference}
                  className="rounded-full bg-sand-200 px-3 py-1.5 text-sm text-ink"
                >
                  {preference}
                </li>
              ))}
            </ul>
          </>
        )}

        {customer.notes && (
          <p className="mt-5 rounded-lg bg-status-uploaded-bg p-4 text-sm text-ink">
            {customer.notes}
          </p>
        )}
      </section>

      {/* ----------------------------------------------------------- figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bookings" value={bookingCount} hint="Including cancellations" />
        <StatCard label="Lifetime spend" value={money(spend)} tone="accent" />
        <StatCard
          label="Last stay"
          value={lastStay ? formatDate(lastStay.checkOut).split(",")[1]?.trim() ?? "—" : "—"}
          hint={lastStay ? "Checked out" : "Has not stayed yet"}
        />
        <StatCard
          label="Guest since"
          value={formatDate(customer.createdAt.slice(0, 10)).split(",")[1]?.trim() ?? "—"}
        />
      </div>

      {/* -------------------------------------------------------------- tabs */}
      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="pt-5">
          {own.length === 0 ? (
            <EmptyState title="No bookings yet" />
          ) : (
            <ul className="space-y-3">
              {own
                .sort((a, b) => b.booking.checkIn.localeCompare(a.booking.checkIn))
                .map(({ booking, villa, roomNames, totals }) => {
                  const status = bookingStatus.get(booking.status);
                  const pay = paymentStatus.get(booking.paymentStatus);
                  return (
                    <li key={booking.id}>
                      <Link
                        to={`/admin/bookings/${booking.id}`}
                        className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12 transition-all hover:ring-gold/40"
                      >
                        <img
                          src={villa?.image}
                          alt=""
                          aria-hidden
                          className="size-12 rounded-lg object-cover ring-1 ring-gold/25"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">
                            {villa?.name}
                            <span className="ml-2 font-normal text-stone-600">
                              {booking.bookingMode === "whole"
                                ? "Whole villa"
                                : roomNames.join(", ")}
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm text-stone-600">
                            {formatDateRange(booking.checkIn, booking.checkOut)} ·{" "}
                            {booking.reference}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge label={status.label} tone={status.tone} />
                          <StatusBadge label={pay.label} tone={pay.tone} />
                        </div>
                        <span className="text-right text-sm tabular-nums text-ink">
                          {money(totals.total)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="pt-5">
          {ownInvoices.length === 0 ? (
            <EmptyState title="No invoices raised" />
          ) : (
            <ul className="space-y-3">
              {ownInvoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{invoice.number}</p>
                    <p className="text-sm text-stone-600">
                      Issued {formatDate(invoice.issuedAt)}
                    </p>
                  </div>
                  <StatusBadge
                    label={titleCase(invoice.status)}
                    tone={invoice.status === "paid" ? "confirmed" : "pending"}
                  />
                  <Button asChild variant="link" size="sm">
                    <Link to={`/admin/bookings/${invoice.bookingId}`}>Open booking</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="requests" className="pt-5">
          {ownRequests.length === 0 ? (
            <EmptyState title="No requests raised" />
          ) : (
            <ul className="space-y-3">
              {ownRequests.map(({ request, villa }) => {
                const status = requestStatus.get(request.status);
                return (
                  <li
                    key={request.id}
                    className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{request.description}</p>
                        <p className="mt-1 text-xs text-stone-600">
                          {titleCase(request.category)} · {villa?.name} ·{" "}
                          {formatDate(request.createdAt.slice(0, 10))}
                        </p>
                      </div>
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="feedback" className="pt-5">
          {ownFeedback.length === 0 ? (
            <EmptyState title="No feedback left yet" />
          ) : (
            <ul className="space-y-3">
              {ownFeedback.map(({ entry, villa }) => (
                <li
                  key={entry.id}
                  className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-gold/12"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-lg text-ink">{villa?.name}</p>
                    <span
                      className="text-gold"
                      aria-label={`${entry.rating} out of 5`}
                      title={`${entry.rating} out of 5`}
                    >
                      {"★".repeat(entry.rating)}
                      <span className="text-stone-300">{"★".repeat(5 - entry.rating)}</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{entry.comment}</p>
                  <p className="mt-2 text-xs text-stone">
                    {formatDate(entry.createdAt.slice(0, 10))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-5">
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
            <ActivityTimeline events={ownActivity} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
