import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarClock,
  Check,
  ClipboardList,
  Clock,
  DoorOpen,
  IdCard,
  LogIn,
  LogOut,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Eyebrow, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { WaitlistBoard } from "@/components/admin/WaitlistBoard";
import {
  useBookingViews,
  useDepartments,
  useEmployees,
  useMockData,
  useRequestViews,
  useTodayOverview,
  useVillas,
  useWaitlistViews,
} from "@/hooks/useData";
import { bookingStatus, bookingSource, titleCase } from "@/lib/status";
import { formatDate, initials, money } from "@/lib/format";
import { bookingsOnDate, stayTimes } from "@/services/domain";
import { useSession } from "@/services/session";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";
import type { Villa } from "@/types";

/** One active style, matching Settings and Finances, so the strips agree. */
const TAB =
  "data-[state=active]:bg-ink data-[state=active]:text-sand data-[state=active]:shadow-soft rounded-lg px-3 py-1.5 text-stone-600 hover:text-ink";

/**
 * Reception.
 *
 * Everything the desk is asked in a day, on one screen: who is arriving and
 * when, who is leaving, what is standing empty right now, who is on shift and
 * free to take a job, and who is waiting for dates we could not sell them.
 *
 * The room rack here is deliberately *today* rather than a date range — the
 * Calendar already draws the tape chart, and the question at the desk is
 * "what is free this minute", which a fortnight-wide grid answers badly.
 */
