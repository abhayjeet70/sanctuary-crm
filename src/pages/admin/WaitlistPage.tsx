import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Hourglass,
  Mail,
  MessageCircle,
  Phone,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmptyState,
  Eyebrow,
  PageHeader,
  Photo,
  PreferenceBadges,
  StatCard,
  StatusBadge,
} from "@/components/common";
import { useMockData, useVillas, useWaitlistViews } from "@/hooks/useData";
import { bookingSource } from "@/lib/status";
import type { Tone } from "@/lib/status";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  initials,
  nightsBetween,
  relativeTime,
} from "@/lib/format";
import { hasPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import type { Villa, WaitlistStatus } from "@/types";

const STATE: Record<WaitlistStatus, { label: string; tone: Tone }> = {
  waiting: { label: "Waiting", tone: "pending" },
  offered: { label: "Offered", tone: "uploaded" },
  converted: { label: "Booked", tone: "confirmed" },
  expired: { label: "Lapsed", tone: "completed" },
  cancelled: { label: "Withdrawn", tone: "cancelled" },
};

/** Digits only, with the country code India dials from, so a tel: or a
 *  wa.me link actually connects. */
const dialable = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
};

/**
 * The waiting list, house by house.
 *
 * Villas come from the database, in their own order, with their own
 * photograph — three today, and nothing here counts on that. The queue under
 * each one is arrival order, computed on read, because a stored position is a
 * number somebody has to remember to rewrite.
 */
