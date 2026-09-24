import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  Check,
  Hourglass,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Eyebrow, StatusBadge, Photo } from "@/components/common";
import { useMockData, useSettings, useVillas, useWaitlist } from "@/hooks/useData";
import { useGuestStay } from "@/hooks/useGuest";
import { ChipGroup, DiningInfo, PaymentAndPolicies } from "@/components/booking/StayInfo";
import { supabase } from "@/services/supabase/client";
import { useSession } from "@/services/session";
import { formatDateRange, money, nightsBetween } from "@/lib/format";
import { toISODate } from "@/services/domain";
import {
  CUISINES,
  DIETARY_OPTIONS,
  EMPTY_PREFERENCES,
  MEALS,
  OCCASIONS,
  toggle,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";
import type { DietaryPreference } from "@/types";

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
 * The enquiry.
 *
 * One form, asked once. Whether it ends as a booking or as a place in the
 * queue is decided by the availability check partway down — and either way the
 * same answers travel on, to the desk, the kitchen and the confirmation. A
 * guest who has told us they are vegetarian and arriving at ten should never be
 * asked a second time because the dates happened to be sold.
 *
 * Availability is the existing `check_availability` RPC and the existing
 * exclusion constraint behind it. Nothing here decides what is free.
 */
export default function GuestBookPage() {
  const villas = useVillas();
  const settings = useSettings();
  const navigate = useNavigate();
  const { session } = useSession();
  const { today, joinWaitlist, updateWaitlistEntry, saveCustomer } = useMockData();
  const { customer } = useGuestStay();
  const waitlist = useWaitlist().filter((entry) => entry.status === "waiting");

  /* ------------------------------------------------------- guest details */
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("India");

  // Seeded from the customer record once it arrives, and only while the
  // fields are still untouched — typing must never be overwritten by a
  // refetch landing a moment later.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || !customer) return;
    setName(customer.name ?? "");
    setPhone(customer.phone ?? "");
    setCountry(customer.country || "India");
  }, [customer, touched]);

  /* --------------------------------------------------------- stay details */
  const [checkIn, setCheckIn] = useState(tomorrow());
  const [checkOut, setCheckOut] = useState(dayAfter(tomorrow(), 2));
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Availability[] | null>(null);
  const [rooms, setRooms] = useState<RoomAvailability[]>([]);
  const [chosenVilla, setChosenVilla] = useState<string | null>(null);
  const [chosenRooms, setChosenRooms] = useState<string[]>([]);

  /* --------------------------------------------------------- preferences */
  const [prefs, setPrefs] = useState(EMPTY_PREFERENCES);
  const [requests, setRequests] = useState("");

  const [agreed, setAgreed] = useState(false);
  const [booking, setBooking] = useState(false);
  const [waiting, setWaiting] = useState<string | null>(null);

  const nights = checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  const datesValid = nights > 0;
  const guests = Number(adults) + Number(children);

  /* ------------------------------------------------------------ searching */

  const search = async () => {
    if (!datesValid) return;
    setSearching(true);
    setChosenVilla(null);
    setChosenRooms([]);
    const { data, error } = await supabase.rpc("check_availability", {
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    setSearching(false);
    if (error) return toast.error("Could not check those dates", { description: error.message });
    setResults((data ?? []) as Availability[]);
  };

  // The dates changing invalidates the answer we are showing. Clearing it is
  // the honest move: a stale "available" is how somebody books a sold house.
  useEffect(() => {
    setResults(null);
    setChosenVilla(null);
    setChosenRooms([]);
    setRooms([]);
  }, [checkIn, checkOut]);

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
  const chosenVillaRecord = villas.find((v) => v.id === chosenVilla);
  const chosenFree = chosen
    ? isSplit
      ? chosen.free_rooms > 0
      : chosen.whole_available
    : false;

  const roomsSleep = rooms
    .filter((r) => chosenRooms.includes(r.room_id))
    .reduce((sum, r) => sum + r.capacity, 0);

  const nightly = isSplit
    ? rooms.filter((r) => chosenRooms.includes(r.room_id)).reduce((s, r) => s + r.base_rate, 0)
    : (chosen?.nightly_rate ?? 0);

  const everythingTaken = Boolean(
    results?.length &&
      results.every((r) => (r.villa_mode === "split" ? r.free_rooms === 0 : !r.whole_available)),
  );

  /* -------------------------------------------------- what we send onward */

  const preferencePayload = useMemo(
    () => ({ ...prefs, specialRequests: requests.trim() }),
    [prefs, requests],
  );

  /** Keep the customer record in step with what they have just told us. */
  const saveGuestDetails = () => {
    if (!customer) return;
    const changed =
      name.trim() !== customer.name ||
      phone.trim() !== customer.phone ||
      country.trim() !== customer.country;
    if (!changed) return;
    saveCustomer({
      id: customer.id,
      name: name.trim() || customer.name,
      phone: phone.trim(),
      email: customer.email,
      country: country.trim() || "India",
      preferences: customer.preferences,
    });
  };

  const missing = (): string | null => {
    if (!name.trim()) return "Tell us who the stay is for";
    if (!phone.trim()) return "We need a phone number to reach you on";
    if (!datesValid) return "Set your dates";
    return null;
  };

  /* -------------------------------------------------------------- booking */

  const confirm = async () => {
    if (!chosen) return;
    const gap = missing();
    if (gap) return toast.error(gap);
    if (isSplit && chosenRooms.length === 0) return toast.error("Choose at least one room");

    setBooking(true);
    saveGuestDetails();
    const { data, error } = await supabase.rpc("request_booking", {
      p_villa_id: chosen.villa_id,
      p_room_ids: isSplit ? chosenRooms : [],
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_adults: Number(adults),
      p_children: Number(children),
      p_special_requests: requests.trim() || null,
      p_check_in_time: arrival || null,
      p_check_out_time: departure || null,
      p_prefs: preferencePayload,
    });
    setBooking(false);

    if (error) return toast.error("Could not book those dates", { description: error.message });

    const reference = (data as { reference?: string })?.reference;
    toast.success(`Booked — ${reference}`, {
      description: "Pay and upload your receipt to confirm it.",
    });
    navigate("/guest/payment");
  };

  /* ------------------------------------------------------------- waitlist */

  /**
   * Ask to be told when dates that are already sold come free.
   *
   * Everything typed above travels with it — a villa id of undefined means
   * "any house will do", which is a real answer and the one most people give.
   */
  const joinQueue = async (villaId?: string, villaName?: string) => {
    const gap = missing();
    if (gap) return toast.error(gap);
    if (!session?.customerId) {
      return toast.error("We could not find your guest record — call us and we will add you");
    }

    const already = waitlist.some(
      (entry) =>
        entry.checkIn === checkIn &&
        entry.checkOut === checkOut &&
        (entry.villaId ?? undefined) === villaId,
    );
    if (already) return toast.info("You are already on the list for those dates");

    setWaiting(villaId ?? "any");
    saveGuestDetails();
    const { error } = await joinWaitlist(
      {
        customerId: session.customerId,
        villaId,
        checkIn,
        checkOut,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        source: "website",
        note: requests.trim(),
        roomIds: isSplit ? chosenRooms : [],
        checkInTime: arrival || undefined,
        checkOutTime: departure || undefined,
      },
      undefined,
      preferencePayload,
    );
    setWaiting(null);

    if (error) return toast.error("Could not add you to the list", { description: error });
    toast.success("You are on the waiting list", {
      description: `We will be in touch the moment ${villaName ?? "a house"} frees up for those dates.`,
    });
    navigate("/guest/waitlist");
  };

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">Three houses above the escarpment</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Plan your stay</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Tell us once and we carry it through — the kitchen, the desk and your
          confirmation all read the same answers.
        </p>
      </header>

      {/* ------------------------------------------------------ 1. the guest */}
      <Section step="1" title="Who is coming">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="guest-name" label="Full name">
            <Input
              id="guest-name"
              value={name}
              onChange={(e) => {
                setTouched(true);
                setName(e.target.value);
              }}
              placeholder="Siddarth Rao"
              autoComplete="name"
            />
          </Field>
          <Field id="guest-phone" label="Phone">
            <Input
              id="guest-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setTouched(true);
                setPhone(e.target.value);
              }}
              placeholder="+91 98450 00000"
              autoComplete="tel"
            />
          </Field>
          <Field id="guest-email" label="Email">
            <Input
              id="guest-email"
              value={customer?.email ?? ""}
              readOnly
              aria-describedby="email-hint"
              className="bg-sand-200/60"
            />
            <p id="email-hint" className="mt-1.5 text-xs text-stone-600">
              The address you signed in with.
            </p>
          </Field>
          <Field id="guest-country" label="Country">
            <Input
              id="guest-country"
              value={country}
              onChange={(e) => {
                setTouched(true);
                setCountry(e.target.value);
              }}
              placeholder="India"
              autoComplete="country-name"
            />
          </Field>
        </div>
      </Section>

      {/* ------------------------------------------------------- 2. the stay */}
      <Section step="2" title="When, and how many">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field id="check-in" label="Check-in">
            <Input
              id="check-in"
              type="date"
              min={today}
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </Field>
          <Field id="check-out" label="Check-out">
            <Input
              id="check-out"
              type="date"
              min={dayAfter(checkIn, 1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </Field>
          <Field id="adults" label="Adults">
            <Input
              id="adults"
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
            />
          </Field>
          <Field id="children" label="Children">
            <Input
              id="children"
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="arrival" label="Arriving around" hint="Leave blank for the house's own hours.">
            <Input
              id="arrival"
              type="time"
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
            />
          </Field>
          <Field id="departure" label="Leaving around" hint="We will hold the room if we can.">
            <Input
              id="departure"
              type="time"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => void search()} disabled={searching || !datesValid}>
            <Search aria-hidden />
            {searching ? "Checking…" : "Check availability"}
          </Button>
          {nights > 0 && (
            <span className="text-sm text-stone-600">
              <CalendarDays className="mr-1.5 inline size-4" aria-hidden />
              {nights} {nights === 1 ? "night" : "nights"} · {guests}{" "}
              {guests === 1 ? "guest" : "guests"}
            </span>
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------- 3. which house */}
      {results && (
        <Section
          step="3"
          title="Which house"
          subtitle={
            everythingTaken
              ? `Every house is held for ${formatDateRange(checkIn, checkOut)}.`
              : undefined
          }
        >
          <ul className="grid gap-4 lg:grid-cols-3">
            {results.map((row) => {
              const villa = villas.find((v) => v.id === row.villa_id);
              const free = row.villa_mode === "split" ? row.free_rooms > 0 : row.whole_available;
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
                                : "These dates are available"
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
                        : `Wait for ${row.villa_name}`}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {everythingTaken && (
            <div className="mt-4 rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
              <Eyebrow className="text-gold-400">All taken</Eyebrow>
              <p className="mt-2 max-w-lg text-sm text-sand/80">
                Plans change more often than you would think. Put your name down and we
                will write to you the moment a house is released — everything you have
                filled in here comes with you, so there is nothing to type again.
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

          {/* --------------------------------------------------- the rooms */}
          {chosen && chosenFree && (
            <div className="mt-6 rounded-2xl bg-sand-200/50 p-5">
              <Eyebrow className="text-gold-700">Your rooms at {chosen.villa_name}</Eyebrow>

              {!isSplit ? (
                <p className="mt-2 text-sm text-stone-600">
                  The whole villa is yours — all {chosen.total_rooms} bedrooms, sleeping up
                  to {chosenVillaRecord?.capacity ?? chosen.total_rooms * 2} guests. There
                  are no other guests in the house.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-stone-600">
                    {guests} {guests === 1 ? "guest" : "guests"}:{" "}
                    {roomsSleep >= guests && chosenRooms.length > 0
                      ? `the ${chosenRooms.length === 1 ? "room" : "rooms"} you have picked sleep ${roomsSleep}.`
                      : `pick rooms sleeping ${guests} between them.`}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    {rooms.map((room) => {
                      const picked = chosenRooms.includes(room.room_id);
                      return (
                        <label
                          key={room.room_id}
                          className={cn(
                            "rounded-lg p-3 text-sm transition-colors",
                            !room.available
                              ? "cursor-not-allowed bg-white/40 opacity-55"
                              : picked
                                ? "cursor-pointer bg-gold/15 ring-1 ring-gold/50"
                                : "cursor-pointer bg-white hover:bg-white/70",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={!room.available}
                              checked={picked}
                              onChange={() =>
                                setChosenRooms((prev) => toggle(prev, room.room_id))
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
                </>
              )}
            </div>
          )}
        </Section>
      )}

      {/* --------------------------------------------------------- 4. food */}
      <Section
        step="4"
        title="Food and dining"
        subtitle="So the kitchen can plan before you arrive rather than after."
      >
        <DiningInfo settings={settings} />
        <div className="mt-5 space-y-5">
          <Field id="dietary" label="Dietary preference">
            <Select
              value={prefs.dietary}
              onValueChange={(value) =>
                setPrefs({ ...prefs, dietary: value as DietaryPreference })
              }
            >
              <SelectTrigger id="dietary" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIETARY_OPTIONS.map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <ChipGroup
            legend="Meals you would like"
            options={MEALS}
            selected={prefs.meals}
            onToggle={(value) => setPrefs({ ...prefs, meals: toggle(prefs.meals, value) })}
          />

          <ChipGroup
            legend="Kinds of food"
            options={CUISINES}
            selected={prefs.cuisines}
            onToggle={(value) => setPrefs({ ...prefs, cuisines: toggle(prefs.cuisines, value) })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="allergies"
              label="Allergies"
              hint="Anything the kitchen must never serve."
            >
              <Input
                id="allergies"
                value={prefs.allergies}
                onChange={(e) => setPrefs({ ...prefs, allergies: e.target.value })}
                placeholder="Peanuts, shellfish"
              />
            </Field>
            <Field id="dietary-notes" label="Dietary restrictions">
              <Input
                id="dietary-notes"
                value={prefs.dietaryNotes}
                onChange={(e) => setPrefs({ ...prefs, dietaryNotes: e.target.value })}
                placeholder="No onion or garlic"
              />
            </Field>
          </div>

          <Field id="food-notes" label="Anything else about the food">
            <Textarea
              id="food-notes"
              rows={2}
              value={prefs.foodNotes}
              onChange={(e) => setPrefs({ ...prefs, foodNotes: e.target.value })}
              placeholder="Breakfast on the verandah if the weather allows"
            />
          </Field>
        </div>
      </Section>

      {/* ------------------------------------------------ 5. the stay itself */}
      <Section step="5" title="Anything we should arrange">
        <ChipGroup
          legend="Tick what applies"
          options={OCCASIONS}
          selected={prefs.occasions}
          onToggle={(value) => setPrefs({ ...prefs, occasions: toggle(prefs.occasions, value) })}
        />

        <Field id="guest-requests" label="In your own words" className="mt-5">
          <Textarea
            id="guest-requests"
            rows={3}
            value={requests}
            onChange={(e) => setRequests(e.target.value)}
            placeholder="Celebrating my mother's birthday on the second night. Travelling with a toddler."
          />
        </Field>
      </Section>

      {/* ------------------------------------------- 6. payment and policies */}
      <Section step="6" title="Payment & policies" subtitle="Read before you request the stay.">
        <PaymentAndPolicies settings={settings} />
        <label className="mt-5 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--color-clay)]"
          />
          I have read the terms, booking policy and pet policy.
        </label>
      </Section>

      {/* ------------------------------------------------------- the ending */}
      {chosen && chosenFree && (
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
          {nightly > 0 && (
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
          )}

          {isSplit && chosenRooms.length > 0 && roomsSleep < guests && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-status-pending-bg p-3 text-sm text-status-pending"
            >
              Those rooms sleep {roomsSleep}, and you are {guests}. Add another room, or say
              so above and we will add an extra bed.
            </p>
          )}

          <Button
            className="mt-5 w-full sm:w-auto"
            onClick={() => void confirm()}
            disabled={booking || !agreed || (isSplit && chosenRooms.length === 0)}
          >
            {booking ? "Booking…" : "Request this stay"}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            We hold the dates for you straight away. The booking is confirmed once you have
            paid and we have checked your receipt.
          </p>
        </section>
      )}

      {/* --------------------------------------------------- already waiting */}
      {waitlist.length > 0 && (
        <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow className="text-gold-700">You are waiting for</Eyebrow>
            <Button asChild variant="link" size="sm">
              <a href="/guest/waitlist">See the detail</a>
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-ink/8">
            {waitlist.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
                <Hourglass className="size-4 shrink-0 text-stone" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {villas.find((v) => v.id === entry.villaId)?.name ?? "Any house"}
                  </p>
                  <p className="text-xs text-stone-600">
                    {formatDateRange(entry.checkIn, entry.checkOut)} ·{" "}
                    {entry.adults + entry.children} guests
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
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
      <div className="mb-5 flex items-baseline gap-3">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm text-gold-200"
        >
          {step}
        </span>
        <div>
          <h2 className="font-display text-xl text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-stone-600">{hint}</p>}
    </div>
  );
}
