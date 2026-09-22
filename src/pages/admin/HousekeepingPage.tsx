import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, Brush, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard, StatusBadge, Photo } from "@/components/common";
import { useMockData, useRequestViews, useTodayOverview, useVillas } from "@/hooks/useData";
import { requestPriority, titleCase, type Tone } from "@/lib/status";
import { relativeTime } from "@/lib/format";
import { stayTimes } from "@/services/domain";
import type { RoomStatus } from "@/types";

/** How a room's state reads, and the one move offered beside it. */
const ROOM: Record<RoomStatus, { tone: Tone; next?: RoomStatus; action?: string }> = {
  available: { tone: "confirmed" },
  occupied: { tone: "inhouse", next: "cleaning", action: "Send to clean" },
  cleaning: { tone: "pending", next: "available", action: "Mark clean" },
  blocked: { tone: "cancelled", next: "available", action: "Release" },
};

/** The request categories the floor actually works. */
const FLOOR_WORK = ["housekeeping", "extra_towels", "room_setup"];

export default function HousekeepingPage() {
  const villas = useVillas();
  const overview = useTodayOverview();
  const { saveRoom } = useMockData();
  const [busy, setBusy] = useState<string | null>(null);

  const jobs = useRequestViews().filter(
    (r) => r.request.assignedTo === "housekeeping" || FLOOR_WORK.includes(r.request.category),
  );
  const open = jobs.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );

  const rooms = useMemo(
    () => villas.flatMap((villa) => villa.rooms.map((room) => ({ villa, room }))),
    [villas],
  );
  const cleaning = rooms.filter(({ room }) => room.status === "cleaning");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Turnovers · linen · room readiness"
        title="Housekeeping"
        description="Which rooms are ready, which are being turned over, and what the floor has been asked for."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Departures today"
          value={overview.departures.length}
          hint="Rooms to turn over"
          icon={<BedDouble className="size-4" />}
        />
        <StatCard
          label="Being cleaned"
          value={cleaning.length}
          tone={cleaning.length ? "warn" : "default"}
          icon={<Brush className="size-4" />}
        />
        <StatCard
          label="Ready"
          value={rooms.filter(({ room }) => room.status === "available").length}
          hint={`of ${rooms.length} rooms`}
          icon={<Sparkles className="size-4" />}
        />
        <StatCard label="Open jobs" value={open.length} />
      </div>

      {/* -------------------------------------------------------- turnovers */}
      <section
        aria-labelledby="turnovers"
        className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
      >
        <h2 id="turnovers" className="px-6 pt-5 pb-3 text-xl text-ink">
          Today's turnovers
        </h2>
        {overview.departures.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<BedDouble className="size-5" />}
            title="No departures today"
            description="Nothing needs turning over before tomorrow."
          />
        ) : (
          <ul className="divide-y divide-ink/8">
            {overview.departures.map(({ booking, villa, customer, roomNames }) => (
              <li key={booking.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{customer?.name}</p>
                  <p className="truncate text-xs text-stone-600">
                    {villa?.name}
                    {roomNames.length > 0 && ` · ${roomNames.join(", ")}`} · out by{" "}
                    {stayTimes(booking, villa).departure}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/bookings/${booking.id}`}>Open booking</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- room board */}
      <section aria-labelledby="rooms" className="space-y-4">
        <h2 id="rooms" className="text-xl text-ink">
          Room status
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {villas.map((villa) => (
            <div
              key={villa.id}
              className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06]"
            >
              <div className="flex items-center gap-3">
                <Photo
                  src={villa.image}
                  alt=""
                  className="size-10 rounded-lg object-cover ring-1 ring-gold/25"
                />
                <Link
                  to={`/admin/villas/${villa.id}`}
                  className="text-sm font-medium text-ink hover:text-clay-600"
                >
                  {villa.name}
                </Link>
              </div>
              <ul className="mt-4 space-y-2">
                {villa.rooms.map((room) => {
                  const meta = ROOM[room.status];
                  return (
                    <li key={room.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{room.name}</span>
                      <StatusBadge label={titleCase(room.status)} tone={meta.tone} />
                      {meta.next && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === room.id}
                          onClick={() => {
                            setBusy(room.id);
                            saveRoom(villa.id, { id: room.id, status: meta.next });
                            setBusy(null);
                          }}
                        >
                          {meta.action}
                        </Button>
                      )}
                    </li>
                  );
                })}
                {villa.rooms.length === 0 && (
                  <li className="text-xs text-stone-600">
                    Let as a whole villa — no rooms configured.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- the jobs */}
      <section
        aria-labelledby="jobs"
        className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 id="jobs" className="text-xl text-ink">
            Housekeeping requests
          </h2>
          <Button asChild variant="link" size="sm">
            <Link to="/admin/requests">All requests</Link>
          </Button>
        </div>
        {open.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<Brush className="size-5" />}
            title="Floor is clear"
            description="No housekeeping request is waiting."
          />
        ) : (
          <ul className="divide-y divide-ink/8">
            {open.map(({ request, villa, customer }) => {
              const priority = requestPriority.get(request.priority);
              return (
                <li key={request.id} className="flex flex-wrap items-start gap-3 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{request.description}</p>
                    <p className="mt-0.5 text-xs text-stone-600">
                      {customer?.name} · {villa?.name} · {relativeTime(request.createdAt)}
                    </p>
                  </div>
                  <StatusBadge label={priority.label} tone={priority.tone} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
