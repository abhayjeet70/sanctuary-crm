import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, ImagePlus, Plus, ShieldAlert, X } from "lucide-react";
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
import { useMockData, useVillas } from "@/hooks/useData";
import {
  CATEGORIES,
  LOCATIONS,
  SENSITIVITY,
  SUGGESTED_SENSITIVITY,
} from "@/lib/lostFound";
import { ACCEPTED_PHOTO_TYPES } from "@/services/supabase/receipts";
import { cn } from "@/lib/utils";
import type { LostItemCategory, LostItemLocation, LostItemSensitivity } from "@/types";

const NONE = "none";

/** Local time, in the shape a datetime-local input wants. */
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * Log something found. Photo first.
 *
 * A housekeeper mid-turnover has a phone in one hand. What makes a record
 * reliable is a photograph, what it is, where it was, and which shelf it went
 * on — so that is the form. Everything else hides under "More detail" and can
 * be filled in by the desk later.
 */
export function LogFoundItemDialog({
  trigger,
  onLogged,
}: {
  trigger?: React.ReactNode;
  onLogged?: (itemId: string) => void;
}) {
  const villas = useVillas();
  const { logFoundItem } = useMockData();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LostItemCategory>("other");
  const [sensitivity, setSensitivity] = useState<LostItemSensitivity>("normal");
  const [location, setLocation] = useState<LostItemLocation>("room");
  const [villaId, setVillaId] = useState<string>(NONE);
  const [roomId, setRoomId] = useState<string>(NONE);
  const [locationNote, setLocationNote] = useState("");
  const [storage, setStorage] = useState("L&F shelf");
  const [storageRef, setStorageRef] = useState("");
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [colour, setColour] = useState("");
  const [distinguishing, setDistinguishing] = useState("");
  const [foundAt, setFoundAt] = useState(nowLocal());
  const [foundBy, setFoundBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const villa = villas.find((v) => v.id === villaId);

  // Previews are real resources; release them when the set changes.
  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const reset = () => {
    setPhotos([]);
    setTitle("");
    setCategory("other");
    setSensitivity("normal");
    setLocation("room");
    setVillaId(NONE);
    setRoomId(NONE);
    setLocationNote("");
    setStorageRef("");
    setMore(false);
    setDescription("");
    setBrand("");
    setColour("");
    setDistinguishing("");
    setFoundAt(nowLocal());
    setFoundBy("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2) return setError("Say what it is — “Black Apple Watch”.");
    if (!storage.trim()) return setError("Where has it been put? The shelf or safe.");
    if ((location === "villa" || location === "room") && villaId === NONE) {
      return setError("Which villa was it in?");
    }

    setSaving(true);
    const { item, error: failure } = await logFoundItem(
      {
        title: title.trim(),
        category,
        sensitivity,
        location,
        villaId: villaId === NONE ? undefined : villaId,
        roomId: roomId === NONE ? undefined : roomId,
        locationNote: locationNote.trim(),
        description: description.trim(),
        brand: brand.trim(),
        colour: colour.trim(),
        distinguishing: distinguishing.trim(),
        foundAt: new Date(foundAt).toISOString(),
        foundByName: foundBy.trim(),
        storageLocation: storage.trim(),
        storageRef: storageRef.trim(),
      },
      photos,
    );
    setSaving(false);

    if (!item) return setError(failure ?? "Could not log it");
    if (failure) toast.warning(failure);
    else toast.success(`${item.reference} logged`, { description: item.title });

    reset();
    setOpen(false);
    onLogged?.(item.id);
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
        {trigger ?? (
          <Button size="sm">
            <Plus aria-hidden />
            Log found item
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a found item</DialogTitle>
          <DialogDescription>
            A photo, what it is, where it was, where you put it. The desk can add the rest.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          {/* ------------------------------------------------ the photograph */}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES.join(",")}
            // Opens the camera directly on a phone, the file picker elsewhere.
            capture="environment"
            multiple
            className="sr-only"
            aria-label="Photographs of the item"
            onChange={(event) => {
              const chosen = Array.from(event.target.files ?? []);
              setPhotos((prev) => [...prev, ...chosen].slice(0, 4));
              event.target.value = "";
            }}
          />
          {photos.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/15 bg-sand-200/50 text-stone-600 transition-colors hover:border-gold/50 hover:bg-sand-200"
            >
              <Camera className="size-7" aria-hidden />
              <span className="text-sm font-medium text-ink">Take or add a photo</span>
              <span className="text-xs">The owner recognises it from this</span>
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {previews.map((url, index) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg">
                  <img src={url} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute top-1 right-1 rounded-full bg-ink/70 p-1 text-white"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  aria-label="Add another photo"
                  className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-ink/15 text-stone-600 hover:border-gold/50"
                >
                  <ImagePlus className="size-5" aria-hidden />
                </button>
              )}
            </div>
          )}

          {/* --------------------------------------------------- what it is */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-title">What is it</Label>
            <Input
              id="lf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Black Apple Watch"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-category">Kind</Label>
              <Select
                value={category}
                onValueChange={(value) => {
                  const next = value as LostItemCategory;
                  setCategory(next);
                  setSensitivity(SUGGESTED_SENSITIVITY[next] ?? "normal");
                }}
              >
                <SelectTrigger id="lf-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-sensitivity">Handling</Label>
              <Select
                value={sensitivity}
                onValueChange={(value) => setSensitivity(value as LostItemSensitivity)}
              >
                <SelectTrigger id="lf-sensitivity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SENSITIVITY).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {sensitivity !== "normal" && (
            <p className="flex items-start gap-2 rounded-lg bg-status-cancelled-bg p-3 text-sm text-status-cancelled">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {SENSITIVITY[sensitivity].label} items go straight to management and into
              secure storage. Put it in the safe, not on the shelf.
            </p>
          )}

          {/* ------------------------------------------------------- where */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-location">Found in</Label>
              <Select
                value={location}
                onValueChange={(value) => setLocation(value as LostItemLocation)}
              >
                <SelectTrigger id="lf-location" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LOCATIONS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-villa">Villa</Label>
              <Select
                value={villaId}
                onValueChange={(value) => {
                  setVillaId(value);
                  setRoomId(NONE);
                }}
              >
                <SelectTrigger id="lf-villa" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not in a villa</SelectItem>
                  {villas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {villa && villa.rooms.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="lf-room">Bedroom</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="lf-room" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not in a bedroom</SelectItem>
                  {villa.rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ------------------------------------------------ where it went */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-storage">Put away in</Label>
              <Input
                id="lf-storage"
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
                placeholder="L&F shelf"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-storage-ref">Shelf / bin</Label>
              <Input
                id="lf-storage-ref"
                value={storageRef}
                onChange={(e) => setStorageRef(e.target.value)}
                placeholder="B-04"
              />
            </div>
          </div>

          {/* ------------------------------------------------- more detail */}
          <button
            type="button"
            onClick={() => setMore((prev) => !prev)}
            aria-expanded={more}
            className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-ink"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", more && "rotate-180")}
              aria-hidden
            />
            More detail
          </button>

          {more && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lf-location-note">Exactly where</Label>
                <Input
                  id="lf-location-note"
                  value={locationNote}
                  onChange={(e) => setLocationNote(e.target.value)}
                  placeholder="Bedside table, left side"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lf-brand">Brand</Label>
                  <Input id="lf-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lf-colour">Colour</Label>
                  <Input id="lf-colour" value={colour} onChange={(e) => setColour(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lf-description">Description</Label>
                <Textarea
                  id="lf-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lf-distinguishing">Something only the owner would know</Label>
                <Textarea
                  id="lf-distinguishing"
                  rows={2}
                  value={distinguishing}
                  onChange={(e) => setDistinguishing(e.target.value)}
                  placeholder="An engraving, a sticker, what is inside"
                  aria-describedby="lf-distinguishing-hint"
                />
                <p id="lf-distinguishing-hint" className="text-xs text-stone-600">
                  Never shown to a guest. It is how we check a claim is genuine.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lf-found-at">Found at</Label>
                  <Input
                    id="lf-found-at"
                    type="datetime-local"
                    value={foundAt}
                    onChange={(e) => setFoundAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lf-found-by">Found by</Label>
                  <Input
                    id="lf-found-by"
                    value={foundBy}
                    onChange={(e) => setFoundBy(e.target.value)}
                    placeholder="You, unless someone handed it in"
                  />
                </div>
              </div>
            </div>
          )}

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
              {saving ? "Logging…" : "Log it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