export default function WaitlistPage() {
  const villas = useVillas();
  const rows = useWaitlistViews();
  const [showClosed, setShowClosed] = useState(false);

  const open = rows.filter((row) => row.entry.status === "waiting");
  const offered = rows.filter((row) => row.entry.status === "offered");
  const converted = rows.filter((row) => row.entry.status === "converted");

  /** Grouped by the villa asked for; "any house" is its own group at the end
   *  because those people can be offered anything that frees up. */
  const byVilla = (() => {
    const shown = rows
      .filter((row) => showClosed || row.entry.status === "waiting" || row.entry.status === "offered")
      // The queue is arrival order. This sort *is* the rule, not a view of one.
      .sort((a, b) => a.entry.createdAt.localeCompare(b.entry.createdAt));

    return [
      ...villas.map((villa) => ({
        villa,
        entries: shown.filter((row) => row.entry.villaId === villa.id),
      })),
      { villa: undefined, entries: shown.filter((row) => !row.entry.villaId) },
    ];
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="First come, first served"
        title="Waiting list"
        description="Who wants dates we could not sell them, in the order they asked. Everything they told us is on the card."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowClosed((prev) => !prev)}>
            {showClosed ? "Hide closed" : "Show closed"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting" value={open.length} icon={<Hourglass className="size-4" />} />
        <StatCard
          label="Offered, no answer"
          value={offered.length}
          tone={offered.length ? "warn" : "default"}
          hint="Chase or release"
        />
        <StatCard
          label="Can be offered now"
          value={open.filter((row) => row.openings.length > 0).length}
          hint="Their dates have come free"
          tone={open.some((row) => row.openings.length > 0) ? "warn" : "default"}
        />
        <StatCard label="Became bookings" value={converted.length} hint="All time" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Hourglass className="size-5" />}
          title="Nobody is waiting"
          description="When a guest asks for dates that are already sold, they land here."
        />
      ) : (
        <div className="space-y-8">
          {byVilla.map(({ villa, entries }) => (
            <VillaQueue
              key={villa?.id ?? "any"}
              villa={villa}
              entries={entries}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- one house */

type Row = ReturnType<typeof useWaitlistViews>[number];

function VillaQueue({ villa, entries }: { villa?: Villa; entries: Row[] }) {
  const waiting = entries.filter((row) => row.entry.status === "waiting").length;

  return (
    <section
      aria-labelledby={`queue-${villa?.id ?? "any"}`}
      className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
    >
      {/* The photograph leads, because the desk thinks in houses. Falls back
          to the shared placeholder when a villa has no picture yet. */}
      <div className="relative h-36 sm:h-44">
        <Photo
          src={villa?.image}
          alt={villa?.name ?? "Any house"}
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent" />
        <div className="absolute inset-x-6 bottom-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id={`queue-${villa?.id ?? "any"}`} className="font-display text-2xl text-white">
              {villa?.name ?? "Any house will do"}
            </h2>
            <p className="mt-0.5 text-sm text-sand/80">
              {waiting === 0
                ? "Nobody waiting"
                : `${waiting} ${waiting === 1 ? "person" : "people"} waiting`}
              {villa && ` · ${villa.bedrooms} bedrooms · sleeps ${villa.capacity}`}
            </p>
          </div>
          {villa && (
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="bg-white/90 text-ink hover:bg-white"
            >
              <Link to={`/admin/villas/${villa.id}`}>
                Open villa
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-6 py-5 text-sm text-stone-600">
          Nobody is waiting for this house.
        </p>
      ) : (
        <ol className="divide-y divide-ink/8">
          {entries.map((row, index) => (
            <WaitlistCard key={row.entry.id} row={row} place={index + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- one person */

function WaitlistCard({ row, place }: { row: Row; place: number }) {
  const { entry, customer, villa, preferences, openings } = row;
  const { updateWaitlistEntry, bookings } = useMockData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const state = STATE[entry.status];
  const phone = dialable(customer?.phone ?? "");
  const nights = nightsBetween(entry.checkIn, entry.checkOut);
  const booking = bookings.find((b) => b.id === entry.bookingId);

  /**
   * Hand the booking form everything, and let it decide.
   *
   * The conflict check runs there, against the database, at the moment the
   * booking is actually written — an opening seen on this card is a minute
   * old and proves nothing. The entry stays as it is until that succeeds.
   */
  const convert = () => {
    const params = new URLSearchParams({ waitlist: entry.id });
    navigate(`/admin/bookings/new?${params.toString()}`);
  };

  const message = customer
    ? `Hello ${customer.name.split(" ")[0]}, this is Homes of Sanctuary. ${
        villa?.name ?? "A house"
      } has come free for ${formatDateRange(entry.checkIn, entry.checkOut)}. Shall we hold it for you?`
    : "";

  return (
    <li className="px-6 py-5">
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand-200 font-display text-sm text-stone-600"
        >
          #{place}
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          {/* ------------------------------------------------ who and when */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/admin/customers/${entry.customerId}`}
                  className="font-medium text-ink hover:text-clay-600"
                >
                  {customer?.name ?? "Guest"}
                </Link>
                <StatusBadge label={state.label} tone={state.tone} />
                {openings.length > 0 && entry.status === "waiting" && (
                  <StatusBadge
                    label={`${openings.map((v) => v.name).join(", ")} free now`}
                    tone="confirmed"
                  />
                )}
              </div>
              <p className="mt-0.5 text-xs text-stone-600">
                {customer?.phone}
                {customer?.email && ` · ${customer.email}`}
                {customer?.country && customer.country !== "India" && ` · ${customer.country}`}
              </p>
            </div>

            <p className="text-right text-xs text-stone-600">
              Joined {formatDateTime(entry.createdAt)}
              <span className="block">{relativeTime(entry.createdAt)}</span>
            </p>
          </div>

          {/* ---------------------------------------------------- the stay */}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Stay">
              {formatDate(entry.checkIn)} → {formatDate(entry.checkOut)}
              <span className="block text-xs text-stone-600">
                {nights} {nights === 1 ? "night" : "nights"}
              </span>
            </Fact>
            <Fact label="Guests">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 text-stone" aria-hidden />
                {entry.adults} {entry.adults === 1 ? "adult" : "adults"}
                {entry.children > 0 && ` + ${entry.children}`}
              </span>
            </Fact>
            <Fact label="Rooms wanted">
              {entry.roomIds.length > 0
                ? entry.roomIds
                    .map((id) => villa?.rooms.find((r) => r.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")
                : villa
                  ? "Whole villa"
                  : "Any"}
            </Fact>
            <Fact label="Arrival">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-stone" aria-hidden />
                {entry.checkInTime ?? "House hours"}
                {entry.checkOutTime && ` → ${entry.checkOutTime}`}
              </span>
            </Fact>
          </dl>

          {/* -------------------------------------------- what they told us */}
          {hasPreferences(preferences) && (
            <PreferenceBadges preferences={preferences} />
          )}

          {(entry.note || preferences?.foodNotes) && (
            <div className="rounded-lg bg-sand-200/60 px-3 py-2 text-sm text-ink">
              {entry.note && <p>{entry.note}</p>}
              {preferences?.foodNotes && (
                <p className="text-stone-600">{preferences.foodNotes}</p>
              )}
            </div>
          )}

          {entry.status === "converted" && booking && (
            <p className="text-sm text-status-confirmed">
              Converted →{" "}
              <Link
                to={`/admin/bookings/${booking.id}`}
                className="font-medium underline underline-offset-2"
              >
                {booking.reference}
              </Link>
            </p>
          )}

          {/* -------------------------------------------------- the actions */}
          {(entry.status === "waiting" || entry.status === "offered") && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setOpen((prev) => !prev)}>
                {open ? "Hide details" : "View details"}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Phone aria-hidden />
                    Contact
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem asChild disabled={!phone}>
                    <a href={`tel:+${phone}`}>
                      <Phone aria-hidden />
                      Call {customer?.phone}
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild disabled={!phone}>
                    <a
                      href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle aria-hidden />
                      WhatsApp
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild disabled={!customer?.email}>
                    <a
                      href={`mailto:${customer?.email}?subject=${encodeURIComponent(
                        `${villa?.name ?? "Homes of Sanctuary"} — your dates`,
                      )}&body=${encodeURIComponent(message)}`}
                    >
                      <Mail aria-hidden />
                      Email
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" onClick={convert}>
                <Check aria-hidden />
                Convert to booking
              </Button>

              {entry.status === "waiting" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateWaitlistEntry(entry.id, {
                      status: "offered",
                      offeredAt: new Date().toISOString(),
                    });
                    toast.success("Marked as offered", {
                      description: "It stays in the queue until they answer.",
                    });
                  }}
                >
                  Mark offered
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateWaitlistEntry(entry.id, { status: "cancelled" });
                  toast.success("Removed from the list");
                }}
              >
                <X aria-hidden />
                Remove
              </Button>
            </div>
          )}

          {/* ------------------------------------------------ the full card */}
          {open && (
            <div className="rounded-xl bg-sand-200/50 p-4">
              <Eyebrow className="mb-2 text-gold-700">Everything they told us</Eyebrow>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Fact label="Asked through">{bookingSource[entry.source]}</Fact>
                <Fact label="Guest since">
                  {customer ? formatDate(customer.createdAt) : "—"}
                </Fact>
                {preferences?.allergies && (
                  <Fact label="Allergies">{preferences.allergies}</Fact>
                )}
                {preferences?.dietaryNotes && (
                  <Fact label="Dietary">{preferences.dietaryNotes}</Fact>
                )}
                {preferences?.specialRequests && (
                  <Fact label="In their words">{preferences.specialRequests}</Fact>
                )}
              </dl>
              {!hasPreferences(preferences) && (
                <p className="text-sm text-stone-600">
                  They joined before we started asking, or skipped the questions.
                </p>
              )}
            </div>
          )}
        </div>

        <span
          aria-hidden
          className={cn(
            "hidden size-9 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold sm:flex",
            "bg-clay-600 text-white",
          )}
        >
          {initials(customer?.name ?? "")}
        </span>
      </div>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
