import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common";
import { useBookingViews } from "@/hooks/useData";
import { usePartialPayments } from "@/hooks/usePartialPayments";
import { formatDate, money, relativeTime } from "@/lib/format";

/**
 * Guests asking to pay in parts. Approving lets them upload a receipt for the
 * first instalment instead of the full balance; the date is when the rest is due.
 * Also lists agreements in force, so the desk knows who pays next and when.
 */
export function PartialPaymentRequests() {
  const { requests, decide } = usePartialPayments();
  const views = useBookingViews();
  const pending = requests.filter((r) => r.status === "pending");
  const upcoming = requests
    .filter((r) => r.status === "approved")
    .map((r) => ({ r, view: views.find((v) => v.booking.id === r.bookingId) }))
    .filter(({ view }) => view && view.totals.balance > 0)
    .sort((a, b) => a.r.nextDueDate.localeCompare(b.r.nextDueDate));

  if (pending.length === 0 && upcoming.length === 0) return null;

  const act = async (id: string, approve: boolean) => {
    if (!approve && !window.confirm("Decline this part-payment request? The guest must then pay in full.")) return;
    const { error } = await decide(id, approve);
    if (error) return toast.error("Could not save", { description: error });
    toast.success(approve ? "Part-payment approved" : "Request declined");
  };

  return (
    <section aria-labelledby="partial" className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
      <h2 id="partial" className="px-6 pt-5 pb-3 text-xl text-ink">
        Part-payments
      </h2>
      <ul className="divide-y divide-ink/8">
        {pending.map((r) => {
          const view = views.find((v) => v.booking.id === r.bookingId);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  <Link to={`/admin/bookings/${r.bookingId}`} className="hover:text-clay-600">
                    {view?.customer?.name ?? "Guest"} · {view?.booking.reference}
                  </Link>{" "}
                  <StatusBadge label="Requested" tone="pending" />
                </p>
                <p className="mt-0.5 text-sm text-stone-600">
                  {money(r.amountNow)} now of {money(view?.totals.balance ?? 0)} · rest by{" "}
                  {formatDate(r.nextDueDate)} · asked {relativeTime(r.createdAt)}
                </p>
                {r.note && <p className="mt-1 text-sm text-ink/80">“{r.note}”</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void act(r.id, true)}>
                  <Check aria-hidden />
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => void act(r.id, false)}>
                  <X aria-hidden />
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
        {upcoming.map(({ r, view }) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 text-sm">
            <Link to={`/admin/bookings/${r.bookingId}`} className="min-w-0 flex-1 text-ink hover:text-clay-600">
              {view?.customer?.name} · {view?.booking.reference}
            </Link>
            <span className="text-stone-600">
              {money(view?.totals.balance ?? 0)} left · next payment by{" "}
              <strong className="text-ink">{formatDate(r.nextDueDate)}</strong>
            </span>
            <StatusBadge label="Approved" tone="confirmed" />
          </li>
        ))}
      </ul>
    </section>
  );
}
