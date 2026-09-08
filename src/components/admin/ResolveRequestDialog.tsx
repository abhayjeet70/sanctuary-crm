import { useState } from "react";
import { toast } from "sonner";
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
import { useMockData } from "@/hooks/useData";
import { titleCase } from "@/lib/status";
import type { GuestRequest, RequestStatus } from "@/types";

/** Something to offer when the desk is in a hurry, per category. */
const SUGGESTIONS: Record<string, string[]> = {
  housekeeping: ["Room serviced.", "Turndown done."],
  extra_towels: ["Fresh towels delivered."],
  food: ["Sent to the kitchen and served."],
  maintenance: ["Fixed and checked.", "Engineer attended."],
  transport: ["Cab booked and confirmed."],
  wifi: ["Router reset; connection tested."],
  room_setup: ["Room set up as asked."],
  other: ["Done."],
};

/**
 * Closing a request, with what was actually done.
 *
 * The note is not paperwork: it is the message the guest receives, so
 * "completed" stops being a claim with nothing behind it. Rejecting asks for
 * the reason for the same reason — a guest told no deserves to know why.
 */
export function ResolveRequestDialog({
  request,
  outcome,
  onClose,
}: {
  request: GuestRequest;
  outcome: Extract<RequestStatus, "completed" | "rejected">;
  onClose: () => void;
}) {
  const { updateRequest } = useMockData();
  const [note, setNote] = useState("");
  const rejecting = outcome === "rejected";
  const suggestions = SUGGESTIONS[request.category] ?? SUGGESTIONS.other;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (rejecting && note.trim().length < 4) {
      return toast.error("Say why, so the guest is not left guessing");
    }

    updateRequest(request.id, { status: outcome, resolutionNote: note.trim() || undefined });
    toast[rejecting ? "error" : "success"](
      `${request.reference} ${rejecting ? "declined" : "closed"}`,
      { description: "The guest has been told." },
    );
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {rejecting ? "Decline" : "Close"} {request.reference}
            </DialogTitle>
            <DialogDescription>
              {titleCase(request.category)} — “{request.description}”
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-2">
            <Label htmlFor="resolution-note">
              {rejecting ? "Why not?" : "What was done?"}
              {!rejecting && <span className="ml-1 text-stone-600">(optional)</span>}
            </Label>
            <Textarea
              id="resolution-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                rejecting
                  ? "We do not have a spare cot, but we can add a mattress."
                  : suggestions[0]
              }
            />
            <p className="text-xs text-stone-600">This is sent to the guest.</p>

            {!rejecting && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => setNote(text)}
                    className="rounded-full bg-sand-200 px-3 py-1 text-xs text-ink transition-colors hover:bg-gold/20"
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={rejecting ? "destructive" : "default"}>
              {rejecting ? "Decline and tell the guest" : "Close and tell the guest"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
