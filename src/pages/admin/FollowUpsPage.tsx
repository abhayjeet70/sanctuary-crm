import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PhoneCall } from "lucide-react";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import {
  useBookingViews,
  useFeedbackViews,
  useMockData,
  useWaitlistViews,
} from "@/hooks/useData";
import { money, relativeTime } from "@/lib/format";
import type { Tone } from "@/lib/status";

/** One thing somebody has to pick up the phone about. */
interface FollowUp {
  id: string;
  who: string;
  reason: string;
  detail: string;
  /** Sorts the list: the older and costlier, the higher. */
  since: string;
  urgency: "now" | "soon" | "when you can";
  to: string;
}

const URGENCY: Record<FollowUp["urgency"], Tone> = {
  now: "cancelled",
  soon: "pending",
  "when you can": "uploaded",
};

/** Days between an ISO instant and today. */
const daysSince = (iso: string, today: string) =>
  Math.floor((new Date(today).getTime() - new Date(iso).getTime()) / 86_400_000);

/**
 * The chase list.
 *
 * Nothing is stored here — a follow-up is not a record somebody remembers to
 * create, it is a state the data is already in. Derive it and it can never go
 * stale: settle the balance and the row leaves by itself.
 */
export default function FollowUpsPage() {
  const bookings = useBookingViews();
  const waitlist = useWaitlistViews();
  const feedback = useFeedbackViews();
  const { today } = useMockData();

  const items = useMemo<FollowUp[]>(() => {
    const rows: FollowUp[] = [];

    for (const { booking, villa, customer, totals } of bookings) {
      const name = customer?.name ?? "Guest";
      const where = villa?.name ?? "";

      if (booking.status === "inquiry" && daysSince(booking.createdAt, today) >= 2) {
        rows.push({
          id: `q-${booking.id}`,
          who: name,
          reason: "Enquiry unanswered",
          detail: `${where} · ${money(totals.total)} quoted`,
          since: booking.createdAt,
          urgency: "now",
          to: `/admin/bookings/${booking.id}`,
        });
      }

      if (booking.status === "pending_payment") {
        rows.push({
          id: `d-${booking.id}`,
          who: name,
          reason: "Deposit not received",
          detail: `${where} · ${money(totals.balance)} outstanding`,
          since: booking.createdAt,
          urgency: daysSince(booking.createdAt, today) >= 3 ? "now" : "soon",
          to: `/admin/bookings/${booking.id}`,
        });
      }

      // Money still owed after the guest has gone home only gets harder to
      // collect, so it sits at the top of the list rather than in a report.
      if (
        (booking.status === "checked_out" || booking.status === "completed") &&
        totals.balance > 0
      ) {
        rows.push({
          id: `b-${booking.id}`,
          who: name,
          reason: "Balance outstanding after checkout",
          detail: `${where} · ${money(totals.balance)} due`,
          since: booking.checkOut,
          urgency: "now",
          to: `/admin/bookings/${booking.id}`,
        });
      }

      if (booking.paymentStatus === "rejected") {
        rows.push({
          id: `r-${booking.id}`,
          who: name,
          reason: "Receipt rejected",
          detail: `${where} · guest needs to send another`,
          since: booking.createdAt,
          urgency: "soon",
          to: `/admin/payments`,
        });
      }
    }

    for (const { entry, customer, villa, openings } of waitlist) {
      if (entry.status !== "waiting" || openings.length === 0) continue;
      rows.push({
        id: `w-${entry.id}`,
        who: customer?.name ?? "Guest",
        reason: "Dates have come free",
        detail: `Wanted ${villa?.name ?? "any villa"} · ${openings
          .map((v) => v.name)
          .join(", ")} now open`,
        since: entry.createdAt,
        urgency: "now",
        to: "/admin/enquiries",
      });
    }

    for (const { entry, customer, villa } of feedback) {
      if (entry.reply || entry.rating > 3) continue;
      rows.push({
        id: `f-${entry.id}`,
        who: customer?.name ?? "Guest",
        reason: `Left ${entry.rating}★ with no reply`,
        detail: `${villa?.name ?? ""} · ${entry.comment}`,
        since: entry.createdAt,
        urgency: "soon",
        to: "/admin/feedback",
      });
    }

    const rank = { now: 0, soon: 1, "when you can": 2 };
    return rows.sort(
      (a, b) => rank[a.urgency] - rank[b.urgency] || a.since.localeCompare(b.since),
    );
  }, [bookings, waitlist, feedback, today]);

  const now = items.filter((i) => i.urgency === "now");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Follow-ups"
        description="Everyone waiting on a call back — worked out from where the data already sits, so nothing has to be remembered."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="To chase"
          value={items.length}
          icon={<PhoneCall className="size-4" />}
        />
        <StatCard label="Today" value={now.length} tone={now.length ? "warn" : "default"} />
        <StatCard
          label="Enquiries waiting"
          value={items.filter((i) => i.reason === "Enquiry unanswered").length}
        />
        <StatCard
          label="Money to collect"
          value={items.filter((i) => i.reason.startsWith("Balance")).length}
          hint="Stays already finished"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<PhoneCall className="size-5" />}
          title="Nobody is waiting on you"
          description="Every enquiry is answered, every deposit is in and every balance is settled."
        />
      ) : (
        <ul className="divide-y divide-ink/8 rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-gold/6"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{item.who}</p>
                    <StatusBadge label={item.reason} tone={URGENCY[item.urgency]} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-stone-600">{item.detail}</p>
                </div>
                <p className="text-xs text-stone-600">{relativeTime(item.since)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
