import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScrollText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { useMockData } from "@/hooks/useData";
import { formatDateTime, initials } from "@/lib/format";
import { titleCase, type Tone } from "@/lib/status";
import type { ActivityKind } from "@/types";

const ALL = "all";

const KIND: Record<ActivityKind, { tone: Tone; section: string }> = {
  booking: { tone: "confirmed", section: "/admin/bookings" },
  payment: { tone: "uploaded", section: "/admin/payments" },
  food: { tone: "inhouse", section: "/admin/food" },
  request: { tone: "pending", section: "/admin/requests" },
  feedback: { tone: "completed", section: "/admin/feedback" },
  note: { tone: "completed", section: "/admin/bookings" },
  invoice: { tone: "confirmed", section: "/admin/invoices" },
};

/**
 * Everything the property has done, newest first.
 *
 * The same events that make up a booking's own timeline, unfiltered — this is
 * where you go when the question is "who changed that, and when".
 */
export default function ActivityLogPage() {
  const { activity } = useMockData();
  const [kind, setKind] = useState(ALL);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...activity]
      .sort((a, b) => b.at.localeCompare(a.at))
      .filter((event) => (kind === ALL ? true : event.kind === kind))
      .filter((event) =>
        needle
          ? [event.title, event.detail, event.actor]
              .filter(Boolean)
              .some((field) => field!.toLowerCase().includes(needle))
          : true,
      );
  }, [activity, kind, query]);

  const actors = new Set(activity.map((event) => event.actor));
  const todayCount = rows.filter(
    (event) => event.at.slice(0, 10) === new Date().toISOString().slice(0, 10),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Activity log"
        description="Every recorded change across bookings, payments, kitchen and requests."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Events"
          value={activity.length}
          icon={<ScrollText className="size-4" />}
        />
        <StatCard label="Today" value={todayCount} />
        <StatCard label="People" value={actors.size} hint="Named on an event" />
        <StatCard label="Showing" value={rows.length} hint="After filters" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Label htmlFor="activity-search">Search</Label>
          <div className="relative mt-1.5">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
              aria-hidden
            />
            <Input
              id="activity-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Guest, reference or who did it"
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-44">
          <Label htmlFor="activity-kind">Kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="activity-kind" className="mt-1.5 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All kinds</SelectItem>
              {Object.keys(KIND).map((value) => (
                <SelectItem key={value} value={value}>
                  {titleCase(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-5" />}
          title="Nothing matches"
          description="No recorded event fits the filters you have set."
        />
      ) : (
        <ul className="divide-y divide-ink/8 rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
          {rows.map((event) => {
            const meta = KIND[event.kind];
            const to =
              event.kind === "booking" || event.kind === "note"
                ? `/admin/bookings/${event.entityId}`
                : meta.section;
            return (
              <li key={event.id}>
                <Link
                  to={to}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 transition-colors hover:bg-gold/6"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[0.6875rem] font-semibold text-stone-600"
                    aria-hidden
                  >
                    {initials(event.actor || "System")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{event.title}</p>
                    {event.detail && (
                      <p className="mt-0.5 truncate text-xs text-stone-600">{event.detail}</p>
                    )}
                  </div>
                  <StatusBadge label={titleCase(event.kind)} tone={meta.tone} />
                  <p className="w-44 text-right text-xs text-stone-600">
                    {formatDateTime(event.at)}
                    <span className="block">{event.actor || "System"}</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
