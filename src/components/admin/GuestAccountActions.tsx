import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
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
import { useMockData } from "@/hooks/useData";
import { useSession } from "@/services/session";
import type { Customer } from "@/types";

/**
 * The two things an owner needs to do to a guest's account.
 *
 * Neither is routine, so neither sits in the main row of buttons — a reset
 * signs the guest out of nothing but does send them mail, and a delete is
 * final.
 *
 * The password is never set for them. A reset link goes to the guest's own
 * address and they choose it, so nobody at the property ever knows a guest's
 * password, and an owner cannot quietly take over a guest's account.
 */
export function GuestAccountActions({
  customer,
  bookingCount,
}: {
  customer: Customer;
  bookingCount: number;
}) {
  const { deleteCustomer } = useMockData();
  const { resetPassword, session } = useSession();
  const navigate = useNavigate();

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the owner. A manager may run the day without being able to erase a
  // guest — and RLS refuses the write anyway, so offering it would be a lie.
  if (session?.role !== "admin") return null;

  const sendReset = async () => {
    if (!customer.email) {
      toast.error("This guest has no email address on file");
      return;
    }
    setBusy(true);
    const { error: failure } = await resetPassword(customer.email);
    setBusy(false);
    if (failure) {
      toast.error("Could not send the reset link", { description: failure });
      return;
    }
    toast.success("Reset link sent", {
      description: `${customer.email} can now choose a new password.`,
    });
  };

  const remove = async () => {
    setBusy(true);
    const { error: failure } = await deleteCustomer(customer.id);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    toast.success(`${customer.name} deleted`);
    navigate("/admin/customers");
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void sendReset()} disabled={busy}>
          <KeyRound aria-hidden />
          Send password reset
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setError(null);
            setTyped("");
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden />
          Delete guest
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(open: boolean) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {customer.name}?</DialogTitle>
            <DialogDescription>
              {bookingCount > 0
                ? `This guest has ${bookingCount} ${bookingCount === 1 ? "booking" : "bookings"} on record. The database will refuse to delete them while those stays exist — cancel or reassign the bookings first.`
                : "Their contact details, preferences and any ID on file are removed for good. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          {bookingCount === 0 && (
            <div>
              <Label htmlFor="confirm-name">
                Type the guest's name to confirm
              </Label>
              <Input
                id="confirm-name"
                className="mt-1.5"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={customer.name}
                autoComplete="off"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-status-cancelled">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep them
            </Button>
            <Button
              variant="destructive"
              disabled={busy || bookingCount > 0 || typed.trim() !== customer.name}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete for good"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
