import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import type { Payment, PaymentRejectionReason } from "@/types";

export const REJECTION_REASONS: { value: PaymentRejectionReason; label: string; hint: string }[] = [
  { value: "wrong_amount", label: "Wrong amount", hint: "The transfer does not match what was due." },
  { value: "unreadable_receipt", label: "Unreadable receipt", hint: "The image is blurred, cropped or blank." },
  { value: "duplicate_receipt", label: "Duplicate receipt", hint: "This receipt has already been submitted." },
  { value: "wrong_bank_account", label: "Wrong bank account", hint: "Sent to an account that is not ours." },
  { value: "invalid_transaction", label: "Invalid transaction", hint: "No matching entry on the statement." },
  { value: "other", label: "Other", hint: "Explain in the note below." },
];

/** BR7 + BR10 — a rejection is destructive and must carry a reason, so the
 *  confirm button stays disabled until one is chosen. */
export function RejectPaymentDialog({
  payment,
  guestName,
  open,
  onOpenChange,
  onConfirm,
}: {
  payment: Payment;
  guestName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: PaymentRejectionReason, note?: string) => void;
}) {
  const [reason, setReason] = useState<PaymentRejectionReason | null>(null);
  const [note, setNote] = useState("");

  const close = (next: boolean) => {
    if (!next) {
      setReason(null);
      setNote("");
    }
    onOpenChange(next);
  };

  const noteRequired = reason === "other";
  const canSubmit = reason !== null && (!noteRequired || note.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-status-cancelled" aria-hidden />
            Reject this payment?
          </DialogTitle>
          <DialogDescription>
            {money(payment.amount)} from {guestName ?? "the guest"} · reference{" "}
            {payment.reference}. The booking returns to <strong>pending payment</strong> and
            the guest is asked to upload a new receipt.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="label-caps mb-2">Reason for rejection</legend>
          {REJECTION_REASONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors",
                reason === option.value
                  ? "bg-status-cancelled-bg ring-1 ring-status-cancelled/40"
                  : "hover:bg-sand-200/70",
              )}
            >
              <input
                type="radio"
                name="rejection-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="mt-1 size-4 accent-[var(--color-clay)]"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-stone-600">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="rejection-note">
            Note to the guest{" "}
            <span className="font-normal text-stone-600">
              {noteRequired ? "(required)" : "(optional)"}
            </span>
          </Label>
          <Textarea
            id="rejection-note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-invalid={noteRequired && note.trim().length === 0}
            aria-describedby={noteRequired ? "rejection-note-error" : undefined}
            placeholder="The advance due was ₹18,000 — please transfer the balance and re-upload."
          />
          {noteRequired && note.trim().length === 0 && (
            <p id="rejection-note-error" role="alert" className="text-xs text-status-cancelled">
              Choosing “Other” means you have to say what was wrong.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Keep it pending
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => {
              if (!reason) return;
              onConfirm(reason, note.trim() || undefined);
              close(false);
            }}
          >
            Reject payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
