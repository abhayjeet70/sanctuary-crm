import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Hourglass,
  PhoneCall,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Eyebrow, StatusBadge } from "@/components/common";
import { useMockData, useVillas, useWaitlistViews } from "@/hooks/useData";
import { bookingSource } from "@/lib/status";
import { formatDate, formatDateRange, nightsBetween, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";
import type { WaitlistStatus } from "@/types";

const ANY = "any";
const ALL = "all";

/** How each state reads, and how it is toned. Never colour alone. */
const STATE: Record<WaitlistStatus, { label: string; tone: Tone }> = {
  waiting: { label: "Waiting", tone: "pending" },
  offered: { label: "Offered", tone: "uploaded" },
  converted: { label: "Booked", tone: "confirmed" },
  expired: { label: "Lapsed", tone: "completed" },
  cancelled: { label: "Withdrawn", tone: "cancelled" },
};

/**
 * The waiting list.
 *
 * First come, first served — and the order shown here *is* the rule, not a
 * summary of one held elsewhere. Position is arrival order among everyone
 * still waiting for the same villa, computed on read, so nothing can drift out
 * of step when an entry is withdrawn.
 *
 * A row turns actionable on its own: when the dates it wants come free, the
 * openings are named on the row itself rather than announced somewhere the
 * desk has to go and look.
 */
export function WaitlistBoard() {
  const rows = useWaitlistViews();
  const villas = useVillas();
  const { updateWaitlistEntry } = useMockData();

  const [villaFilter, setVillaFilter] = useState(ALL);
  const [showClosed, setShowClosed] = useState(false);

  const open = rows.filter(
    (r) => r.entry.status === "waiting" || r.entry.status === "offered",
  );
  const closed = rows.filter(
    (r) => r.entry.status !== "waiting" && r.entry.status !== "offered",
  );

  const shown = (showClosed ? [...open, ...closed] : open).filter((r) =>
    villaFilter === ALL
      ? true
      : villaFilter === ANY
        ? !r.entry.villaId
        : r.entry.villaId === villaFilter,
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-5" />}
        title="Nobody is waiting"
        description="When a booking is refused because the dates are held, the guest can be put on this list instead of turned away."
      />
    );
  }

  const offerable = open.filter(
    (r) => r.entry.status === "waiting" && r.openings.length > 0,
  );

  return (
    <div className="space-y-4">
      {offerable.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl bg-status-confirmed-bg p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-status-confirmed" aria-hidden />
          <p className="text-sm text-ink">
            <span className="font-medium">
              {offerable.length === 1
                ? "One person on this list can be offered their dates now."
                : `${offerable.length} people on this list can be offered their dates now.`}
            </span>{" "}
            <span className="text-stone-600">
              Work down the list in order — the position beside each name is the
              order they asked.
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">Waiting for</Eyebrow>
        <Select value={villaFilter} onValueChange={setVillaFilter}>
          <SelectTrigger className="h-8 w-auto gap-1 text-xs" aria-label="Filter by villa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every villa</SelectItem>
            <SelectItem value={ANY}>No preference</SelectItem>
            {villas.map((villa) => (
              <SelectItem key={villa.id} value={villa.id}>
                {villa.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setShowClosed((v) => !v)}
        >
          <ChevronDown
            className={cn("transition-transform", showClosed && "rotate-180")}
            aria-hidden
          />
          {showClosed ? "Hide" : "Show"} closed ({closed.length})
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-600">
          Nobody is waiting for that.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map(({ entry, customer, villa, position, openings }) => {
            const live = entry.status === "waiting" || entry.status === "offered";
            const nights = nightsBetween(entry.checkIn, entry.checkOut);

            return (
              <li
                key={entry.id}
                className={cn(
                  "rounded-xl bg-white p-4 shadow-soft ring-1 transition-shadow",
                  openings.length > 0 && entry.status === "waiting"
                    ? "ring-status-confirmed/35"
                    : "ring-gold/12",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  {/* Position is the queue. Shown big because it is the rule
                      the desk is meant to follow. */}
                  <span
                    className={cn(
                      "flex size-10 shrink-0 flex-col items-center justify-center rounded-lg",
                      position > 0 ? "bg-ink text-sand" : "bg-sand-200 text-stone",
                    )}
                    aria-hidden
                  >
                    <span className="font-display text-base tabular-nums">
                      {position > 0 ? position : "—"}
                    </span>
                  </span>
                  <span className="sr-only">
                    {position > 0 ? `Position ${position} in the queue` : "Not in the queue"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {customer ? (
                        <Link
                          to={`/admin/customers/${customer.id}`}
                          className="text-sm font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {customer.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-ink">A guest</span>
                      )}
                      <StatusBadge {...STATE[entry.status]} />
                    </div>

                    <p className="mt-1 text-sm text-stone-600">
                      {villa?.name ?? "Any villa"} ·{" "}
                      {formatDateRange(entry.checkIn, entry.checkOut)} · {nights}{" "}
                      {nights === 1 ? "night" : "nights"} ·{" "}
                      {entry.adults + entry.children} guests
                    </p>
                    <p className="mt-0.5 text-xs text-stone">
                      Asked {relativeTime(entry.createdAt)} · {bookingSource[entry.source]}
                      {customer?.phone ? ` · ${customer.phone}` : ""}
                      {entry.offeredAt ? ` · offered ${relativeTime(entry.offeredAt)}` : ""}
                    </p>
                    {entry.note && (
                      <p className="mt-2 rounded-lg bg-sand-200/60 px-3 py-2 text-sm text-ink">
                        {entry.note}
                      </p>
                    )}

                    {entry.status === "waiting" && openings.length > 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-status-confirmed">
                        <Sparkles className="size-4 shrink-0" aria-hidden />
                        {openings.map((v) => v.name).join(" and ")}{" "}
                        {openings.length === 1 ? "is" : "are"} free for these dates.
                      </p>
                    )}
                    {entry.status === "waiting" && openings.length === 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-600">
                        <Hourglass className="size-4 shrink-0" aria-hidden />
                        Still held. You will be told when these dates free up.
                      </p>
                    )}
                  </div>

                  {live && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {entry.status === "waiting" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            updateWaitlistEntry(entry.id, {
                              status: "offered",
                              offeredAt: new Date().toISOString(),
                            });
                            toast.success(`Marked as offered to ${customer?.name ?? "the guest"}`, {
                              description: customer?.phone
                                ? `Ring ${customer.phone} to confirm.`
                                : "They hold the dates until they answer.",
                            });
                          }}
                        >
                          <PhoneCall aria-hidden />
                          Offer
                        </Button>
                      )}

                      {/* Converting is a booking, so it goes through the
                          booking form — which is where the conflict check,
                          the rate and the tax already live. */}
                      <Button asChild size="sm">
                        <Link
                          to={`/admin/bookings/new?${new URLSearchParams({
                            waitlist: entry.id,
                            customer: entry.customerId,
                            villa: openings[0]?.id ?? entry.villaId ?? "",
                            from: entry.checkIn,
                            to: entry.checkOut,
                            adults: String(entry.adults),
                            children: String(entry.children),
                          }).toString()}`}
                        >
                          <Check aria-hidden />
                          Book them
                        </Link>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          updateWaitlistEntry(entry.id, { status: "cancelled" });
                          toast.success("Taken off the list");
                        }}
                      >
                        <X aria-hidden />
                        <span className="sr-only">
                          Remove {customer?.name ?? "this guest"} from the waiting list
                        </span>
                      </Button>
                    </div>
                  )}

                  {entry.status === "converted" && entry.bookingId && (
                    <Button asChild size="sm" variant="link">
                      <Link to={`/admin/bookings/${entry.bookingId}`}>
                        See the booking
                      </Link>
                    </Button>
                  )}
                </div>

                {entry.status === "converted" && (
                  <p className="mt-2 text-xs text-stone-600">
                    Booked from this request on {formatDate(entry.createdAt.slice(0, 10))}.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
