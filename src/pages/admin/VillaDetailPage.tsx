import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, EyeOff, Pencil, Plus, Save, Wifi, X } from "lucide-react";
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
} from "@/components/ui/dialog";
import { ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { RoomDialog } from "@/components/admin/RoomDialog";
import { useBookings, useCustomers, useMockData, useVilla } from "@/hooks/useData";
import { bookingsOnDate } from "@/services/domain";
import { formatDateRange, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Room, VillaMode } from "@/types";

export default function VillaDetailPage() {
  const { id } = useParams();
  const villa = useVilla(id);
  const bookings = useBookings();
  const customers = useCustomers();
  const { setVillaMode, updateVilla, today } = useMockData();

  const [pendingMode, setPendingMode] = useState<VillaMode | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  // null = closed, "new" = adding, a Room = editing that one.
  const [roomEdit, setRoomEdit] = useState<Room | "new" | null>(null);
  const [amenity, setAmenity] = useState("");

  if (!villa) {
    return (
      <ErrorState
        title="Villa not found"
        action={
          <Button asChild variant="outline" className="mt-2">
            <Link to="/admin/villas">Back to villas</Link>
          </Button>
        }
      />
    );
  }

  const live = bookingsOnDate(bookings, villa.id, today);
  const split = villa.mode === "split";
  const fields = draft ?? {
    capacity: String(villa.capacity),
    baseRate: String(villa.baseRate),
    weekendRate: String(villa.weekendRate),
    seasonalRate: String(villa.seasonalRate),
    checkInTime: villa.checkInTime,
    checkOutTime: villa.checkOutTime,
    description: villa.description,
    wifiNetwork: villa.wifiNetwork,
    wifiPassword: villa.wifiPassword,
  };
  const set = (key: string, value: string) => setDraft({ ...fields, [key]: value });

  const save = () => {
    updateVilla(villa.id, {
      capacity: Number(fields.capacity),
      baseRate: Number(fields.baseRate),
      weekendRate: Number(fields.weekendRate),
      seasonalRate: Number(fields.seasonalRate),
      checkInTime: fields.checkInTime,
      checkOutTime: fields.checkOutTime,
      description: fields.description,
      wifiNetwork: fields.wifiNetwork,
      wifiPassword: fields.wifiPassword,
    });
    setDraft(null);
    toast.success(`${villa.name} updated`);
  };

  // Switching mode while rooms are held would strand those bookings, so the
  // confirmation says exactly what is in the way.
  const blockingBookings = live.length;

  return (
    <div className="space-y-6">
      <Button asChild variant="link" size="sm" className="-ml-2">
        <Link to="/admin/villas">
          <ArrowLeft aria-hidden />
          All villas
        </Link>
      </Button>

      {/* ------------------------------------------------------------ header */}
      <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.07]">
        <div className="relative h-48 sm:h-64">
          <img src={villa.image} alt={villa.name} className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent" />
          <div className="absolute inset-x-6 bottom-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow className="text-gold-400">
                {villa.bedrooms} bedrooms · sleeps {villa.capacity}
              </Eyebrow>
              <h1 className="display-caps mt-2 text-3xl text-white sm:text-4xl">
                {villa.name}
              </h1>
            </div>
            <StatusBadge
              label={split ? "Split into rooms" : "Whole villa"}
              tone={split ? "uploaded" : "confirmed"}
            />
          </div>
        </div>

        {/* --------------------------------------------------- mode toggle */}
        <div className="border-t border-gold/15 p-6">
          <Eyebrow className="text-gold-700">Operating mode</Eyebrow>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["whole", "split"] as const).map((mode) => {
              const active = villa.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => !active && setPendingMode(mode)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl p-4 text-left transition-all",
                    active
                      ? "bg-gold/12 ring-2 ring-gold"
                      : "bg-sand-200/60 ring-1 ring-transparent hover:bg-sand-300/60 hover:ring-gold/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {active && <Check className="size-4 text-gold-700" aria-hidden />}
                    <span className="font-medium text-ink">
                      {mode === "whole" ? "Whole villa" : "Split into rooms"}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-sm text-stone-600">
                    {mode === "whole"
                      ? "One inventory unit. A booking holds all four bedrooms — this is what the website sells."
                      : "Each bedroom is bookable on its own. Different guests can occupy different rooms."}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-stone-600">
            Whichever mode is active, a whole-villa hold still blocks every room and a room
            hold still blocks a whole-villa booking — the two can never overlap.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {/* -------------------------------------------------------- rooms */}
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-xl text-ink">Rooms</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {villa.bedrooms} bedrooms ·{" "}
                  {split ? "individually bookable" : "held together as one unit"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setRoomEdit("new")}>
                <Plus aria-hidden />
                Add room
              </Button>
            </div>
            <hr className="rule-gold my-4" />
            <ul className="grid gap-3 sm:grid-cols-2">
              {villa.rooms.map((room) => {
                const holder = live.find(
                  (b) => b.roomIds.length === 0 || b.roomIds.includes(room.id),
                );
                const guest = customers.find((c) => c.id === holder?.customerId);
                return (
                  <li
                    key={room.id}
                    className={cn(
                      "rounded-xl p-4",
                      holder ? "bg-status-inhouse-bg" : "bg-sand-200/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{room.name}</p>
                        <p className="mt-0.5 text-xs text-stone-600">
                          Sleeps {room.capacity} · {money(room.baseRate)} / night
                        </p>
                      </div>
                      <span className="flex items-center gap-1">
                        <StatusBadge
                          label={holder ? "Occupied" : "Available"}
                          tone={holder ? "inhouse" : "confirmed"}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${room.name}`}
                          onClick={() => setRoomEdit(room)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                      </span>
                    </div>
                    {holder && (
                      <p className="mt-3 border-t border-status-inhouse/20 pt-3 text-sm">
                        <Link
                          to={`/admin/bookings/${holder.id}`}
                          className="font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {guest?.name}
                        </Link>
                        <span className="block text-xs text-stone-600">
                          {holder.roomIds.length === 0 ? "Whole-villa booking" : "Room booking"} ·{" "}
                          {formatDateRange(holder.checkIn, holder.checkOut)}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ------------------------------------------------------ details */}
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl text-ink">Villa details</h2>
              {draft && (
                <Button size="sm" onClick={save}>
                  <Save aria-hidden />
                  Save changes
                </Button>
              )}
            </div>
            <hr className="rule-gold my-4" />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={fields.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:max-w-40">
                <Label htmlFor="capacity">Sleeps (whole villa)</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  max={40}
                  value={fields.capacity}
                  onChange={(event) => set("capacity", event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <RateField id="baseRate" label="Base rate" value={fields.baseRate} onChange={set} />
                <RateField id="weekendRate" label="Weekend rate" value={fields.weekendRate} onChange={set} />
                <RateField id="seasonalRate" label="Seasonal rate" value={fields.seasonalRate} onChange={set} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="checkInTime">Check-in time</Label>
                  <Input
                    id="checkInTime"
                    type="time"
                    value={fields.checkInTime}
                    onChange={(event) => set("checkInTime", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkOutTime">Check-out time</Label>
                  <Input
                    id="checkOutTime"
                    type="time"
                    value={fields.checkOutTime}
                    onChange={(event) => set("checkOutTime", event.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------- amenities */}
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <h2 className="text-xl text-ink">Amenities</h2>
            <p className="mt-1 text-sm text-stone-600">
              Shown to guests in the portal, on this villa only.
            </p>
            <hr className="rule-gold my-4" />
            <ul className="flex flex-wrap gap-2">
              {villa.amenities.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1 rounded-full bg-sand-200 py-1.5 pr-1.5 pl-3 text-sm text-ink"
                >
                  {item}
                  <button
                    type="button"
                    aria-label={`Remove ${item}`}
                    onClick={() =>
                      updateVilla(villa.id, {
                        amenities: villa.amenities.filter((a) => a !== item),
                      })
                    }
                    className="rounded-full p-0.5 text-stone hover:bg-white hover:text-ink"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="mt-4 flex max-w-sm gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = amenity.trim();
                if (!value) return;
                if (villa.amenities.includes(value)) {
                  setAmenity("");
                  return toast.error(`${value} is already listed`);
                }
                updateVilla(villa.id, { amenities: [...villa.amenities, value] });
                setAmenity("");
              }}
            >
              <Input
                aria-label="New amenity"
                value={amenity}
                onChange={(event) => setAmenity(event.target.value)}
                placeholder="Plunge pool"
              />
              <Button type="submit" variant="outline">
                <Plus aria-hidden />
                Add
              </Button>
            </form>
          </section>
        </div>

        {/* --------------------------------------------------------- aside */}
        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <div className="flex items-center gap-2">
              <Wifi className="size-4 text-gold-400" aria-hidden />
              <Eyebrow className="text-gold-400">Wi-Fi</Eyebrow>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="wifiNetwork" className="text-sand/60">
                Network
              </Label>
              <Input
                id="wifiNetwork"
                value={fields.wifiNetwork}
                onChange={(event) => set("wifiNetwork", event.target.value)}
                className="border-0 bg-sand/10 text-sand"
              />
            </div>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="wifiPassword" className="text-sand/60">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="wifiPassword"
                  type={showPassword ? "text" : "password"}
                  value={fields.wifiPassword}
                  onChange={(event) => set("wifiPassword", event.target.value)}
                  className="border-0 bg-sand/10 pr-10 font-mono text-sand"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-sand/60 hover:text-sand"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-sand/55">
              Shown to guests on their portal, on a card designed for reading aloud.
            </p>
          </section>

          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <Eyebrow className="text-gold-700">Gallery</Eyebrow>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {villa.gallery.map((src, index) => (
                <li key={`${src}-${index}`}>
                  <img
                    src={src}
                    alt={`${villa.name}, view ${index + 1}`}
                    loading="lazy"
                    className="h-16 w-full rounded-lg object-cover ring-1 ring-gold/20"
                  />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* -------------------------------------------------- mode confirmation */}
      <Dialog open={pendingMode !== null} onOpenChange={(open) => !open && setPendingMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Switch {villa.name} to{" "}
              {pendingMode === "split" ? "split rooms" : "whole villa"}?
            </DialogTitle>
            <DialogDescription>
              {pendingMode === "split"
                ? "Each of the four bedrooms becomes bookable on its own. Existing whole-villa bookings keep holding all four rooms."
                : "The villa becomes one inventory unit again. Existing room bookings keep their rooms until they end."}
              {blockingBookings > 0 && (
                <>
                  {" "}
                  There {blockingBookings === 1 ? "is" : "are"} currently {blockingBookings} live{" "}
                  {blockingBookings === 1 ? "booking" : "bookings"} on this villa.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMode(null)}>
              Leave it as it is
            </Button>
            <Button
              onClick={() => {
                if (!pendingMode) return;
                setVillaMode(villa.id, pendingMode);
                toast.success(
                  `${villa.name} is now ${pendingMode === "split" ? "split into rooms" : "sold as a whole villa"}`,
                );
                setPendingMode(null);
              }}
            >
              Switch mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {roomEdit && (
        <RoomDialog
          villaId={villa.id}
          room={roomEdit === "new" ? null : roomEdit}
          occupied={
            roomEdit !== "new" &&
            live.some((b) => b.roomIds.length === 0 || b.roomIds.includes(roomEdit.id))
          }
          onClose={() => setRoomEdit(null)}
        />
      )}
    </div>
  );
}

function RateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={500}
        value={value}
        onChange={(event) => onChange(id, event.target.value)}
      />
    </div>
  );
}
