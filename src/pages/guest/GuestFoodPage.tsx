import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EmptyState, ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { useGuestStay } from "@/hooks/useGuest";
import { useMenuForVilla, useMockData } from "@/hooks/useData";
import { foodOrderStatus, titleCase } from "@/lib/status";
import { formatDateTime, money } from "@/lib/format";
import { orderTotal } from "@/services/domain";
import { cn } from "@/lib/utils";
import type { FoodOrder, MenuCategory } from "@/types";

const ALL = "all";

/** Veg / non-veg is marked with the Indian square-dot convention, plus text. */
function DietDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center border",
        isVeg ? "border-status-confirmed" : "border-status-cancelled",
      )}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          isVeg ? "bg-status-confirmed" : "bg-status-cancelled",
        )}
      />
      <span className="sr-only">{isVeg ? "Vegetarian" : "Non-vegetarian"}</span>
    </span>
  );
}

export default function GuestFoodPage() {
  const { view, customer, orders } = useGuestStay();
  // A villa may run its own card, so the menu follows the stay.
  const menu = useMenuForVilla(view?.booking.villaId);
  const { createFoodOrder } = useMockData();

  const [category, setCategory] = useState<MenuCategory | typeof ALL>(ALL);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(menu.map((item) => item.category))),
    [menu],
  );
  const visible = menu.filter((item) => category === ALL || item.category === category);

  const lines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, quantity]) => {
      const item = menu.find((m) => m.id === id)!;
      return { menuItemId: id, name: item.name, price: item.price, quantity };
    });
  const total = orderTotal(lines);
  const itemCount = lines.reduce((n, line) => n + line.quantity, 0);

  if (!view) return <ErrorState className="m-5" title="No stay found" />;

  const setQty = (id: string, quantity: number) =>
    setCart((prev) => ({ ...prev, [id]: Math.max(0, quantity) }));

  const placeOrder = () => {
    if (lines.length === 0) return;
    setPlacing(true);
    const order: FoodOrder = {
      id: `f-${Date.now()}`,
      reference: `KIT-${String(Date.now()).slice(-4)}`,
      bookingId: view.booking.id,
      customerId: customer?.id ?? "",
      villaId: view.booking.villaId,
      roomId: view.booking.roomIds[0],
      lines,
      status: "placed",
      notes: notes.trim() || undefined,
      placedAt: new Date().toISOString(),
    };
    window.setTimeout(() => {
      createFoodOrder(order);
      setCart({});
      setNotes("");
      setCartOpen(false);
      setPlacing(false);
      toast.success("Order sent to the kitchen", {
        description: "We will call you to confirm before we start cooking.",
      });
    }, 600);
  };

  return (
    <div className="space-y-6 p-5 pb-28 sm:p-8 lg:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="text-gold-700">In-villa dining</Eyebrow>
          <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">The kitchen</h1>
          <p className="mt-2 max-w-lg text-sm text-stone-600">
            Cooked to order and brought to the verandah. Breakfast is included in your stay;
            everything else is added to your bill.
          </p>
        </div>

        {/* Cart — a sheet, so ordering never leaves the menu */}
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetTrigger asChild>
            <Button
              className={cn(
                "fixed inset-x-5 bottom-24 z-20 shadow-deep lg:static lg:inset-auto lg:shadow-none",
                itemCount === 0 && "hidden lg:inline-flex",
              )}
              disabled={itemCount === 0}
            >
              <ShoppingBag aria-hidden />
              {itemCount === 0
                ? "Your order"
                : `${itemCount} ${itemCount === 1 ? "item" : "items"} · ${money(total)}`}
            </Button>
          </SheetTrigger>
          <SheetContent className="flex flex-col">
            <SheetHeader>
              <SheetTitle>Your order</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4">
              {lines.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag className="size-5" />}
                  title="Nothing added yet"
                  description="Browse the menu and add what you would like."
                />
              ) : (
                <>
                  <ul className="divide-y divide-stone/15">
                    {lines.map((line) => (
                      <li key={line.menuItemId} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                          <p className="text-xs text-stone-600">{money(line.price)} each</p>
                        </div>
                        <QuantityStepper
                          value={line.quantity}
                          onChange={(next) => setQty(line.menuItemId, next)}
                          label={line.name}
                        />
                        <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink">
                          {money(line.price * line.quantity)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => setQty(line.menuItemId, 0)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 space-y-2">
                    <Label htmlFor="order-notes">Anything we should know?</Label>
                    <Textarea
                      id="order-notes"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="No chilli in the kurma, and could we eat at 8pm on the deck?"
                    />
                  </div>
                </>
              )}
            </div>

            {lines.length > 0 && (
              <SheetFooter>
                <div className="flex items-baseline justify-between">
                  <span className="label-caps">Total</span>
                  <span className="font-display text-2xl tabular-nums text-ink">
                    {money(total)}
                  </span>
                </div>
                <p className="text-xs text-stone-600">
                  Added to your room bill. We will call to confirm before cooking.
                </p>
                <Button onClick={placeOrder} disabled={placing}>
                  {placing ? "Sending…" : "Place order"}
                </Button>
              </SheetFooter>
            )}
          </SheetContent>
        </Sheet>
      </header>

      {/* ------------------------------------------------------- your orders */}
      {orders.length > 0 && (
        <section>
          <Eyebrow className="mb-3 text-gold-700">Your orders</Eyebrow>
          <ul className="space-y-3">
            {orders.slice(0, 4).map((order) => {
              const state = foodOrderStatus.get(order.status);
              return (
                <li
                  key={order.id}
                  className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gold/12"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                      </p>
                      <p className="mt-1 text-xs text-stone-600">
                        {order.reference} · {formatDateTime(order.placedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-ink">
                        {money(orderTotal(order.lines))}
                      </span>
                      <StatusBadge label={state.label} tone={state.tone} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------- category */}
      <nav aria-label="Menu categories" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {[ALL, ...categories].map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => setCategory(value as MenuCategory | typeof ALL)}
                aria-pressed={category === value}
                className={cn(
                  "rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors",
                  category === value
                    ? "bg-ink text-sand"
                    : "bg-white text-stone-600 ring-1 ring-gold/20 hover:text-ink hover:ring-gold/50",
                )}
              >
                {value === ALL ? "Everything" : titleCase(value)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* -------------------------------------------------------------- menu */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => {
          const quantity = cart[item.id] ?? 0;
          return (
            <li
              key={item.id}
              className={cn(
                "overflow-hidden rounded-2xl bg-white shadow-soft ring-1 transition-all",
                quantity > 0 ? "ring-gold/50" : "ring-gold/12",
                !item.available && "opacity-60",
              )}
            >
              <div className="relative h-40">
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {!item.available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink/65">
                    <StatusBadge label="Not available today" tone="cancelled" />
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start gap-2">
                  <DietDot isVeg={item.isVeg} />
                  <h3 className="min-w-0 flex-1 font-display text-lg leading-snug text-ink">
                    {item.name}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  {item.description}
                </p>
                <hr className="rule-gold my-3" />
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg tabular-nums text-ink">
                    {money(item.price)}
                  </span>
                  {quantity > 0 ? (
                    <QuantityStepper
                      value={quantity}
                      onChange={(next) => setQty(item.id, next)}
                      label={item.name}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!item.available}
                      onClick={() => setQty(item.id, 1)}
                    >
                      <Plus aria-hidden />
                      Add
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuantityStepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-sand-200 p-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={() => onChange(value - 1)}
        aria-label={`One fewer ${label}`}
      >
        <Minus aria-hidden />
      </Button>
      <span className="w-5 text-center text-sm tabular-nums text-ink" aria-live="polite">
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={() => onChange(value + 1)}
        aria-label={`One more ${label}`}
      >
        <Plus aria-hidden />
      </Button>
    </span>
  );
}
