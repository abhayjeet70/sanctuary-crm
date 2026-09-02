import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import type { ID, Room } from "@/types";

/**
 * Add or edit one bedroom.
 *
 * Deleting is offered here but decided in the database: a room a live booking
 * still holds cannot be removed, and neither can a villa's last room. Both
 * refusals come back as the trigger's own message, which names what is in the
 * way — better than anything this dialog could guess at.
 */
export function RoomDialog({
  villaId,
  room,
  occupied,
  onClose,
}: {
  villaId: ID;
  /** Null when adding. */
  room: Room | null;
  /** A booking holds it today, so deleting is not offered at all. */
  occupied?: boolean;
  onClose: () => void;
}) {
  const { saveRoom, deleteRoom } = useMockData();
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 2));
  const [rate, setRate] = useState(String(room?.baseRate ?? 0));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return toast.error("Give the room a name");
    if (Number(capacity) < 1) return toast.error("A room sleeps at least one guest");

    saveRoom(villaId, {
      id: room?.id,
      name: name.trim(),
      capacity: Number(capacity),
      baseRate: Number(rate),
    });
    toast.success(room ? `${name.trim()} updated` : `${name.trim()} added`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{room ? room.name : "Add a room"}</DialogTitle>
            <DialogDescription>
              The rate is what this bedroom sells for on its own, when the villa is
              split. Whole-villa stays price off the villa rate instead.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="room-name">Name</Label>
              <Input
                id="room-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Room A-1"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="room-capacity">Sleeps</Label>
                <Input
                  id="room-capacity"
                  type="number"
                  min={1}
                  max={12}
                  required
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room-rate">Rate per night (₹)</Label>
                <Input
                  id="room-rate"
                  type="number"
                  min={0}
                  step={500}
                  required
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </div>
            </div>

            {occupied && (
              <p className="rounded-lg bg-status-inhouse-bg p-3 text-sm text-ink">
                A guest is in this room today. Its name and rate can still be changed;
                it cannot be removed.
              </p>
            )}
          </div>

          <DialogFooter className="mt-6 sm:justify-between">
            {room && !occupied ? (
              confirmingDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    deleteRoom(room.id);
                    onClose();
                  }}
                >
                  <Trash2 aria-hidden />
                  Yes, remove it
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-status-cancelled hover:bg-status-cancelled-bg"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 aria-hidden />
                  Remove room
                </Button>
              )
            ) : (
              <span />
            )}

            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">{room ? "Save" : "Add room"}</Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
