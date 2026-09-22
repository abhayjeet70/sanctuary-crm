import { Link } from "react-router-dom";
import { AlertTriangle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { useRequestViews, useVillas } from "@/hooks/useData";
import { requestPriority, requestStatus, titleCase } from "@/lib/status";
import { relativeTime } from "@/lib/format";

export default function MaintenancePage() {
  const villas = useVillas();
  const jobs = useRequestViews().filter(
    (r) => r.request.category === "maintenance" || r.request.assignedTo === "maintenance",
  );
  const open = jobs.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );
  const urgent = open.filter(
    (r) => r.request.priority === "urgent" || r.request.priority === "high",
  );

  // Anything the property has taken off sale — a villa under works, or a room
  // held back. These are the reasons inventory is short today.
  const outOfService = [
    ...villas
      .filter((v) => v.status !== "active")
      .map((v) => ({ id: v.id, name: v.name, detail: titleCase(v.status), villaId: v.id })),
    ...villas.flatMap((v) =>
      v.rooms
        .filter((r) => r.status === "blocked")
        .map((r) => ({ id: r.id, name: `${v.name} · ${r.name}`, detail: "Blocked", villaId: v.id })),
    ),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Repairs · plant · inventory held back"
        title="Maintenance"
        description="What is broken, who is on it, and what it is costing the property in rooms."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open jobs" value={open.length} icon={<Wrench className="size-4" />} />
        <StatCard
          label="Urgent"
          value={urgent.length}
          tone={urgent.length ? "warn" : "default"}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard label="Out of service" value={outOfService.length} hint="Villas and rooms" />
        <StatCard label="Closed" value={jobs.length - open.length} hint="All time" />
      </div>

      <section
        aria-labelledby="out-of-service"
        className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
      >
        <h2 id="out-of-service" className="px-6 pt-5 pb-3 text-xl text-ink">
          Out of service
        </h2>
        {outOfService.length === 0 ? (
          <EmptyState
            className="m-4"
            title="Everything is sellable"
            description="No villa or room is being held back today."
          />
        ) : (
          <ul className="divide-y divide-ink/8">
            {outOfService.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.name}</span>
                <StatusBadge label={row.detail} tone="cancelled" />
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/villas/${row.villaId}`}>Open villa</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="jobs"
        className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 id="jobs" className="text-xl text-ink">
            Maintenance jobs
          </h2>
          <Button asChild variant="link" size="sm">
            <Link to="/admin/requests">All requests</Link>
          </Button>
        </div>
        {jobs.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<Wrench className="size-5" />}
            title="Nothing reported"
            description="No maintenance has been raised against any villa."
          />
        ) : (
          <ul className="divide-y divide-ink/8">
            {jobs.map(({ request, villa, customer }) => {
              const priority = requestPriority.get(request.priority);
              const status = requestStatus.get(request.status);
              return (
                <li key={request.id} className="flex flex-wrap items-start gap-3 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{request.description}</p>
                    <p className="mt-0.5 text-xs text-stone-600">
                      {villa?.name}
                      {customer?.name && ` · reported by ${customer.name}`} ·{" "}
                      {relativeTime(request.createdAt)}
                      {request.assignedTo && ` · ${titleCase(request.assignedTo)}`}
                    </p>
                  </div>
                  <StatusBadge label={priority.label} tone={priority.tone} />
                  <StatusBadge label={status.label} tone={status.tone} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
