import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBookings, useMockData, type BookingView } from "@/hooks/useData";
import { addDays, findConflicts } from "@/services/domain";
import { formatDate, money, nightsBetween } from "@/lib/format";

/**
 * Extend a stay at the guest's request.
 *
 * Moving check-out later is all it takes to keep the portal, Wi-Fi and
 * companion logins open — they all end at departure. The extra nights land on
 * the balance, due within the days set in Settings → Stay extensions.
 */
export function ExtendStayDialog({ view }: { view: BookingView }) {
  const { booking, customer, villa } = view;
  const { updateBooking, logActivity, settings } = useMockData();
  const bookings = useBookings();
  const [open, setOpen] = useState(false);
  const [checkOut, setCheckOut] = useState(addDays(booking.checkOut, 1));

  const extra = checkOut > booking.checkOut ? nightsBetween(booking.checkOut, checkOut) : 0;
  const cost = Math.round(extra * booking.charges.nightlyRate * (1 + booking.charges.taxRate));
  const conflicts = extra
    ? findConflicts(
        {
          villaId: booking.villaId,
          roomIds: booking.roomIds,
          checkIn: booking.checkOut,
          checkOut,
          ignoreBookingId: booking.id,
        },
        bookings,
      )
    : [];
  const days = settings?.extensionPaymentDays ?? 1;
  const dueAt = new Date(Date.now() + days * 86_400_000).toISOString();

  const extend = () => {
    updateBooking(booking.id, { checkIn: booking.checkIn, checkOut });
    updateBooking(booking.id, { extensionDueAt: dueAt });
    logActivity(
      booking.id,
      "booking",
      "Stay extended",
      `${customer?.name} · ${villa?.name} · to ${formatDate(checkOut)} (+${extra} ${extra === 1 ? "night" : "nights"}), ${money(cost)} due by ${formatDate(dueAt.slice(0, 10))}`,
    );
    toast.success(`Extended to ${formatDate(checkOut)} — portal access runs to the new departure`);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus aria-hidden />
        Extend stay
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend {customer?.name}&rsquo;s stay</DialogTitle>
            <DialogDescription>
              Currently departing {formatDate(booking.checkOut)}. Portal access, Wi-Fi and guest
              logins follow the new date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="extend-to">New check-out</Label>
            <Input
              id="extend-to"
              type="date"
              min={addDays(booking.checkOut, 1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              aria-invalid={conflicts.length > 0}
              aria-describedby="extend-summary"
            />
          </div>
          <p id="extend-summary" className="text-sm" role={conflicts.length ? "alert" : undefined}>
            {conflicts.length > 0 ? (
              <span className="text-status-cancelled">
                Clashes with {conflicts.map((c) => c.reference).join(", ")} — choose an earlier date.
              </span>
            ) : extra > 0 ? (
              <>
                +{extra} {extra === 1 ? "night" : "nights"} ·{" "}
                <strong className="tabular-nums">{money(cost)}</strong> incl. tax, due within {days}{" "}
                {days === 1 ? "day" : "days"} (by {formatDate(dueAt.slice(0, 10))}).
              </>
            ) : (
              "Pick a date after the current check-out."
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!extra || conflicts.length > 0} onClick={extend}>
              Extend stay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
