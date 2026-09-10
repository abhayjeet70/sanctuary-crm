import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChefHat, ClipboardList, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Eyebrow, Logo, StatCard, StatusBadge } from "@/components/common";
import { ResolveRequestDialog } from "@/components/admin/ResolveRequestDialog";
import { useDepartment, useFoodOrderViews, useMockData, useRequestViews } from "@/hooks/useData";
import { FOOD_PIPELINE, foodOrderStatus, requestPriority, requestStatus, titleCase } from "@/lib/status";
import { formatTime, money } from "@/lib/format";
import { useSession } from "@/services/session";
import FrontDeskPage from "@/pages/admin/FrontDeskPage";
import { cn } from "@/lib/utils";
import type { GuestRequest, RequestStatus } from "@/types";

const ADVANCE: Partial<Record<RequestStatus, { to: RequestStatus; label: string }>> = {
  pending: { to: "in_progress", label: "Start" },
  assigned: { to: "in_progress", label: "Start" },
  // Finishing goes through the resolve dialog instead, so the guest is told
  // what was done rather than just that something was.
};

/**
 * The staff view: one queue, nothing else.
 *
 * Deliberately not the admin shell with items hidden. A housekeeper opening
 * this on a phone mid-shift wants the next job, not a navigation tree — and
 * RLS means the money and guest records behind that tree are unreachable
 * anyway, so showing them greyed out would only mislead.
 */
export default function StaffQueuePage() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const requests = useRequestViews();
  const orders = useFoodOrderViews();
  const { updateRequest, setFoodOrderStatus } = useMockData();
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<GuestRequest | null>(null);

  // What they may do comes from their department now, not a hardcoded team.
  const department = useDepartment(session?.departmentId);
  const may = (key: string) => session?.permissions?.includes(key as never) ?? false;
  const isKitchen = may("kitchen.work");
  const isFrontDesk = may("frontdesk.view");

  // RLS already scopes what arrives here to this team, but the page must not
  // depend on that: a policy is the boundary, not the filter. "Jobs for you"
  // has to mean it whatever the server sends.
  const mine = requests.filter(
    (r) =>
      may("requests.all") ||
      !session?.departmentId ||
      r.request.departmentId === session.departmentId,
  );

  const open = mine.filter(
    (r) => r.request.status !== "completed" && r.request.status !== "rejected",
  );
  const done = mine.filter((r) => r.request.status === "completed");
  const liveOrders = isKitchen
    ? orders.filter((o) => o.order.status !== "billed" && o.order.status !== "cancelled")
    : [];

  const leave = () => {
    void signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-dvh bg-sand">
      <header className="bg-sidebar">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <Logo variant="onDark" size="h-11" />
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gold/15 px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-gold-200 uppercase ring-1 ring-gold/30">
              {department?.name ?? titleCase(session?.team ?? "staff")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-sand/70 hover:bg-sand/12 hover:text-sand"
              onClick={leave}
            >
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Reception's job is not a queue of jobs — it is the desk. Same shell,
          same sign-out, a different screen inside it. Nothing here is hidden
          from them that they could act on: the desk page itself declines to
          offer check-in to anyone RLS would refuse. */}
      {isFrontDesk ? (
        <main className="mx-auto max-w-6xl space-y-6 p-5">
          <FrontDeskPage />
        </main>
      ) : (
      <main className="mx-auto max-w-3xl space-y-6 p-5">
        <div>
          <Eyebrow className="text-gold-700">{session?.name}</Eyebrow>
          <h1 className="display-caps mt-2 text-3xl text-ink">Your queue</h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Open jobs"
            value={open.length}
            icon={<ClipboardList className="size-4" />}
            tone={open.some((r) => r.request.priority === "urgent") ? "warn" : "default"}
          />
          <StatCard
            label={isKitchen ? "Live orders" : "Completed today"}
            value={isKitchen ? liveOrders.length : done.length}
            icon={isKitchen ? <ChefHat className="size-4" /> : undefined}
          />
        </div>

        {/* ---------------------------------------------------------- jobs */}
        <section>
          <Eyebrow className="mb-3 text-gold-700">Jobs for you</Eyebrow>
          {open.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="Nothing waiting"
              description="New jobs for your team appear here the moment a guest raises one."
            />
          ) : (
            <ul className="space-y-3">
              {open.map(({ request, villa }) => {
                const level = requestPriority.get(request.priority);
                const state = requestStatus.get(request.status);
                const step = ADVANCE[request.status];
                return (
                  <li
                    key={request.id}
                    className={cn(
                      "rounded-2xl bg-white p-5 shadow-soft ring-1",
                      request.priority === "urgent" ? "ring-status-cancelled/40" : "ring-gold/12",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={level.label} tone={level.tone} />
                      <StatusBadge label={state.label} tone={state.tone} />
                      <span className="text-xs text-stone-600">
                        {titleCase(request.category)}
                      </span>
                    </div>
                    <p className="mt-3 text-ink">{request.description}</p>
                    <p className="mt-2 text-xs text-stone-600">
                      {villa?.name} · raised {formatTime(request.createdAt)}
                    </p>
                    {step && (
                      <Button
                        className="mt-4 w-full sm:w-auto"
                        disabled={busy === request.id}
                        onClick={() => {
                          setBusy(request.id);
                          updateRequest(request.id, { status: step.to });
                          toast.success(`${request.reference} — ${step.label.toLowerCase()}`);
                          window.setTimeout(() => setBusy(null), 600);
                        }}
                      >
                        {busy === request.id ? <RefreshCw className="animate-spin" aria-hidden /> : null}
                        {step.label}
                      </Button>
                    )}
                    {request.status === "in_progress" && (
                      <Button
                        className="mt-4 w-full sm:w-auto"
                        onClick={() => setFinishing(request)}
                      >
                        Mark done
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {finishing && (
          <ResolveRequestDialog
            request={finishing}
            outcome="completed"
            onClose={() => setFinishing(null)}
          />
        )}

        {/* ------------------------------------------------- kitchen only */}
        {isKitchen && liveOrders.length > 0 && (
          <section>
            <Eyebrow className="mb-3 text-gold-700">Orders on the pass</Eyebrow>
            <ul className="space-y-3">
              {liveOrders.map(({ order, villa, roomName, total }) => {
                const state = foodOrderStatus.get(order.status);
                const next = FOOD_PIPELINE[FOOD_PIPELINE.indexOf(order.status) + 1];
                return (
                  <li key={order.id} className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gold/12">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-xs text-gold-700">{order.reference}</span>
                      <StatusBadge label={state.label} tone={state.tone} />
                    </div>
                    <p className="mt-2 text-sm text-ink">
                      {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-stone-600">
                      {villa?.name}
                      {roomName && ` · ${roomName}`} · {formatTime(order.placedAt)} · {money(total)}
                    </p>
                    {next && (
                      <Button
                        className="mt-4 w-full sm:w-auto"
                        onClick={() => {
                          setFoodOrderStatus(order.id, next);
                          toast.success(`${order.reference} — ${foodOrderStatus.get(next).label.toLowerCase()}`);
                        }}
                      >
                        {foodOrderStatus.get(next).label}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      )}
    </div>
  );
}
