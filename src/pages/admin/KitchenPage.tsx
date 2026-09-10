import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChefHat, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, PageHeader, StatCard } from "@/components/common";
import { useFoodOrderViews, useMockData } from "@/hooks/useData";
import { FOOD_PIPELINE, foodOrderStatus } from "@/lib/status";
import { formatTime, money } from "@/lib/format";
import { orderTotal } from "@/services/domain";
import { cn } from "@/lib/utils";
import type { FoodOrderStatus } from "@/types";

/** The single action that moves a card to the next column. */
const ADVANCE: Partial<Record<FoodOrderStatus, { to: FoodOrderStatus; label: string }>> = {
  placed: { to: "confirmation_pending", label: "Call to confirm" },
  confirmation_pending: { to: "confirmed", label: "Confirm" },
  confirmed: { to: "cooking", label: "Start cooking" },
  cooking: { to: "ready", label: "Mark ready" },
  ready: { to: "served", label: "Mark served" },
  served: { to: "billed", label: "Bill to room" },
};

export default function KitchenPage() {
  const orders = useFoodOrderViews();
  const { setFoodOrderStatus, logActivity } = useMockData();
  const [cancelling, setCancelling] = useState<string | null>(null);

  const active = orders.filter((o) => o.order.status !== "cancelled");
  const inProgress = active.filter((o) => o.order.status !== "billed");
  const revenue = active
    .filter((o) => o.order.status === "billed")
    .reduce((sum, o) => sum + o.total, 0);

  const advance = (orderId: string, status: FoodOrderStatus) => {
    const step = ADVANCE[status];
    if (!step) return;
    const order = orders.find((o) => o.order.id === orderId);
    setFoodOrderStatus(orderId, step.to);
    if (order) {
      logActivity(
        order.order.bookingId,
        "food",
        `Order ${foodOrderStatus.get(step.to).label.toLowerCase()}`,
        order.order.reference,
      );
    }
    toast.success(
      step.to === "confirmation_pending"
        ? "Calling the guest to confirm"
        : `Order ${foodOrderStatus.get(step.to).label.toLowerCase()}`,
      { description: order?.order.reference },
    );
  };

  const cancelTarget = orders.find((o) => o.order.id === cancelling);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kitchen board"
        title="Food orders"
        description="Every order from placed to billed. Billed orders join the guest's booking total."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="In progress" value={inProgress.length} icon={<ChefHat className="size-4" />} />
        <StatCard
          label="Cooking now"
          value={active.filter((o) => o.order.status === "cooking").length}
        />
        <StatCard
          label="Ready to serve"
          value={active.filter((o) => o.order.status === "ready").length}
          tone={active.some((o) => o.order.status === "ready") ? "warn" : "default"}
        />
        <StatCard label="Billed today" value={money(revenue)} tone="accent" />
      </div>

      {/* -------------------------------------------------------------- board */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {FOOD_PIPELINE.map((column) => {
            const columnOrders = active.filter((o) => o.order.status === column);
            const meta = foodOrderStatus.get(column);
            return (
              <section
                key={column}
                aria-label={meta.label}
                className="flex w-72 shrink-0 flex-col rounded-xl bg-sand-200/60 p-3"
              >
                <header className="flex items-center justify-between gap-2 px-1 pb-3">
                  <h2 className="label-caps">{meta.label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-stone-600 ring-1 ring-gold/20">
                    {columnOrders.length}
                  </span>
                </header>

                {columnOrders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone/30 px-3 py-8 text-center text-xs text-stone-600">
                    Nothing here
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {columnOrders.map(({ order, villa, customer, roomName, total }) => {
                      const step = ADVANCE[order.status];
                      return (
                        <li
                          key={order.id}
                          className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-xs text-gold-700">
                              {order.reference}
                            </span>
                            <span className="text-xs text-stone-600">
                              {formatTime(order.placedAt)}
                            </span>
                          </div>

                          <Link
                            to={`/admin/bookings/${order.bookingId}`}
                            className="mt-1.5 block font-medium text-ink underline-offset-4 hover:text-clay-600 hover:underline"
                          >
                            {customer?.name}
                          </Link>
                          <p className="text-xs text-stone-600">
                            {villa?.name}
                            {roomName && ` · ${roomName}`}
                          </p>

                          <hr className="rule-gold my-3" />

                          <ul className="space-y-1 text-sm">
                            {order.lines.map((line) => (
                              <li key={line.menuItemId} className="flex justify-between gap-2">
                                <span className="min-w-0 truncate text-ink">
                                  <span className="text-gold-700 tabular-nums">
                                    {line.quantity}×
                                  </span>{" "}
                                  {line.name}
                                </span>
                                <span className="shrink-0 tabular-nums text-stone-600">
                                  {money(line.price * line.quantity)}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {order.notes && (
                            <p className="mt-3 rounded-lg bg-status-pending-bg p-2 text-xs text-ink">
                              {order.notes}
                            </p>
                          )}

                          <div className="mt-3 flex items-baseline justify-between border-t border-stone/15 pt-3">
                            <span className="label-caps">Total</span>
                            <span className="font-display text-lg tabular-nums text-ink">
                              {money(total)}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {step && (
                              <Button
                                size="sm"
                                className={cn(order.status === "placed" && "gap-1.5")}
                                onClick={() => advance(order.id, order.status)}
                              >
                                {order.status === "placed" && <Phone aria-hidden />}
                                {step.label}
                              </Button>
                            )}
                            {order.status !== "billed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-status-cancelled hover:bg-status-cancelled-bg"
                                onClick={() => setCancelling(order.id)}
                              >
                                <X aria-hidden />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {active.length === 0 && (
        <EmptyState
          icon={<ChefHat className="size-5" />}
          title="No orders on the board"
          description="Guests place orders from their portal, and they land in the first column."
        />
      )}

      {/* ------------------------------------------------------- cancellation */}
      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {cancelTarget?.order.reference}?</DialogTitle>
            <DialogDescription>
              {cancelTarget?.customer?.name}'s order of{" "}
              {cancelTarget ? money(orderTotal(cancelTarget.order.lines)) : ""} will be removed
              from the board and nothing will be billed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Keep the order
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelling) return;
                setFoodOrderStatus(cancelling, "cancelled");
                toast.error(`${cancelTarget?.order.reference} cancelled`);
                setCancelling(null);
              }}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
