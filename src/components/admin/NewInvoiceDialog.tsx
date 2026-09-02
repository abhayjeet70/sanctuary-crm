import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common";
import { useBookingViews, useInvoices, useMockData } from "@/hooks/useData";
import { formatDateRange, money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Raise an invoice against a stay.
 *
 * Nothing is typed in: the guest, the villa, the nights, the charges and the
 * tax rate all come from the booking, and the number is allocated by the
 * database. Picking the stay is the whole of the decision.
 *
 * Bookings that already have an invoice are not offered — one stay, one number.
 */
export function NewInvoiceDialog({ onClose }: { onClose: () => void }) {
  const views = useBookingViews();
  const invoices = useInvoices();
  const { createInvoice } = useMockData();
  const [selected, setSelected] = useState<string | null>(null);

  const invoiced = new Set(invoices.map((i) => i.bookingId));
  const candidates = views
    .filter(
      (v) =>
        !invoiced.has(v.booking.id) &&
        v.booking.status !== "cancelled" &&
        v.booking.status !== "rejected" &&
        v.booking.status !== "inquiry",
    )
    .sort((a, b) => b.booking.checkIn.localeCompare(a.booking.checkIn));

  const raise = () => {
    if (!selected) return toast.error("Choose the stay this invoice is for");
    createInvoice(selected);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Choose the stay. Everything on the invoice — the guest, the nights, the
            charges and the tax — is taken from the booking.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {candidates.length === 0 ? (
            <EmptyState
              title="Every booking already has an invoice"
              description="Raise a new booking first, or open an existing invoice to send it."
            />
          ) : (
            <>
              <Label className="mb-2 block">Stay</Label>
              <ul
                className="max-h-80 space-y-2 overflow-y-auto pr-1"
                role="radiogroup"
                aria-label="Bookings without an invoice"
              >
                {candidates.map(({ booking, villa, customer, totals }) => (
                  <li key={booking.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected === booking.id}
                      onClick={() => setSelected(booking.id)}
                      className={cn(
                        "w-full rounded-xl p-3 text-left ring-1 transition-all",
                        selected === booking.id
                          ? "bg-gold/8 ring-gold/50"
                          : "bg-sand-200/50 ring-transparent hover:ring-gold/25",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-ink">{customer?.name}</span>
                        <span className="tabular-nums text-ink">{money(totals.total)}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-600">
                        {booking.reference} · {villa?.name} ·{" "}
                        {formatDateRange(booking.checkIn, booking.checkOut)}
                        {totals.balance > 0 && ` · ${money(totals.balance)} outstanding`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={raise} disabled={!selected}>
            Raise invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
