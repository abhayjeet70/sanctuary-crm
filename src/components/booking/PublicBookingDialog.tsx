import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BedDouble, Check, Hourglass, Loader2, Search, Users } from "lucide-react";
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
import { PasswordInput } from "@/components/common/PasswordInput";
import { EmailInput } from "@/components/common/EmailInput";
import { emailProblem } from "@/lib/email";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/common";
import { ChipGroup, DiningInfo, PaymentAndPolicies } from "@/components/booking/StayInfo";
import { VoucherCard } from "@/components/booking/VoucherDocument";
import { supabase } from "@/services/supabase/client";
import { toSettings } from "@/services/supabase/mappers";
import { useSession } from "@/services/session";
import { addDays, toISODate } from "@/services/domain";
import { money, nightsBetween } from "@/lib/format";
import { policyFields, policyHeadline } from "@/lib/cancellation";
import { cn } from "@/lib/utils";
import {
  CUISINES,
  DIETARY_OPTIONS,
  EMPTY_PREFERENCES,
  MEALS,
  OCCASIONS,
  label,
  toggle,
} from "@/lib/preferences";
import { clearDraft, saveDraft, submitDraft, type BookingDraft } from "@/lib/pendingBooking";
import type { DietaryPreference, PropertySettings } from "@/types";

/**
 * Book without signing in first — as one guided flow.
 *
 * Everything is asked before an account exists: dates, the house, who is
 * coming, what they would like to eat. The last step shows the voucher exactly
 * as it will read, marked payment pending, and only then asks for a password —
 * "sign in and continue to payment". `check_availability` is granted to anon,
 * so browsing needs no account; `request_booking` needs one, so the answers are
 * also kept in the browser (`pendingBooking`) until the guest is signed in, which
 * covers projects where signup waits on an emailed confirmation link.
 */

const STEPS = ["Dates", "Your house", "About you", "Food & wishes", "Review"] as const;

interface Villa {
  id: string;
  name: string;
  image: string;
  capacity: number;
  bedrooms: number;
  amenities: string[];
  cancellation_policy: {
    free: boolean;
    freeDays: number;
    tiers: { days: number; refundPercent: number }[];
    note: string;
  } | null;
}

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

const tomorrow = () => addDays(toISODate(new Date()), 1);

