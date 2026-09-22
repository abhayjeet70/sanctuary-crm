import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BedDouble, CalendarDays, Check, Hourglass, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Eyebrow, StatusBadge, Photo } from "@/components/common";
import { useMockData, useVillas, useWaitlist } from "@/hooks/useData";
import { supabase } from "@/services/supabase/client";
import { useSession } from "@/services/session";
import { formatDateRange, money, nightsBetween } from "@/lib/format";
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
  const { session } = useSession();
  const { today, joinWaitlist, updateWaitlistEntry } = useMockData();
  // RLS means this is already only their own rows.
  const waitlist = useWaitlist().filter((entry) => entry.status === "waiting");
  const [waiting, setWaiting] = useState<string | null>(null);

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
  const guests = Number(adults) + Number(children);
  const chosenVillaRecord = villas.find((v) => v.id === chosenVilla);
  // What the picked rooms sleep between them, so the guest is told before they
  // arrive rather than at the door.
  const roomsSleep = rooms
    .filter((r) => chosenRooms.includes(r.room_id))
    .reduce((sum, r) => sum + r.capacity, 0);

  const nightly = isSplit
    ? rooms.filter((r) => chosenRooms.includes(r.room_id)).reduce((s, r) => s + r.base_rate, 0)
    : (chosen?.nightly_rate ?? 0);

  /**
   * Ask to be told when dates that are already sold come free.
   *
   * The guest's own row, inserted under their own session — the waitlist
   * policy lets them join for themselves and withdraw, and nothing else. A
   * villa id of undefined means "any house will do", which is a real answer
   * and the one most people give.
   */
  const joinQueue = async (villaId?: string, villaName?: string) => {
    if (checkOut <= checkIn) return toast.error("Set your dates first");

    const already = waitlist.some(
      (entry) =>
        entry.checkIn === checkIn &&
        entry.checkOut === checkOut &&
        (entry.villaId ?? undefined) === villaId,
    );
    if (already) {
      return toast.info("You are already on the list for those dates");
    }

    if (!session?.customerId) {
      return toast.error("We could not find your guest record — call us and we will add you");
    }

    setWaiting(villaId ?? "any");
    const { error } = await joinWaitlist({
      customerId: session.customerId,
      villaId,
      checkIn,
      checkOut,
      adults: Number(adults) || 1,
      children: Number(children) || 0,
      source: "website",
      note: requests.trim(),
    });
    setWaiting(null);

    if (error) {
      return toast.error("Could not add you to the list", { description: error });
    }
    toast.success("You are on the waiting list", {
      description: `We will be in touch the moment ${villaName ?? "a house"} frees up for those dates.`,
    });
  };

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
      {/* The booking window stays put while the results scroll past it —
          changing the dates is the single thing a guest does most on this
          page, and scrolling back up to reach it is the friction every
          booking site removes. `z-20` clears the result cards; the guest
          header is not sticky, so nothing sits above it to offset. */}
      <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07] lg:sticky lg:top-4 lg:z-20">
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
                    <span className="relative block aspect-[3/2] overflow-hidden">
                      <Photo
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

                  {/* A house that is taken is not a dead tile: the dates may
                      come free, and this is the only moment the guest is
                      actually thinking about them. */}
                  {!free && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      disabled={waiting === row.villa_id}
                      onClick={() => void joinQueue(row.villa_id, row.villa_name)}
                    >
                      <Hourglass aria-hidden />
                      {waiting === row.villa_id
                        ? "Adding you…"
                        : `Tell me if ${row.villa_name} frees up`}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {results.length > 0 &&
            results.every((r) => (r.villa_mode === "split" ? r.free_rooms === 0 : !r.whole_available)) && (
            <div className="mt-4 rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
              <Eyebrow className="text-gold-400">All taken</Eyebrow>
              <p className="mt-2 max-w-lg text-sm text-sand/80">
                Every house is held for {formatDateRange(checkIn, checkOut)}. Plans change
                more often than you would think — put your name down and we will write to
                you the moment one is released, before it goes back on sale.
              </p>
              <Button
                variant="secondary"
                className="mt-4 bg-gold/15 text-gold-200 ring-1 ring-gold/35 hover:bg-gold/25 hover:text-white"
                disabled={waiting === "any"}
                onClick={() => void joinQueue(undefined, "a house")}
              >
                <Hourglass aria-hidden />
                {waiting === "any" ? "Adding you…" : "Put me on the waiting list"}
              </Button>
            </div>
          )}

          {results.length === 0 && (
            <EmptyState
              title="Nothing free for those dates"
              description="Try a different window — the houses book up on weekends and holidays."
            />
          )}
        </section>
      )}

      {/* ------------------------------------------------- already waiting */}
      {waitlist.length > 0 && (
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
          <Eyebrow className="text-gold-700">You are waiting for</Eyebrow>
          <ul className="mt-3 divide-y divide-ink/8">
            {waitlist.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
                <Hourglass className="size-4 shrink-0 text-stone" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {villas.find((v) => v.id === entry.villaId)?.name ?? "Any house"}
                  </p>
                  <p className="text-xs text-stone-600">
                    {formatDateRange(entry.checkIn, entry.checkOut)} · {entry.adults + entry.children}{" "}
                    guests
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateWaitlistEntry(entry.id, { status: "cancelled" });
                    toast.success("Taken off the list");
                  }}
                >
                  <X aria-hidden />
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------- rooms + confirm */}
      {chosen && (
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
          <Eyebrow className="text-gold-700">Your stay at {chosen.villa_name}</Eyebrow>

          {!isSplit && (
            <p className="mt-2 text-sm text-stone-600">
              The whole villa is yours — all {chosen.total_rooms} bedrooms, sleeping up to{" "}
              {chosenVillaRecord?.capacity ?? chosen.total_rooms * 2} guests. There are no
              other guests in the house.
            </p>
          )}

          {isSplit && (
            <fieldset className="mt-4">
              <legend className="label-caps mb-2">
                Choose your rooms — {chosenRooms.length} of {chosen.free_rooms} free
              </legend>
              <p className="mb-3 text-sm text-stone-600">
                {guests} {guests === 1 ? "guest" : "guests"}:{" "}
                {roomsSleep >= guests && chosenRooms.length > 0
                  ? `the ${chosenRooms.length === 1 ? "room" : "rooms"} you have picked sleep ${roomsSleep}.`
                  : `you will need enough beds for everyone — pick rooms sleeping ${guests} between them.`}
              </p>
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

          {isSplit && chosenRooms.length > 0 && roomsSleep < guests && (
            <p role="alert" className="mt-4 rounded-xl bg-status-pending-bg p-3 text-sm text-status-pending">
              Those rooms sleep {roomsSleep}, and you are {guests}. Add another room, or
              tell us below and we will add an extra bed.
            </p>
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
