import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BedDouble, CalendarDays, Check, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Eyebrow, StatusBadge } from "@/components/common";
import { useMockData, useVillas } from "@/hooks/useData";
import { supabase } from "@/services/supabase/client";
import { money, nightsBetween } from "@/lib/format";
import { toISODate } from "@/services/domain";
import { cn } from "@/lib/utils";

interface Availability {
  villa_id: string;
  villa_name: string;
  villa_mode: "whole" | "split";
  whole_available: boolean;
  free_rooms: number;
  total_rooms: number;
  nightly_rate: number;
}

interface RoomAvailability {
  room_id: string;
  name: string;
  capacity: number;
  base_rate: number;
  available: boolean;
}

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
};
const dayAfter = (from: string, days: number) => {
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/**
 * Book a stay.
 *
 * Availability comes from `check_availability`, which answers free/busy without
 * exposing anyone else's booking. The price is never sent from here — the
 * server reads it from the villa, so a tampered request cannot buy a villa
 * cheaply.
 */
export default function GuestBookPage() {
  const villas = useVillas();
  const navigate = useNavigate();
  const { today } = useMockData();

  const [checkIn, setCheckIn] = useState(tomorrow());
  const [checkOut, setCheckOut] = useState(dayAfter(tomorrow(), 2));
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [requests, setRequests] = useState("");

  const [results, setResults] = useState<Availability[] | null>(null);
  const [rooms, setRooms] = useState<RoomAvailability[]>([]);
  const [chosenVilla, setChosenVilla] = useState<string | null>(null);
  const [chosenRooms, setChosenRooms] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const datesValid = Boolean(checkIn && checkOut && checkOut > checkIn);

  // Any change to the dates invalidates what is on screen — showing stale
  // availability against new dates is how someone books an occupied villa.
  useEffect(() => {
    setResults(null);
    setChosenVilla(null);
    setChosenRooms([]);
  }, [checkIn, checkOut]);

  const search = async () => {
    if (!datesValid) return toast.error("Check-out must be after check-in");
    setSearching(true);
    const { data, error } = await supabase.rpc("check_availability", {
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    setSearching(false);
    if (error) return toast.error("Could not check availability", { description: error.message });
    setResults((data ?? []) as Availability[]);
  };

  const pickVilla = async (row: Availability) => {
    setChosenVilla(row.villa_id);
    setChosenRooms([]);
    if (row.villa_mode !== "split") return setRooms([]);

    const { data } = await supabase.rpc("check_room_availability", {
      p_villa_id: row.villa_id,
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    setRooms((data ?? []) as RoomAvailability[]);
  };

  const chosen = results?.find((r) => r.villa_id === chosenVilla);
  const isSplit = chosen?.villa_mode === "split";
  const nightly = isSplit
    ? rooms.filter((r) => chosenRooms.includes(r.room_id)).reduce((s, r) => s + r.base_rate, 0)
    : (chosen?.nightly_rate ?? 0);

  const confirm = async () => {
    if (!chosen) return;
    if (isSplit && chosenRooms.length === 0) return toast.error("Choose at least one room");

    setBooking(true);
    const { data, error } = await supabase.rpc("request_booking", {
      p_villa_id: chosen.villa_id,
      p_room_ids: isSplit ? chosenRooms : [],
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_adults: Number(adults),
      p_children: Number(children),
      p_special_requests: requests.trim() || null,
    });
    setBooking(false);

    if (error) return toast.error("Could not book those dates", { description: error.message });

    const reference = (data as { reference?: string })?.reference;
    toast.success(`Booked — ${reference}`, {
      description: "Pay and upload your receipt to confirm it.",
    });
    navigate("/guest/payment");
  };

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">Three houses above the escarpment</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Book a stay</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Pick your dates, choose a house, and pay by UPI or bank transfer. We confirm
          your booking once we have checked the receipt.
        </p>
      </header>

      {/* --------------------------------------------------------- the dates */}
      <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="check-in">Check-in</Label>
            <Input
              id="check-in"
              type="date"
              min={today}
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="check-out">Check-out</Label>
            <Input
              id="check-out"
              type="date"
              min={dayAfter(checkIn, 1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adults">Adults</Label>
            <Input
              id="adults"
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="children">Children</Label>
            <Input
              id="children"
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void search()} disabled={searching || !datesValid}>
            <Search aria-hidden />
            {searching ? "Checking…" : "Check availability"}
          </Button>
          {nights > 0 && (
            <span className="text-sm text-stone-600">
              <CalendarDays className="mr-1.5 inline size-4" aria-hidden />
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- the results */}
      {results && (
        <section>
          <Eyebrow className="mb-3 text-gold-700">
            {results.filter((r) => (r.villa_mode === "split" ? r.free_rooms > 0 : r.whole_available))
              .length || "No"}{" "}
            available for those dates
          </Eyebrow>

          <ul className="grid gap-4 lg:grid-cols-3">
            {results.map((row) => {
              const villa = villas.find((v) => v.id === row.villa_id);
              const free =
                row.villa_mode === "split" ? row.free_rooms > 0 : row.whole_available;
              const picked = chosenVilla === row.villa_id;

              return (
                <li key={row.villa_id}>
                  <button
                    type="button"
                    disabled={!free}
                    onClick={() => void pickVilla(row)}
                    aria-pressed={picked}
                    className={cn(
                      "group w-full overflow-hidden rounded-2xl bg-white text-left shadow-soft ring-1 transition-all",
                      picked ? "ring-2 ring-gold" : "ring-ink/[0.06] hover:ring-gold/40",
                      !free && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="relative block h-36 overflow-hidden">
                      <img
                        src={villa?.image}
                        alt={row.villa_name}
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span className="absolute top-3 right-3">
                        <StatusBadge
                          label={
                            free
                              ? row.villa_mode === "split"
                                ? `${row.free_rooms} of ${row.total_rooms} rooms free`
                                : "Available"
                              : "Not available"
                          }
                          tone={free ? "confirmed" : "cancelled"}
                        />
                      </span>
                    </span>

                    <span className="block p-5">
                      <span className="font-display text-xl text-ink">{row.villa_name}</span>
                      <span className="mt-1 flex items-center gap-4 text-xs text-stone-600">
                        <span className="flex items-center gap-1.5">
                          <BedDouble className="size-3.5" aria-hidden />
                          {row.total_rooms} bedrooms
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="size-3.5" aria-hidden />
                          sleeps {villa?.capacity}
                        </span>
                      </span>
                      <hr className="rule-gold my-3" />
                      <span className="block font-display text-lg text-ink">
                        {money(row.nightly_rate)}
                        <span className="ml-1 font-sans text-xs font-normal text-stone-600">
                          {row.villa_mode === "split" ? "/ night whole villa" : "/ night"}
                        </span>
                      </span>
                      {picked && (
                        <span className="mt-3 flex items-center gap-1.5 text-sm text-gold-700">
                          <Check className="size-4" aria-hidden />
                          Selected
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {results.length === 0 && (
            <EmptyState
              title="Nothing free for those dates"
              description="Try a different window — the houses book up on weekends and holidays."
            />
          )}
        </section>
      )}

      {/* ---------------------------------------------------- rooms + confirm */}
      {chosen && (
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
          <Eyebrow className="text-gold-700">Your stay at {chosen.villa_name}</Eyebrow>

          {isSplit && (
            <fieldset className="mt-4">
              <legend className="label-caps mb-2">Choose your rooms</legend>
              <div className="grid gap-2 sm:grid-cols-4">
                {rooms.map((room) => {
                  const picked = chosenRooms.includes(room.room_id);
                  return (
                    <label
                      key={room.room_id}
                      className={cn(
                        "rounded-lg p-3 text-sm transition-colors",
                        !room.available
                          ? "cursor-not-allowed bg-sand-200/40 opacity-55"
                          : picked
                            ? "cursor-pointer bg-gold/15 ring-1 ring-gold/50"
                            : "cursor-pointer bg-sand-200/70 hover:bg-sand-300/70",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!room.available}
                          checked={picked}
                          onChange={() =>
                            setChosenRooms((prev) =>
                              picked
                                ? prev.filter((r) => r !== room.room_id)
                                : [...prev, room.room_id],
                            )
                          }
                          className="size-4 accent-[var(--color-clay)]"
                        />
                        <span className="font-medium text-ink">{room.name}</span>
                      </span>
                      <span className="mt-1 block pl-6 text-xs text-stone-600">
                        {room.available
                          ? `Sleeps ${room.capacity} · ${money(room.base_rate)}`
                          : "Taken for these dates"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="guest-requests">Anything we should know? (optional)</Label>
            <Textarea
              id="guest-requests"
              rows={3}
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              placeholder="Vegetarian kitchen, arriving late, travelling with a toddler…"
            />
          </div>

          {nightly > 0 && (
            <div className="mt-5 rounded-xl bg-sand-200/60 p-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-600">
                    {money(nightly)} × {nights} {nights === 1 ? "night" : "nights"}
                  </dt>
                  <dd className="tabular-nums text-ink">{money(nightly * nights)}</dd>
                </div>
                <div className="flex justify-between text-xs text-stone-600">
                  <dt>GST is added on the invoice</dt>
                  <dd>{nightly > 7500 ? "18%" : "12%"}</dd>
                </div>
              </dl>
            </div>
          )}

          <Button
            className="mt-5 w-full sm:w-auto"
            onClick={() => void confirm()}
            disabled={booking || (isSplit && chosenRooms.length === 0)}
          >
            {booking ? "Booking…" : "Request this stay"}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            We hold the dates for you straight away. The booking is confirmed once you
            have paid and we have checked your receipt.
          </p>
        </section>
      )}
    </div>
  );
}
