import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader, StatusBadge } from "@/components/common";
import { useBookingViews, useMockData, useVillas } from "@/hooks/useData";
import { addDays, datesOverlap, holdsInventory, toISODate } from "@/services/domain";
import { bookingStatus, toneSolid } from "@/lib/status";
import { formatDateRange, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

/** Every date in the month, padded to whole Monday-start weeks. */
function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const lead = (first.getDay() + 6) % 7; // Monday-start
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = lead; i > 0; i--) {
    const d = new Date(first);
    d.setDate(d.getDate() - i);
    cells.push({ date: toISODate(d), inMonth: false });
  }
  for (let day = 1; day <= last.getDate(); day++) {
    cells.push({
      date: toISODate(new Date(cursor.getFullYear(), cursor.getMonth(), day)),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(`${cells[cells.length - 1].date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    cells.push({ date: toISODate(d), inMonth: false });
  }
  return cells;
}

export default function CalendarPage() {
  const villas = useVillas();
  const views = useBookingViews();
  const { today } = useMockData();
  const navigate = useNavigate();

  const [cursor, setCursor] = useState(() => new Date(`${today}T00:00:00`));
  const [mode, setMode] = useState<"month" | "timeline">("month");

  const live = useMemo(() => views.filter((v) => holdsInventory(v.booking)), [views]);
  const cells = useMemo(() => monthGrid(cursor), [cursor]);
  const step = (months: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Occupancy across all three villas"
        title="Master calendar"
        description="A whole-villa hold blocks every room. A room hold blocks only that room — and the timeline shows both."
        actions={
          <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-gold/20">
            <Button
              variant={mode === "month" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("month")}
              aria-pressed={mode === "month"}
            >
              <CalendarDays aria-hidden />
              Month
            </Button>
            <Button
              variant={mode === "timeline" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("timeline")}
              aria-pressed={mode === "timeline"}
            >
              <Rows3 aria-hidden />
              Timeline
            </Button>
          </div>
        }
      />

      {/* -------------------------------------------------------- month nav */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous month">
          <ChevronLeft aria-hidden />
        </Button>
        <h2 className="font-display text-2xl text-ink" aria-live="polite">
          {monthLabel.format(cursor)}
        </h2>
        <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label="Next month">
          <ChevronRight aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCursor(new Date(`${today}T00:00:00`))}
        >
          Today
        </Button>

        <ul className="ml-auto flex flex-wrap gap-1.5">
          {(["pending", "uploaded", "confirmed", "inhouse", "cancelled"] as const).map((tone) => (
            <li key={tone}>
              <StatusBadge
                tone={tone}
                label={
                  {
                    pending: "Pending payment",
                    uploaded: "Payment uploaded",
                    confirmed: "Confirmed",
                    inhouse: "In house",
                    cancelled: "Released",
                  }[tone]
                }
              />
            </li>
          ))}
        </ul>
      </div>

      {mode === "month" ? (
        <MonthView cells={cells} views={live} villas={villas} today={today} navigate={navigate} />
      ) : (
        <TimelineView cursor={cursor} views={live} villas={villas} today={today} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- month */

function MonthView({
  cells,
  views,
  villas,
  today,
  navigate,
}: {
  cells: { date: string; inMonth: boolean }[];
  views: BookingView[];
  villas: ReturnType<typeof useVillas>;
  today: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
      <div className="grid grid-cols-7 border-b border-gold/20">
        {WEEKDAYS.map((day) => (
          <div key={day} className="label-caps px-2 py-2.5 text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }) => {
          const onDay = views.filter((v) =>
            datesOverlap(date, addDays(date, 1), v.booking.checkIn, v.booking.checkOut),
          );
          const freeVillas = villas.length - new Set(onDay.map((v) => v.booking.villaId)).size;
          const isToday = date === today;

          return (
            <div
              key={date}
              className={cn(
                "group min-h-28 border-r border-b border-ink/8 p-1.5 last:border-r-0",
                !inMonth && "bg-sand-200/40",
                isToday && "bg-gold/8 ring-1 ring-gold/40 ring-inset",
              )}
            >
              <div className="flex items-center justify-between gap-1 px-1">
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isToday ? "font-semibold text-gold-700" : inMonth ? "text-ink" : "text-stone",
                  )}
                >
                  {Number(date.slice(-2))}
                </span>
                {inMonth && freeVillas > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/admin/bookings/new")}
                    className="rounded px-1 text-[0.625rem] text-stone-600 opacity-0 transition-opacity hover:bg-gold/15 hover:text-gold-700 focus-visible:opacity-100 group-hover:opacity-100"
                    title={`${freeVillas} villa${freeVillas === 1 ? "" : "s"} free — create a booking`}
                  >
                    + {freeVillas} free
                  </button>
                )}
              </div>

              <ul className="mt-1 space-y-0.5">
                {onDay.slice(0, 3).map((view) => {
                  const status = bookingStatus.get(view.booking.status);
                  return (
                    <li key={view.booking.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to={`/admin/bookings/${view.booking.id}`}
                            className={cn(
                              "block truncate rounded px-1.5 py-0.5 text-[0.6875rem] transition-opacity hover:opacity-85",
                              toneSolid[status.tone],
                            )}
                          >
                            {view.villa?.name.replace("Villa ", "")} ·{" "}
                            {view.customer?.name.split(" ")[0]}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{view.customer?.name}</p>
                          <p>
                            {view.villa?.name} —{" "}
                            {view.booking.bookingMode === "whole"
                              ? "whole villa"
                              : view.roomNames.join(", ")}
                          </p>
                          <p>
                            {formatDateRange(view.booking.checkIn, view.booking.checkOut)} ·{" "}
                            {status.label}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
                {onDay.length > 3 && (
                  <li className="px-1.5 text-[0.6875rem] text-stone-600">
                    +{onDay.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- timeline */

function TimelineView({
  cursor,
  views,
  villas,
  today,
}: {
  cursor: Date;
  views: BookingView[];
  villas: ReturnType<typeof useVillas>;
  today: string;
}) {
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    toISODate(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  );
  const first = days[0];
  const afterLast = addDays(days[daysInMonth - 1], 1);

  /** A booking's bar, clipped to the visible month. */
  const bar = (view: BookingView) => {
    const start = view.booking.checkIn < first ? first : view.booking.checkIn;
    const end = view.booking.checkOut > afterLast ? afterLast : view.booking.checkOut;
    const startIndex = days.indexOf(start);
    const endIndex = end === afterLast ? daysInMonth : days.indexOf(end);
    if (startIndex < 0 || endIndex <= startIndex) return null;
    return { startIndex, span: endIndex - startIndex };
  };

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
      <div className="min-w-[52rem]">
        {/* Day ruler */}
        <div
          className="grid border-b border-gold/20"
          style={{ gridTemplateColumns: `11rem repeat(${daysInMonth}, minmax(0, 1fr))` }}
        >
          <div className="label-caps px-4 py-2.5">Villa / room</div>
          {days.map((day) => (
            <div
              key={day}
              className={cn(
                "py-2.5 text-center text-[0.6875rem] tabular-nums",
                day === today ? "bg-gold/12 font-semibold text-gold-700" : "text-stone-600",
              )}
            >
              {Number(day.slice(-2))}
            </div>
          ))}
        </div>

        {villas.map((villa) => {
          const villaBookings = views.filter((v) => v.booking.villaId === villa.id);
          const wholeHolds = villaBookings.filter((v) => v.booking.roomIds.length === 0);

          return (
            <div key={villa.id} className="border-b border-ink/8 last:border-b-0">
              {/* Villa row — whole-villa holds live here */}
              <Row
                label={villa.name}
                sublabel={villa.mode === "whole" ? "Whole villa" : "Whole-villa holds"}
                strong
                daysInMonth={daysInMonth}
                today={today}
                days={days}
                bars={wholeHolds}
                bar={bar}
              />

              {/* Room rows — only meaningful in split mode, but a whole-villa
                  hold is echoed across all of them so the block is obvious. */}
              {villa.mode === "split" &&
                villa.rooms.map((room) => {
                  const roomBookings = villaBookings.filter(
                    (v) =>
                      v.booking.roomIds.includes(room.id) || v.booking.roomIds.length === 0,
                  );
                  return (
                    <Row
                      key={room.id}
                      label={room.name}
                      sublabel={`Sleeps ${room.capacity}`}
                      indented
                      daysInMonth={daysInMonth}
                      today={today}
                      days={days}
                      bars={roomBookings}
                      bar={bar}
                    />
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label,
  sublabel,
  strong,
  indented,
  daysInMonth,
  today,
  days,
  bars,
  bar,
}: {
  label: string;
  sublabel: string;
  strong?: boolean;
  indented?: boolean;
  daysInMonth: number;
  today: string;
  days: string[];
  bars: BookingView[];
  bar: (view: BookingView) => { startIndex: number; span: number } | null;
}) {
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: `11rem repeat(${daysInMonth}, minmax(0, 1fr))` }}
    >
      <div className={cn("px-4 py-2", indented && "pl-8")}>
        <p className={cn("truncate text-sm", strong ? "font-medium text-ink" : "text-ink")}>
          {label}
        </p>
        <p className="truncate text-xs text-stone-600">{sublabel}</p>
      </div>

      {/* Background grid */}
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            "h-full min-h-11 border-l border-ink/8",
            day === today && "bg-gold/8",
          )}
        />
      ))}

      {/* Bars, placed over the grid on the same row */}
      {bars.map((view) => {
        const placed = bar(view);
        if (!placed) return null;
        const status = bookingStatus.get(view.booking.status);
        const whole = view.booking.roomIds.length === 0;
        return (
          <Tooltip key={view.booking.id}>
            <TooltipTrigger asChild>
              <Link
                to={`/admin/bookings/${view.booking.id}`}
                style={{
                  gridColumn: `${placed.startIndex + 2} / span ${placed.span}`,
                  gridRow: 1,
                }}
                className={cn(
                  "z-10 mx-0.5 flex items-center overflow-hidden rounded-md px-2 py-1 text-[0.6875rem] whitespace-nowrap transition-opacity hover:opacity-85",
                  toneSolid[status.tone],
                  whole && "ring-1 ring-white/40 ring-inset",
                )}
              >
                <span className="truncate">
                  {view.customer?.name}
                  {whole && " · whole villa"}
                </span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{view.customer?.name}</p>
              <p>
                {view.villa?.name} —{" "}
                {whole ? "whole villa, blocks every room" : view.roomNames.join(", ")}
              </p>
              <p>
                {formatDateRange(view.booking.checkIn, view.booking.checkOut)} · {status.label}
              </p>
              <p>{money(view.totals.total)}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
