import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { ResolveRequestDialog } from "@/components/admin/ResolveRequestDialog";
import { useMockData, useRequestViews } from "@/hooks/useData";
import { requestPriority, requestStatus, titleCase } from "@/lib/status";
import { formatDateTime, initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GuestRequest, RequestStatus, Team } from "@/types";

const ALL = "all";
const TEAMS: Team[] = ["housekeeping", "kitchen", "maintenance", "manager"];
const COLUMNS: RequestStatus[] = ["pending", "assigned", "in_progress", "completed", "rejected"];

/** The forward move offered on a card, given where it is. */
const ADVANCE: Partial<Record<RequestStatus, { to: RequestStatus; label: string }>> = {
  pending: { to: "assigned", label: "Assign" },
  assigned: { to: "in_progress", label: "Start work" },
  // in_progress deliberately absent: finishing goes through the resolve
  // dialog, so the guest is told what was actually done.
};

export default function RequestsPage() {
  const requests = useRequestViews();
  const { updateRequest } = useMockData();
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [resolving, setResolving] = useState<
    { request: GuestRequest; outcome: "completed" | "rejected" } | null
  >(null);

  const filtered = useMemo(
    () =>
      requests
        .filter((r) => (status === ALL ? true : r.request.status === status))
        .filter((r) => (priority === ALL ? true : r.request.priority === priority))
        // Open first, then urgency, then oldest — the order to work them in.
        .sort((a, b) => {
          const openOf = (r: typeof a) =>
            r.request.status === "completed" || r.request.status === "rejected" ? 1 : 0;
          const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
          return (
            openOf(a) - openOf(b) ||
            (rank[a.request.priority] ?? 9) - (rank[b.request.priority] ?? 9) ||
            a.request.createdAt.localeCompare(b.request.createdAt)
          );
        }),
    [requests, status, priority],
  );

  const open = requests.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );
  const urgent = open.filter((r) => r.request.priority === "urgent");
  const unassigned = open.filter((r) => !r.request.assignedTo);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Housekeeping · kitchen · maintenance · manager"
        title="Guest requests"
        description="Everything guests have asked for, and who is dealing with it."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={open.length} icon={<ClipboardList className="size-4" />} />
        <StatCard label="Urgent" value={urgent.length} tone={urgent.length ? "warn" : "default"} />
        <StatCard label="Unassigned" value={unassigned.length} />
        <StatCard
          label="Completed"
          value={requests.filter((r) => r.request.status === "completed").length}
          tone="accent"
        />
      </div>

      {/* -------------------------------------------------------- filter bar */}
      <div className="flex flex-wrap gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]">
        <div className="w-44 space-y-1.5">
          <Label htmlFor="request-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="request-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {requestStatus.all.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="request-priority">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="request-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any priority</SelectItem>
              {requestPriority.all.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="ml-auto self-end text-sm text-stone-600">
          {filtered.length} of {requests.length}
        </p>
      </div>

      {/* ------------------------------------------------------------- board */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="Nothing matches those filters"
          description="Clear the status filter to see completed and rejected requests too."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map(({ request, villa, customer }) => {
            const state = requestStatus.get(request.status);
            const level = requestPriority.get(request.priority);
            const step = ADVANCE[request.status];

            return (
              <li
                key={request.id}
                className={cn(
                  "rounded-xl bg-white p-5 shadow-soft ring-1 transition-all",
                  request.priority === "urgent" && request.status !== "completed"
                    ? "ring-status-cancelled/35"
                    : "ring-ink/[0.06]",
                )}
              >
                <div className="flex flex-wrap items-start gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold-700">
                    {initials(customer?.name ?? "")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gold-700">{request.reference}</span>
                      <StatusBadge label={level.label} tone={level.tone} />
                      <StatusBadge label={state.label} tone={state.tone} />
                      <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs text-stone-600">
                        {titleCase(request.category)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-relaxed text-ink">{request.description}</p>

                    <p className="mt-2 text-xs text-stone-600">
                      <Link
                        to={`/admin/customers/${customer?.id}`}
                        className="underline-offset-4 hover:text-clay-600 hover:underline"
                      >
                        {customer?.name}
                      </Link>{" "}
                      · {villa?.name} ·{" "}
                      <Link
                        to={`/admin/bookings/${request.bookingId}`}
                        className="underline-offset-4 hover:text-clay-600 hover:underline"
                      >
                        booking
                      </Link>{" "}
                      · {formatDateTime(request.createdAt)}
                    </p>

                    {request.status !== "completed" && request.status !== "rejected" ? (
                      <p className="mt-1 text-xs text-stone-600">
                        Still open · raised {relativeTime(request.createdAt)}
                      </p>
                    ) : (
                      request.resolutionNote && (
                        <p className="mt-2 rounded-lg bg-status-confirmed-bg p-2.5 text-xs leading-relaxed text-ink">
                          <span className="label-caps block text-gold-700">
                            {request.status === "rejected" ? "Declined" : "Resolved"}
                            {request.resolvedAt && ` · ${relativeTime(request.resolvedAt)}`}
                          </span>
                          <span className="mt-1 block">{request.resolutionNote}</span>
                        </p>
                      )
                    )}
                  </div>

                  <div className="flex flex-col items-stretch gap-2 sm:w-48">
                    <Select
                      value={request.assignedTo ?? ""}
                      onValueChange={(value) => {
                        updateRequest(request.id, {
                          assignedTo: value as Team,
                          status: request.status === "pending" ? "assigned" : request.status,
                        });
                        toast.success(`${request.reference} assigned to ${titleCase(value)}`);
                      }}
                      disabled={request.status === "completed" || request.status === "rejected"}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Assign ${request.reference} to a team`}
                      >
                        <SelectValue placeholder="Assign to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAMS.map((team) => (
                          <SelectItem key={team} value={team}>
                            {titleCase(team)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      {step && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            updateRequest(request.id, { status: step.to });
                            toast.success(`${request.reference} — ${step.label.toLowerCase()}`);
                          }}
                        >
                          {step.label}
                        </Button>
                      )}
                      {request.status === "in_progress" && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => setResolving({ request, outcome: "completed" })}
                        >
                          Mark done
                        </Button>
                      )}
                      {request.status !== "completed" && request.status !== "rejected" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-status-cancelled hover:bg-status-cancelled-bg"
                          onClick={() => setResolving({ request, outcome: "rejected" })}
                        >
                          Decline
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {resolving && (
        <ResolveRequestDialog
          request={resolving.request}
          outcome={resolving.outcome}
          onClose={() => setResolving(null)}
        />
      )}

      {/* A count per column, so the spread is visible without a kanban */}
      <div className="grid gap-3 sm:grid-cols-5">
        {COLUMNS.map((column) => {
          const meta = requestStatus.get(column);
          const count = requests.filter((r) => r.request.status === column).length;
          return (
            <button
              key={column}
              type="button"
              onClick={() => setStatus(column)}
              className="rounded-xl bg-white p-4 text-left shadow-soft ring-1 ring-ink/[0.06] transition-all hover:ring-gold/40"
            >
              <StatusBadge label={meta.label} tone={meta.tone} />
              <p className="mt-2 font-display text-2xl text-ink tabular-nums">{count}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
