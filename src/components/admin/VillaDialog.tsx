import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMockData } from "@/hooks/useData";
import type { VillaMode } from "@/types";

/**
 * Open a new villa.
 *
 * Only what the database insists on, plus the two times: a villa with no
 * check-in hour is a villa the front desk has to guess about, and guessing is
 * what puts a guest at the gate an hour early. Everything else — gallery,
 * amenities, wifi, rates by season — is finished on the detail page, which is
 * where this lands you.
 */
const BLANK = {
  name: "",
  description: "",
  bedrooms: "4",
  capacity: "8",
  baseRate: "",
  weekendRate: "",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  mode: "whole" as VillaMode,
  image: "",
};

export function VillaDialog() {
  const { createVilla } = useMockData();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof BLANK, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fields.name.trim()) return setError("Give the villa a name.");
    if (Number(fields.bedrooms) < 1) return setError("A villa needs at least one bedroom.");
    if (Number(fields.capacity) < 1) return setError("Capacity must be at least one guest.");
    if (!Number(fields.baseRate)) return setError("Set a nightly rate.");
    setError(null);
    setSaving(true);
    const { id, error: failure } = await createVilla({
      name: fields.name.trim(),
      description: fields.description.trim(),
      bedrooms: Number(fields.bedrooms),
      capacity: Number(fields.capacity),
      baseRate: Number(fields.baseRate),
      weekendRate: Number(fields.weekendRate) || Number(fields.baseRate),
      checkInTime: fields.checkInTime,
      checkOutTime: fields.checkOutTime,
      mode: fields.mode,
      image: fields.image.trim(),
    });
    setSaving(false);

    if (failure || !id) {
      setError(failure ?? "Could not create the villa.");
      return;
    }

    toast.success(`${fields.name.trim()} added`, {
      description: "Finish the description, amenities and rooms here.",
    });
    setFields(BLANK);
    setOpen(false);
    navigate(`/admin/villas/${id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          Add villa
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a villa</DialogTitle>
          <DialogDescription>
            The essentials now; photographs, amenities and rooms on the next screen.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <div>
            <Label htmlFor="villa-name">Name</Label>
            <Input
              id="villa-name"
              className="mt-1.5"
              value={fields.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Villa Ananda"
              required
            />
          </div>

          <div>
            <Label htmlFor="villa-description">Description</Label>
            <Textarea
              id="villa-description"
              className="mt-1.5"
              rows={2}
              value={fields.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="A stone-and-timber house on the western ridge, wrapped in verandahs."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="villa-bedrooms">Bedrooms</Label>
              <Input
                id="villa-bedrooms"
                type="number"
                min={1}
                className="mt-1.5"
                value={fields.bedrooms}
                onChange={(e) => set("bedrooms", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="villa-capacity">Sleeps</Label>
              <Input
                id="villa-capacity"
                type="number"
                min={1}
                className="mt-1.5"
                value={fields.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="villa-rate">Nightly rate (₹)</Label>
              <Input
                id="villa-rate"
                inputMode="numeric"
                className="mt-1.5"
                value={fields.baseRate}
                onChange={(e) => set("baseRate", e.target.value)}
                placeholder="24000"
                required
              />
            </div>
            <div>
              <Label htmlFor="villa-weekend">Weekend rate (₹)</Label>
              <Input
                id="villa-weekend"
                inputMode="numeric"
                className="mt-1.5"
                value={fields.weekendRate}
                onChange={(e) => set("weekendRate", e.target.value)}
                placeholder="Same as nightly"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="villa-checkin">Check-in time</Label>
              <Input
                id="villa-checkin"
                type="time"
                className="mt-1.5"
                value={fields.checkInTime}
                onChange={(e) => set("checkInTime", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="villa-checkout">Check-out time</Label>
              <Input
                id="villa-checkout"
                type="time"
                className="mt-1.5"
                value={fields.checkOutTime}
                onChange={(e) => set("checkOutTime", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="villa-mode">Sold as</Label>
              <Select
                value={fields.mode}
                onValueChange={(value) => set("mode", value as VillaMode)}
              >
                <SelectTrigger id="villa-mode" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whole">The whole villa</SelectItem>
                  <SelectItem value="split">Room by room</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="villa-image">Photograph URL</Label>
              <Input
                id="villa-image"
                className="mt-1.5"
                value={fields.image}
                onChange={(e) => set("image", e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-cancelled">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add villa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