export function PublicBookingDialog({ trigger }: { trigger: React.ReactNode }) {
  const { signUp, signIn } = useSession();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // ------------------------------------------- what the property tells guests
  const [villas, setVillas] = useState<Villa[]>([]);
  const [info, setInfo] = useState<Partial<PropertySettings> | null>(null);
  useEffect(() => {
    if (!open) return;
    void supabase
      .from("villas")
      .select("id, name, image, capacity, bedrooms, amenities, cancellation_policy")
      .order("name")
      .then(({ data }) => setVillas((data as Villa[]) ?? []));
    void supabase.rpc("public_stay_info").then(({ data }) => {
      if (data) setInfo(toSettings(data));
    });
  }, [open]);

  // ------------------------------------------------------------- the dates
  const [checkIn, setCheckIn] = useState(tomorrow());
  const [checkOut, setCheckOut] = useState(addDays(tomorrow(), 2));
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Availability[] | null>(null);
  const [chosenVilla, setChosenVilla] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomAvailability[]>([]);
  const [chosenRooms, setChosenRooms] = useState<string[]>([]);
  const [waitlistFor, setWaitlistFor] = useState<{ villaId?: string; villaName?: string } | null>(
    null,
  );

  const nights = checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  const chosen = results?.find((r) => r.villa_id === chosenVilla);
  const isSplit = chosen?.villa_mode === "split";
  const chosenVillaRecord = villas.find((v) => v.id === chosenVilla);
  const chosenRoomRows = rooms.filter((r) => chosenRooms.includes(r.room_id));
  const nightly = isSplit
    ? chosenRoomRows.reduce((s, r) => s + r.base_rate, 0)
    : (chosen?.nightly_rate ?? 0);

  // The dates changing invalidates whatever availability we were showing.
  useEffect(() => {
    setResults(null);
    setChosenVilla(null);
    setChosenRooms([]);
    setRooms([]);
    setWaitlistFor(null);
  }, [checkIn, checkOut]);

  const search = async () => {
    if (nights < 1) return toast.error("Set your dates first");
    if (Number(adults) < 1) return toast.error("At least one adult, please");
    setSearching(true);
    const { data, error } = await supabase.rpc("check_availability", {
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    setSearching(false);
    if (error) return toast.error("Could not check those dates", { description: error.message });
    setResults((data ?? []) as Availability[]);
    setStep(1);
  };

  const pickVilla = async (row: Availability) => {
    setChosenVilla(row.villa_id);
    setChosenRooms([]);
    setWaitlistFor(null);
    if (row.villa_mode !== "split") return setRooms([]);
    const { data } = await supabase.rpc("check_room_availability", {
      p_villa_id: row.villa_id,
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    setRooms((data ?? []) as RoomAvailability[]);
  };

  const joinInstead = (villaId?: string, villaName?: string) => {
    setWaitlistFor({ villaId, villaName });
    setChosenVilla(null);
    setStep(2);
  };

  // ---------------------------------------------------------- the guest
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("India");
  const [emailTried, setEmailTried] = useState(false);

  // ------------------------------------------------------ food and wishes
  const [prefs, setPrefs] = useState(EMPTY_PREFERENCES);
  const [requests, setRequests] = useState("");

  // ------------------------------------------------------------ the finish
  const [returning, setReturning] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState<string | null>(null);

  const next = () => {
    setError(null);
    if (step === 1 && !waitlistFor && (!chosen || (isSplit && chosenRooms.length === 0))) {
      return toast.error(isSplit && chosen ? "Choose at least one room" : "Choose a villa first");
    }
    if (step === 2) {
      if (name.trim().length < 2) return setError("Tell us who the stay is for.");
      if (!phone.trim()) return setError("We need a phone number to reach you on.");
      setEmailTried(true);
      const emailIssue = emailProblem(email);
      if (emailIssue) return setError(emailIssue);
    }
    setStep((s) => s + 1);
  };

  const draft: BookingDraft = {
    villaId: chosenVilla ?? undefined,
    roomIds: isSplit ? chosenRooms : [],
    checkIn,
    checkOut,
    adults: Number(adults) || 1,
    children: Number(children) || 0,
    arrival,
    departure,
    prefs,
    requests,
    phone: phone.trim(),
    country: country.trim(),
    waitlist: waitlistFor ?? undefined,
  };

  // What the voucher will say, and roughly what it will cost. GST follows the
  // same slab the invoice uses; the exact figure is on the invoice.
  const preview = useMemo(() => {
    const sub = nightly * nights;
    const total = Math.round(sub * (1 + (nightly > 7500 ? 0.18 : 0.12)));
    const arrangements = [
      ...prefs.occasions.map((o) => label(OCCASIONS, o)),
      prefs.allergies ? `Allergies noted: ${prefs.allergies}` : null,
      prefs.dietaryNotes || null,
      prefs.foodNotes || null,
      requests.trim() || null,
    ].filter(Boolean) as string[];
    return { total, arrangements };
  }, [nightly, nights, prefs, requests]);

  const finish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < (returning ? 1 : 8)) {
      return setError(
        returning ? "Enter your password." : "Use at least 8 characters for your password.",
      );
    }
    setSaving(true);
    setError(null);
    saveDraft(draft);

    let signedIn = false;
    if (returning) {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        setSaving(false);
        return setError("That email and password do not match an account.");
      }
      signedIn = true;
    } else {
      const { error: signUpError, needsConfirmation: pending, alreadyRegistered } = await signUp(
        email.trim(),
        password,
        name.trim(),
      );
      if (signUpError) {
        setSaving(false);
        return setError(signUpError);
      }
      if (alreadyRegistered) {
        // Not "book anyway": an address that has an account finishes this the
        // way every returning guest does, so the booking lands on the customer
        // that already exists rather than a second, orphaned one.
        const { error: signInError } = await signIn(email.trim(), password);
        if (signInError) {
          setSaving(false);
          setReturning(true);
          return setError("That email already has an account — enter its password to continue.");
        }
        signedIn = true;
      } else if (pending) {
        setSaving(false);
        return setNeedsConfirmation(email.trim());
      } else {
        signedIn = true;
      }
    }

    if (!signedIn) return setSaving(false);
    const result = await submitDraft(draft);
    if (result.error) {
      setSaving(false);
      return setError(result.error);
    }
    clearDraft();
    toast.success(result.waitlisted ? "You are on the waiting list" : "Booking held — payment pending");
    // A full load, not a route change: the portal's data was fetched before this
    // guest had an account, so it has to be fetched again to show their stay.
    window.location.assign(result.waitlisted ? "/guest/waitlist" : "/guest/payment");
  };

  const reset = () => {
    setStep(0);
    setResults(null);
    setChosenVilla(null);
    setChosenRooms([]);
    setWaitlistFor(null);
    setPassword("");
    setError(null);
    setNeedsConfirmation(null);
    setReturning(false);
  };

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[94dvh] overflow-y-auto sm:max-w-5xl",
        )}
      >
        {/* ---------------------------------------------------- progress bar */}
        <div className="-mt-1 pr-6">
          <div className="flex items-baseline justify-between text-xs text-stone-600">
            <span className="label-caps text-gold-700">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Booking progress"
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-300"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-clay transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {needsConfirmation ? (
          <div className="py-4 text-center">
            <DialogHeader>
              <DialogTitle>Check your email</DialogTitle>
              <DialogDescription>
                We sent a confirmation link to <strong>{needsConfirmation}</strong>. Follow it and
                sign in — everything you just chose is saved on this device and will be
                submitted for you the moment you land in your portal.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-4" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------ 1. dates */}
            {step === 0 && (
              <div className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Book a stay</DialogTitle>
                  <DialogDescription>
                    Pick your dates — no account needed until the very end.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-4">
                  <Field label="Check-in" htmlFor="pb-checkin">
                    <Input
                      id="pb-checkin"
                      type="date"
                      min={toISODate(new Date())}
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                    />
                  </Field>
                  <Field label="Check-out" htmlFor="pb-checkout">
                    <Input
                      id="pb-checkout"
                      type="date"
                      min={addDays(checkIn, 1)}
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                    />
                  </Field>
                  <Field label="Adults" htmlFor="pb-adults">
                    <Input
                      id="pb-adults"
                      type="number"
                      min={1}
                      value={adults}
                      onChange={(e) => setAdults(e.target.value)}
                    />
                  </Field>
                  <Field label="Children" htmlFor="pb-children">
                    <Input
                      id="pb-children"
                      type="number"
                      min={0}
                      value={children}
                      onChange={(e) => setChildren(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Arriving around" htmlFor="pb-arrival" hint="Blank for the house's own hours.">
                    <Input id="pb-arrival" type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} />
                  </Field>
                  <Field label="Leaving around" htmlFor="pb-departure">
                    <Input id="pb-departure" type="time" value={departure} onChange={(e) => setDeparture(e.target.value)} />
                  </Field>
                </div>
                <Button onClick={() => void search()} disabled={searching}>
                  <Search aria-hidden />
                  {searching ? "Checking…" : "Check availability"}
                </Button>
              </div>
            )}

            {/* ------------------------------------------------ 2. house */}
            {step === 1 && results && (
              <div className="space-y-3">
                <DialogHeader>
                  <DialogTitle>Choose your house</DialogTitle>
                  <DialogDescription>
                    {nights} {nights === 1 ? "night" : "nights"} · {Number(adults) + Number(children)} guests
                  </DialogDescription>
                </DialogHeader>
                <ul className="space-y-4">
                  {results.map((row) => {
                    const villa = villas.find((v) => v.id === row.villa_id);
                    const free =
                      row.villa_mode === "split" ? row.free_rooms > 0 : row.whole_available;
                    const picked = chosenVilla === row.villa_id;
                    const stay = row.nightly_rate * nights;
                    const tax = Math.round(stay * (row.nightly_rate > 7500 ? 0.18 : 0.12));
                    const highlights = [
                      policyHeadline(policyFields(villa?.cancellation_policy, info), checkIn),
                      info?.breakfastLine,
                      row.villa_mode === "split"
                        ? `${row.free_rooms} of ${row.total_rooms} rooms free — book the rooms you need`
                        : "Entire villa, private to your group",
                    ].filter(Boolean) as string[];
                    return (
                      <li key={row.villa_id}>
                        <div
                          className={cn(
                            "overflow-hidden rounded-2xl bg-white shadow-soft ring-1 transition-all sm:grid sm:grid-cols-[16rem_1fr_14rem]",
                            picked ? "ring-2 ring-gold" : "ring-ink/[0.07] hover:ring-gold/40",
                            !free && "opacity-85",
                          )}
                        >
                          <div className="relative h-48 sm:h-full sm:min-h-52">
                            {villa?.image && (
                              <img src={villa.image} alt={row.villa_name} className="absolute inset-0 size-full object-cover" />
                            )}
                            <span className="absolute top-3 left-3 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-ink shadow-soft">
                              {row.villa_mode === "split" ? "Rooms or villa" : "Entire villa"}
                            </span>
                          </div>

                          <div className="min-w-0 space-y-3 p-4 sm:p-5">
                            <div>
                              <h3 className="font-display text-xl text-ink">{row.villa_name}</h3>
                              <p className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-stone-600">
                                <span className="flex items-center gap-1">
                                  <BedDouble className="size-3.5" aria-hidden />
                                  {row.total_rooms} bedrooms
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="size-3.5" aria-hidden />
                                  sleeps {villa?.capacity ?? row.total_rooms * 2}
                                </span>
                              </p>
                            </div>
                            {villa && villa.amenities.length > 0 && (
                              <ul className="flex flex-wrap gap-1.5">
                                {villa.amenities.slice(0, 4).map((a) => (
                                  <li key={a} className="rounded-md border border-ink/12 px-2 py-0.5 text-xs text-stone-600">
                                    {a}
                                  </li>
                                ))}
                                {villa.amenities.length > 4 && (
                                  <li className="px-1 py-0.5 text-xs text-clay-600">
                                    &amp; {villa.amenities.length - 4} more
                                  </li>
                                )}
                              </ul>
                            )}
                            <ul className="space-y-1.5 text-sm">
                              {highlights.map((h, i) => (
                                <li key={h} className="flex items-start gap-2 text-ink/85">
                                  <Check
                                    className={cn("mt-0.5 size-4 shrink-0", i === 0 ? "text-status-confirmed" : "text-gold-700")}
                                    aria-hidden
                                  />
                                  {h}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="flex flex-col justify-end gap-1 border-t border-ink/10 p-4 text-right sm:border-t-0 sm:border-l sm:p-5">
                            {free ? (
                              <>
                                <StatusBadge label="Available" tone="confirmed" />
                                <p className="mt-2 font-display text-3xl text-ink tabular-nums">
                                  {money(row.nightly_rate)}
                                </p>
                                <p className="text-xs text-stone-600">
                                  + {money(tax)} taxes &amp; fees
                                </p>
                                <p className="text-xs text-stone-600">
                                  per night · {money(stay + tax)} for {nights}{" "}
                                  {nights === 1 ? "night" : "nights"}
                                </p>
                                <Button
                                  className="mt-3 w-full"
                                  variant={picked ? "secondary" : "default"}
                                  aria-pressed={picked}
                                  onClick={() => void pickVilla(row)}
                                >
                                  {picked && <Check aria-hidden />}
                                  {picked ? "Selected" : row.villa_mode === "split" ? "Choose rooms" : "Select villa"}
                                </Button>
                              </>
                            ) : (
                              <>
                                <StatusBadge label="Not available" tone="cancelled" />
                                <p className="mt-2 text-sm text-stone-600">
                                  Held for these dates.
                                </p>
                                <Button
                                  className="mt-3 w-full"
                                  variant="outline"
                                  onClick={() => joinInstead(row.villa_id, row.villa_name)}
                                >
                                  <Hourglass aria-hidden />
                                  Wait for this villa
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {results.length > 0 &&
                  results.every((r) =>
                    r.villa_mode === "split" ? r.free_rooms === 0 : !r.whole_available,
                  ) && (
                    <div className="rounded-xl bg-ink p-4 text-sand">
                      <p className="text-sm text-sand/80">
                        Every house is held for those dates. Put your name down and we will write
                        to you the moment one is released.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3 bg-gold/15 text-gold-200 ring-1 ring-gold/35 hover:bg-gold/25 hover:text-white"
                        onClick={() => joinInstead()}
                      >
                        <Hourglass aria-hidden />
                        Join the waiting list
                      </Button>
                    </div>
                  )}

                {results.length === 0 && (
                  <EmptyState title="Nothing free for those dates" description="Try a different window." />
                )}

                {isSplit && chosen && (
                  <div className="rounded-xl bg-sand-200/60 p-4">
                    <p className="text-sm font-medium text-ink">Choose your rooms</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {rooms.map((room) => {
                        const picked = chosenRooms.includes(room.room_id);
                        return (
                          <label
                            key={room.room_id}
                            className={cn(
                              "flex items-center gap-2 rounded-lg p-2.5 text-sm",
                              !room.available
                                ? "cursor-not-allowed opacity-50"
                                : picked
                                  ? "cursor-pointer bg-gold/15 ring-1 ring-gold/50"
                                  : "cursor-pointer bg-white hover:bg-white/70",
                            )}
                          >
                            <input
                              type="checkbox"
                              disabled={!room.available}
                              checked={picked}
                              onChange={() => setChosenRooms((prev) => toggle(prev, room.room_id))}
                              className="size-4 accent-[var(--color-clay)]"
                            />
                            {room.name} — sleeps {room.capacity}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------ 3. about you */}
            {step === 2 && (
              <div className="space-y-4">
                <DialogHeader>
                  <DialogTitle>{waitlistFor ? "Join the waiting list" : "About you"}</DialogTitle>
                  <DialogDescription>
                    {waitlistFor
                      ? `We will hold your place for ${waitlistFor.villaName ?? "any house"} and write to you the moment it frees up.`
                      : `${chosenVillaRecord?.name ?? chosen?.villa_name} · ${nights} ${nights === 1 ? "night" : "nights"}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="pb-name">
                    <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </Field>
                  <Field label="Phone" htmlFor="pb-phone">
                    <Input id="pb-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                  </Field>
                  <Field label="Email" htmlFor="pb-email" hint="You will sign in with this.">
                    <EmailInput id="pb-email" value={email} onChange={setEmail} showError={emailTried} autoComplete="email" />
                  </Field>
                  <Field label="Country" htmlFor="pb-country">
                    <Input id="pb-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
                  </Field>
                </div>
              </div>
            )}

            {/* ------------------------------------------- 4. food and wishes */}
            {step === 3 && (
              <div className="space-y-5">
                <DialogHeader>
                  <DialogTitle>Food &amp; wishes</DialogTitle>
                  <DialogDescription>
                    Tell us once — the kitchen, the desk and your voucher all read the same answers.
                  </DialogDescription>
                </DialogHeader>
                <DiningInfo settings={info} />
                <Field label="Dietary preference" htmlFor="pb-dietary">
                  <Select
                    value={prefs.dietary}
                    onValueChange={(v) => setPrefs({ ...prefs, dietary: v as DietaryPreference })}
                  >
                    <SelectTrigger id="pb-dietary" className="w-full sm:w-72">
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
                  onToggle={(v) => setPrefs({ ...prefs, meals: toggle(prefs.meals, v) })}
                />
                <ChipGroup
                  legend="Kinds of food"
                  options={CUISINES}
                  selected={prefs.cuisines}
                  onToggle={(v) => setPrefs({ ...prefs, cuisines: toggle(prefs.cuisines, v) })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Allergies" htmlFor="pb-allergies" hint="Anything the kitchen must never serve.">
                    <Input id="pb-allergies" value={prefs.allergies} onChange={(e) => setPrefs({ ...prefs, allergies: e.target.value })} />
                  </Field>
                  <Field label="Dietary restrictions" htmlFor="pb-diet-notes">
                    <Input id="pb-diet-notes" value={prefs.dietaryNotes} onChange={(e) => setPrefs({ ...prefs, dietaryNotes: e.target.value })} placeholder="No onion or garlic" />
                  </Field>
                </div>
                <ChipGroup
                  legend="Anything we should arrange"
                  options={OCCASIONS}
                  selected={prefs.occasions}
                  onToggle={(v) => setPrefs({ ...prefs, occasions: toggle(prefs.occasions, v) })}
                />
                <Field label="In your own words (optional)" htmlFor="pb-requests">
                  <Textarea id="pb-requests" rows={2} value={requests} onChange={(e) => setRequests(e.target.value)} />
                </Field>
              </div>
            )}

            {/* ------------------------------------------------ 5. review */}
            {step === 4 && (
              <form className="space-y-5" onSubmit={finish} noValidate>
                <DialogHeader>
                  <DialogTitle>{waitlistFor ? "Almost done" : "Your voucher"}</DialogTitle>
                  <DialogDescription>
                    {waitlistFor
                      ? "Create your account and we will hold your place in the queue."
                      : "This is how it will read. It shows payment pending until you have paid and we have checked your receipt."}
                  </DialogDescription>
                </DialogHeader>

                {!waitlistFor && chosen && (
                  <>
                    <VoucherCard
                      className="rounded-xl"
                      settings={info}
                      data={{
                        guestName: name.trim(),
                        phone: phone.trim(),
                        villa: chosen.villa_name,
                        rooms: isSplit ? chosenRoomRows.map((r) => r.name).join(", ") : "Whole villa",
                        checkIn,
                        checkOut,
                        arrival: arrival || "2:00 PM",
                        departure: departure || "11:00 AM",
                        adults: Number(adults) || 1,
                        children: Number(children) || 0,
                        total: preview.total,
                        paid: 0,
                        balance: preview.total,
                        meals: prefs.meals.length
                          ? prefs.meals.map((m) => label(MEALS, m)).join(", ")
                          : "À la carte — not included",
                        statusLabel: "Pending payment",
                        arrangements: preview.arrangements,
                      }}
                    />
                    <p className="rounded-xl bg-status-pending-bg p-3 text-sm text-ink">
                      <strong>Payment pending.</strong> Continue to sign in and pay from your
                      portal — the booking is confirmed, and the final voucher issued, once your
                      payment is verified. GST is included in the total shown.
                    </p>
                    <details className="rounded-xl bg-sand-200/50 p-4">
                      <summary className="cursor-pointer text-sm font-medium text-ink">
                        Terms &amp; policies
                      </summary>
                      <div className="mt-3">
                        <PaymentAndPolicies
                          settings={{ ...info, ...policyFields(chosenVillaRecord?.cancellation_policy, info) }}
                          payment={false}
                        />
                      </div>
                    </details>
                  </>
                )}

                <div className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-ink/[0.07]">
                  <p className="text-sm font-medium text-ink">
                    {returning ? `Sign in as ${email}` : "Create your login to continue"}
                  </p>
                  <Field
                    label={returning ? "Password" : "Choose a password"}
                    htmlFor="pb-password"
                    hint={returning ? undefined : "At least 8 characters — this signs you back in to pay and manage your stay."}
                  >
                    <PasswordInput
                      id="pb-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={returning ? "current-password" : "new-password"}
                    />
                  </Field>
                  <button
                    type="button"
                    className="text-xs text-clay-600 underline underline-offset-2"
                    onClick={() => {
                      setReturning((r) => !r);
                      setError(null);
                    }}
                  >
                    {returning ? "New here? Create a login instead" : "Already have an account? Sign in instead"}
                  </button>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-status-cancelled">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving && <Loader2 className="animate-spin" aria-hidden />}
                  {saving
                    ? "Saving…"
                    : waitlistFor
                      ? "Create account & join waiting list"
                      : "Sign in & continue to payment"}
                </Button>
              </form>
            )}

            {error && step !== 4 && !(step === 2 && emailProblem(email) === error) && (
              <p role="alert" className="text-sm text-status-cancelled">
                {error}
              </p>
            )}

            {/* ----------------------------------------------- navigation */}
            {step > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-ink/8 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    // Back from the waitlist steps returns to the house choice.
                    setStep(waitlistFor && step === 2 ? 1 : step - 1);
                  }}
                >
                  Back
                </Button>
                {step < 4 && (
                  <Button type="button" onClick={next}>
                    Continue
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-stone-600">{hint}</p>}
    </div>
  );
}