export default function FrontDeskPage() {
  const overview = useTodayOverview();
  const villas = useVillas();
  const views = useBookingViews();
  const { updateBooking, today } = useMockData();
  const { session } = useSession();
  // Moving a stay through its lifecycle is a write RLS gives to management.
  // Reception reads the desk; it does not check people in until the owner
  // gives that account a manager role.
  const canMoveGuests = session?.role === "admin" || session?.role === "manager";

  const arrivals = overview.arrivals.filter(
    (v) => v.booking.status !== "checked_in" && v.booking.status !== "in_house",
  );
  const arrived = overview.arrivals.filter(
    (v) => v.booking.status === "checked_in" || v.booking.status === "in_house",
  );
  const departures = overview.departures.filter(
    (v) => v.booking.status !== "checked_out" && v.booking.status !== "completed",
  );

  const waiting = useWaitlistViews().filter((row) => row.entry.status === "waiting");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDate(today)}
        title="Front desk"
        description="Arrivals, departures, what is standing empty, and who is waiting."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Arriving"
          value={arrivals.length}
          hint={arrived.length > 0 ? `${arrived.length} already in` : "today"}
          icon={<LogIn className="size-4" />}
          tone={arrivals.length > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Departing"
          value={departures.length}
          hint="today"
          icon={<LogOut className="size-4" />}
        />
        <StatCard
          label="In house"
          value={overview.inHouse.length}
          icon={<BedDouble className="size-4" />}
        />
        <StatCard
          label="Villas free"
          value={overview.availableVillas.length}
          hint={`of ${villas.length}`}
          icon={<DoorOpen className="size-4" />}
        />
        <StatCard
          label="Waiting"
          value={waiting.length}
          hint={waiting.some((r) => r.openings.length > 0) ? "some can be offered" : "for held dates"}
          icon={<CalendarClock className="size-4" />}
          tone={waiting.some((r) => r.openings.length > 0) ? "warn" : "default"}
        />
      </div>

      <Tabs defaultValue="today" className="gap-5">
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1.5">
          <TabsTrigger value="today" className={TAB}>Today</TabsTrigger>
          <TabsTrigger value="rack" className={TAB}>Room rack</TabsTrigger>
          <TabsTrigger value="waitlist" className={TAB}>
            Waiting list{waiting.length > 0 ? ` (${waiting.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="team" className={TAB}>On shift</TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <div className="grid gap-6 xl:grid-cols-2">
            <MovementList
              title="Arrivals"
              hint="In the order they said they would get here."
              icon={<LogIn className="size-5" />}
              empty="Nobody is due in today."
              rows={[...arrivals, ...arrived]}
              villas={villas}
              kind="arrival"
              canAct={canMoveGuests}
              onAction={(view) => {
                updateBooking(view.booking.id, { status: "checked_in" });
                toast.success(`${view.customer?.name} checked in`, {
                  description: `${view.villa?.name} · ${view.booking.reference}`,
                });
              }}
            />
            <MovementList
              title="Departures"
              hint="Housekeeping can start once the room is released."
              icon={<LogOut className="size-5" />}
              empty="Nobody is due to leave today."
              rows={departures}
              villas={villas}
              kind="departure"
              canAct={canMoveGuests}
              onAction={(view) => {
                updateBooking(view.booking.id, { status: "checked_out" });
                toast.success(`${view.customer?.name} checked out`, {
                  description: `${view.villa?.name} is ready for housekeeping.`,
                });
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="rack">
          <RoomRack villas={villas} views={views} today={today} />
        </TabsContent>

        <TabsContent value="waitlist">
          <WaitlistBoard />
        </TabsContent>

        <TabsContent value="team">
          <OnShift />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------ arrivals/departures */

function MovementList({
  title,
  hint,
  icon,
  empty,
  rows,
  villas,
  kind,
  canAct,
  onAction,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  empty: string;
  rows: BookingView[];
  villas: Villa[];
  kind: "arrival" | "departure";
  /** False for reception: the list is theirs to read, the move is not
   *  theirs to make. Offering a button RLS would refuse teaches people to
   *  distrust every other button on the page. */
  canAct: boolean;
  onAction: (view: BookingView) => void;
}) {
  // Sorted by the time they are actually expected, which is the whole point of
  // recording an agreed time rather than assuming the villa's standard hour.
  const sorted = [...rows].sort((a, b) => {
    const at = stayTimes(a.booking, villas.find((v) => v.id === a.booking.villaId));
    const bt = stayTimes(b.booking, villas.find((v) => v.id === b.booking.villaId));
    const key = kind === "arrival" ? "arrival" : "departure";
    return at[key].localeCompare(bt[key]);
  });

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <div className="flex items-center gap-3">
        <span className="text-gold-700" aria-hidden>{icon}</span>
        <div>
          <Eyebrow className="text-gold-700">{title}</Eyebrow>
          <p className="mt-0.5 text-sm text-stone-600">{hint}</p>
        </div>
      </div>
      <hr className="rule-gold my-4" />

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-600">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((view) => {
            const villa = villas.find((v) => v.id === view.booking.villaId);
            const times = stayTimes(view.booking, villa);
            const time = kind === "arrival" ? times.arrival : times.departure;
            const arranged =
              kind === "arrival" ? times.arrivalArranged : times.departureArranged;
            const done =
              kind === "arrival"
                ? view.booking.status === "checked_in" || view.booking.status === "in_house"
                : view.booking.status === "checked_out";
            const owes = view.totals.balance > 0;
            const noId = !view.customer?.idImagePath && !view.customer?.idNumber;

            return (
              <li
                key={view.booking.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-sand-200/50 p-3"
              >
                <span
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center rounded-lg px-2 py-1.5",
                    arranged ? "bg-clay/15 text-clay" : "bg-white text-ink",
                  )}
                >
                  <span className="font-display text-base tabular-nums">{time}</span>
                  <span className="text-[0.625rem] tracking-wide uppercase">
                    {arranged ? "agreed" : "usual"}
                  </span>
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/admin/bookings/${view.booking.id}`}
                    className="truncate text-sm font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {view.customer?.name}
                  </Link>
                  <p className="truncate text-xs text-stone-600">
                    {villa?.name}
                    {view.roomNames.length > 0 ? ` · ${view.roomNames.join(", ")}` : ""} ·{" "}
                    {view.booking.adults + view.booking.children} guests ·{" "}
                    {bookingSource[view.booking.source]}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge {...bookingStatus.get(view.booking.status)} />
                    {owes && (
                      <span className="rounded-md bg-status-pending-bg px-1.5 py-0.5 text-[0.6875rem] text-status-pending">
                        {money(view.totals.balance)} due
                      </span>
                    )}
                    {kind === "arrival" && noId && (
                      <span className="flex items-center gap-1 rounded-md bg-status-cancelled-bg px-1.5 py-0.5 text-[0.6875rem] text-status-cancelled">
                        <ShieldAlert className="size-3" aria-hidden />
                        No ID on file
                      </span>
                    )}
                  </div>
                </div>

                {done ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-status-confirmed">
                    <Check className="size-4" aria-hidden />
                    {kind === "arrival" ? "Checked in" : "Checked out"}
                  </span>
                ) : canAct ? (
                  <Button size="sm" variant="outline" onClick={() => onAction(view)}>
                    {kind === "arrival" ? "Check in" : "Check out"}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-stone">
                    {kind === "arrival" ? "Due in" : "Due out"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- the rack */

/**
 * What is standing empty, right now.
 *
 * A whole-villa house is one cell, because that is how it sells. A split house
 * is four, because that is how it sells. Showing four bedrooms for a villa
 * that can only be let entire would invite reception to sell one.
 */
function RoomRack({
  villas,
  views,
  today,
}: {
  villas: Villa[];
  views: BookingView[];
  today: string;
}) {
  const bookings = views.map((v) => v.booking);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">Today</Eyebrow>
        <Key tone="free" label="Free" />
        <Key tone="occupied" label="Occupied" />
        <Key tone="cleaning" label="Cleaning" />
        <Key tone="blocked" label="Out of service" />
      </div>

      {villas.map((villa) => {
        const held = bookingsOnDate(bookings, villa.id, today);
        const wholeHold = held.find((b) => b.roomIds.length === 0);

        return (
          <section
            key={villa.id}
            className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link
                  to={`/admin/villas/${villa.id}`}
                  className="font-display text-lg text-ink underline-offset-4 hover:underline"
                >
                  {villa.name}
                </Link>
                <p className="mt-0.5 text-xs text-stone-600">
                  {villa.mode === "whole"
                    ? `Sold whole · ${villa.bedrooms} bedrooms · sleeps ${villa.capacity}`
                    : `Sold by the room · ${villa.rooms.length} rooms`}
                  {villa.status !== "active" && ` · ${titleCase(villa.status)}`}
                </p>
              </div>
              <p className="text-sm tabular-nums text-stone-600">
                {money(villa.baseRate)} <span className="text-xs">a night</span>
              </p>
            </div>

            <div className="mt-4">
              {villa.mode === "whole" ? (
                <Cell
                  name="Whole villa"
                  tone={wholeHold ? "occupied" : villa.status === "active" ? "free" : "blocked"}
                  guest={
                    wholeHold
                      ? views.find((v) => v.booking.id === wholeHold.id)?.customer?.name
                      : undefined
                  }
                  bookingId={wholeHold?.id}
                  wide
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {villa.rooms.map((room) => {
                    // A whole-villa hold blocks every bedroom under it — the
                    // rack has to say so, or reception sells a room twice.
                    const hold =
                      wholeHold ?? held.find((b) => b.roomIds.includes(room.id));
                    const tone = hold
                      ? "occupied"
                      : room.status === "cleaning"
                        ? "cleaning"
                        : room.status === "blocked"
                          ? "blocked"
                          : "free";
                    return (
                      <Cell
                        key={room.id}
                        name={room.name}
                        tone={tone}
                        guest={
                          hold
                            ? views.find((v) => v.booking.id === hold.id)?.customer?.name
                            : undefined
                        }
                        bookingId={hold?.id}
                        detail={`Sleeps ${room.capacity} · ${money(room.baseRate)}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type RackTone = "free" | "occupied" | "cleaning" | "blocked";

/** State is carried by a label as well as a colour — a rack read only by hue
 *  is one that stops working for a colourblind receptionist. */
const RACK: Record<RackTone, { box: string; dot: string; word: string }> = {
  free: {
    box: "bg-status-confirmed-bg ring-status-confirmed/25",
    dot: "bg-status-confirmed",
    word: "Free",
  },
  occupied: {
    box: "bg-status-uploaded-bg ring-status-uploaded/25",
    dot: "bg-status-uploaded",
    word: "Occupied",
  },
  cleaning: {
    box: "bg-status-pending-bg ring-status-pending/25",
    dot: "bg-status-pending",
    word: "Cleaning",
  },
  blocked: {
    box: "bg-status-cancelled-bg ring-status-cancelled/25",
    dot: "bg-status-cancelled",
    word: "Out of service",
  },
};

function Key({ tone, label }: { tone: RackTone; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-stone-600">
      <span className={cn("size-2.5 rounded-sm", RACK[tone].dot)} aria-hidden />
      {label}
    </span>
  );
}

function Cell({
  name,
  tone,
  guest,
  detail,
  bookingId,
  wide,
}: {
  name: string;
  tone: RackTone;
  guest?: string;
  detail?: string;
  bookingId?: string;
  wide?: boolean;
}) {
  const style = RACK[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">{name}</span>
        <span className={cn("size-2.5 shrink-0 rounded-sm", style.dot)} aria-hidden />
      </div>
      <p className="mt-1 text-xs text-stone-600">{style.word}</p>
      {guest && <p className="mt-1.5 truncate text-sm text-ink">{guest}</p>}
      {!guest && detail && <p className="mt-1.5 truncate text-xs text-stone">{detail}</p>}
    </>
  );

  const className = cn(
    "block rounded-xl p-3 text-left ring-1 transition-shadow",
    style.box,
    wide && "sm:max-w-xs",
    bookingId && "hover:shadow-soft",
  );

  return bookingId ? (
    <Link to={`/admin/bookings/${bookingId}`} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/* ---------------------------------------------------------------- on shift */

/**
 * Who is working, and who is free.
 *
 * "Free" means no open job assigned to them personally. Where a request is
 * only routed to a department, it is shown against the department rather than
 * split across its members — nobody has picked it up yet, and pretending
 * otherwise would make everyone look busy.
 */
function OnShift() {
  const employees = useEmployees();
  const departments = useDepartments();
  const requests = useRequestViews();

  const open = requests.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );

  const working = employees.filter((e) => e.status === "active");
  const placed = departments.filter((d) => d.active);
  const unplaced = working.filter((e) => !e.departmentId);

  if (working.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-5" />}
        title="Nobody on the roster yet"
        description="Employees added in the roster show up here with what they are working on."
      />
    );
  }

  return (
    <div className="space-y-4">
      {[...placed, null].map((department) => {
        const members = department
          ? working.filter((e) => e.departmentId === department.id)
          : unplaced;
        if (members.length === 0) return null;

        const queue = department
          ? open.filter((r) => r.request.departmentId === department.id)
          : [];
        const unclaimed = queue.filter((r) => !r.request.assignedUser).length;

        return (
          <section
            key={department?.id ?? "unplaced"}
            className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Eyebrow className="text-gold-700">
                {department?.name ?? "No department"}
              </Eyebrow>
              {department && (
                <p className="flex items-center gap-1.5 text-xs text-stone-600">
                  <ClipboardList className="size-3.5" aria-hidden />
                  {queue.length === 0
                    ? "Nothing open"
                    : `${queue.length} open · ${unclaimed} unclaimed`}
                </p>
              )}
            </div>
            <hr className="rule-gold my-4" />

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((employee) => {
                const jobs = open.filter((r) => r.request.assignedUser === employee.id);
                const free = jobs.length === 0;
                return (
                  <li
                    key={employee.id}
                    className="flex items-center gap-3 rounded-xl bg-sand-200/50 p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-sand">
                      {initials(employee.fullName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{employee.fullName}</p>
                      <p className="truncate text-xs text-stone-600">
                        {employee.designation || "No title"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem]",
                        free
                          ? "bg-status-confirmed-bg text-status-confirmed"
                          : "bg-status-uploaded-bg text-status-uploaded",
                      )}
                    >
                      {free ? (
                        <Sparkles className="size-3" aria-hidden />
                      ) : (
                        <Clock className="size-3" aria-hidden />
                      )}
                      {free ? "Free" : `${jobs.length} on`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="flex items-start gap-2 px-1 text-xs text-stone-600">
        <IdCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Shows everyone marked active on the roster. This is not a shift rota — the
        system does not hold rosters or hours yet, so treat it as "on the books",
        not "on the clock".
      </p>
    </div>
  );
}
