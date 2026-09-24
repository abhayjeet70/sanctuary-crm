import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BedDouble, Check, Hourglass, Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/common/PasswordInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/common";
import { supabase } from "@/services/supabase/client";
import { useSession } from "@/services/session";
import { addDays, toISODate } from "@/services/domain";
import { money, nightsBetween } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Book without signing in first.
 *
 * A new guest has no account yet, so asking them to create one and *then*
 * book is two errands where one will do: they pick their dates and villa
 * first — `check_availability` and `check_room_availability` are granted to
 * `anon`, so browsing needs no account — and only at the very end, when they
 * are actually committing to a stay, do we ask for a password. That call
 * creates the login and the booking travels in on the same session a moment
 * later.
 *
 * If mail confirmation is switched on for the project and no session comes
 * back from signup, there is nowhere secure to submit the booking to yet —
 * `request_booking` needs `auth.uid()`, same as everywhere else a guest
 * writes. That case is told plainly rather than silently failing.
 */

type Step = "search" | "details";

interface Villa {
  id: string;
  name: string;
  image: string;
  capacity: number;
  bedrooms: number;
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
  const navigate = useNavigate();
  const { signUp, signIn } = useSession();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("search");

  // ---------------------------------------------------------------- villas
  const [villas, setVillas] = useState<Villa[]>([]);
  useEffect(() => {
    if (!open) return;
    void supabase
      .from("villas")
      .select("id, name, image, capacity, bedrooms")
      .order("name")
      .then(({ data }) => setVillas((data as Villa[]) ?? []));
  }, [open]);

  // ------------------------------------------------------------- the dates
  const [checkIn, setCheckIn] = useState(tomorrow());
  const [checkOut, setCheckOut] = useState(addDays(tomorrow(), 2));
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
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
  const nightly = isSplit
    ? rooms.filter((r) => chosenRooms.includes(r.room_id)).reduce((s, r) => s + r.base_rate, 0)
    : (chosen?.nightly_rate ?? 0);

  const search = async () => {
    if (nights < 1) return toast.error("Set your dates first");
    setSearching(true);
    setChosenVilla(null);
    setWaitlistFor(null);
    const { data, error } = await supabase.rpc("check_availability", {
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    setSearching(false);
    if (error) return toast.error("Could not check those dates", { description: error.message });
    setResults((data ?? []) as Availability[]);
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

  // ----------------------------------------------------------- the guest
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("India");
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState<string | null>(null);

  const proceed = () => {
    if (!waitlistFor && (!chosen || (isSplit && chosenRooms.length === 0))) {
      return toast.error(isSplit ? "Choose at least one room" : "Choose a villa first");
    }
    setError(null);
    setStep("details");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Tell us who the stay is for.");
    if (!phone.trim()) return setError("We need a phone number to reach you on.");
    if (!email.trim()) return setError("An email address is how you will sign back in.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");

    setSaving(true);
    const { error: signUpError, needsConfirmation: pending, alreadyRegistered } = await signUp(
      email,
      password,
      name,
    );

    if (signUpError) {
      setSaving(false);
      return setError(signUpError);
    }

    if (alreadyRegistered) {
      setSaving(false);
      // Not "book anyway" — an address that already has an account should
      // finish this the way every other returning guest does, so the booking
      // lands on the customer record that already exists rather than risking
      // a second, orphaned one.
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        return setError(
          "That email already has an account. Sign in instead, or reset your password.",
        );
      }
      return void afterAuth();
    }

    if (pending) {
      setSaving(false);
      setNeedsConfirmation(email.trim());
      return;
    }

    await afterAuth();
  };

  /** The account signup does not take a phone or a country — `request_booking`
   *  and `join_waitlist` create the customer row with an empty phone. Both
   *  hand back the row they touched, whose customer_id is what "guests update
   *  own contact details" checks, so this fills the two fields in afterward
   *  rather than losing what was typed. Not fatal if it fails — the booking
   *  itself already went through. */
  const saveContactDetails = async (customerId: string | undefined) => {
    if (!customerId) return;
    const { error: updateError } = await supabase
      .from("customers")
      .update({ phone: phone.trim(), country: country.trim() || "India" })
      .eq("id", customerId);
    if (updateError) {
      toast.warning("Booked, but your phone number did not save", {
        description: "Add it from your booking details once you are signed in.",
      });
    }
  };

  /** Runs once a session exists — fresh from signup, or from signing in to
   *  an address that turned out to already be registered. */
  const afterAuth = async () => {
    if (waitlistFor) {
      const { data, error: waitError } = await supabase.rpc("join_waitlist", {
        p_villa_id: waitlistFor.villaId ?? null,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_adults: Number(adults) || 1,
        p_children: Number(children) || 0,
        p_source: "website",
        p_note: requests.trim(),
        p_room_ids: [],
        p_check_in_time: null,
        p_check_out_time: null,
        p_prefs: null,
        p_customer_id: null,
      });
      setSaving(false);
      if (waitError) return setError(waitError.message);
      await saveContactDetails((data as { customer_id?: string } | null)?.customer_id);
      toast.success("You are on the waiting list", {
        description: `We will write to you the moment ${waitlistFor.villaName ?? "a house"} frees up.`,
      });
      setOpen(false);
      navigate("/guest/waitlist");
      return;
    }

    const { data, error: bookError } = await supabase.rpc("request_booking", {
      p_villa_id: chosen!.villa_id,
      p_room_ids: isSplit ? chosenRooms : [],
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_adults: Number(adults),
      p_children: Number(children),
      p_special_requests: requests.trim() || null,
      p_check_in_time: null,
      p_check_out_time: null,
      p_prefs: null,
    });
    setSaving(false);
    if (bookError) return setError(bookError.message);
    await saveContactDetails((data as { customer_id?: string } | null)?.customer_id);
    toast.success("Booking requested", {
      description: "Pay and upload your receipt to confirm it.",
    });
    setOpen(false);
    navigate("/guest/payment");
  };

  const reset = () => {
    setStep("search");
    setResults(null);
    setChosenVilla(null);
    setChosenRooms([]);
    setWaitlistFor(null);
    setName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setRequests("");
    setError(null);
    setNeedsConfirmation(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {needsConfirmation ? (
          <div className="py-4 text-center">
            <DialogHeader>
              <DialogTitle>Check your email</DialogTitle>
              <DialogDescription>
                We have sent a confirmation link to <strong>{needsConfirmation}</strong>. Follow
                it, then sign in here — search your dates again and we will hold them for you.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-4" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : step === "search" ? (
          <>
            <DialogHeader>
              <DialogTitle>Book a stay</DialogTitle>
              <DialogDescription>
                Pick your dates — no account needed to look.
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

            <Button onClick={() => void search()} disabled={searching}>
              <Search aria-hidden />
              {searching ? "Checking…" : "Check availability"}
            </Button>

            {results && (
              <div className="space-y-3">
                <ul className="grid gap-3 sm:grid-cols-2">
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
                          className={cn(
                            "w-full overflow-hidden rounded-xl bg-white text-left shadow-soft ring-1 transition-all",
                            picked ? "ring-2 ring-gold" : "ring-ink/[0.06] hover:ring-gold/40",
                            !free && "cursor-not-allowed opacity-60",
                          )}
                        >
                          {villa?.image && (
                            <img
                              src={villa.image}
                              alt=""
                              aria-hidden
                              className="h-28 w-full object-cover"
                            />
                          )}
                          <span className="block p-3">
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-display text-base text-ink">
                                {row.villa_name}
                              </span>
                              {picked && <Check className="size-4 text-gold-700" aria-hidden />}
                            </span>
                            <span className="mt-1 flex items-center gap-3 text-xs text-stone-600">
                              <span className="flex items-center gap-1">
                                <BedDouble className="size-3.5" aria-hidden />
                                {row.total_rooms} bedrooms
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="size-3.5" aria-hidden />
                                sleeps {villa?.capacity ?? row.total_rooms * 2}
                              </span>
                            </span>
                            <span className="mt-2 block">
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
                            <span className="mt-2 block font-display text-lg text-ink">
                              {money(row.nightly_rate)}
                              <span className="ml-1 font-sans text-xs font-normal text-stone-600">
                                /night
                              </span>
                            </span>
                          </span>
                        </button>

                        {!free && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => {
                              setWaitlistFor({ villaId: row.villa_id, villaName: row.villa_name });
                              setChosenVilla(null);
                              setStep("details");
                            }}
                          >
                            <Hourglass aria-hidden />
                            Wait for {row.villa_name}
                          </Button>
                        )}
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
                        Every house is held for those dates. Put your name down and we will
                        write to you the moment one is released.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3 bg-gold/15 text-gold-200 ring-1 ring-gold/35 hover:bg-gold/25 hover:text-white"
                        onClick={() => {
                          setWaitlistFor({});
                          setStep("details");
                        }}
                      >
                        <Hourglass aria-hidden />
                        Join the waiting list
                      </Button>
                    </div>
                  )}

                {results.length === 0 && (
                  <EmptyState
                    title="Nothing free for those dates"
                    description="Try a different window."
                  />
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
                              onChange={() =>
                                setChosenRooms((prev) =>
                                  picked
                                    ? prev.filter((r) => r !== room.room_id)
                                    : [...prev, room.room_id],
                                )
                              }
                              className="size-4 accent-[var(--color-clay)]"
                            />
                            {room.name} — sleeps {room.capacity}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {chosen && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={proceed}
                    disabled={isSplit && chosenRooms.length === 0}
                  >
                    Continue
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{waitlistFor ? "Join the waiting list" : "Your details"}</DialogTitle>
              <DialogDescription>
                {waitlistFor
                  ? `We will hold your place for ${waitlistFor.villaName ?? "any house"} and write to you the moment it frees up.`
                  : `${chosenVillaRecord?.name ?? chosen?.villa_name} · ${nights} ${nights === 1 ? "night" : "nights"} · ${money(nightly * nights)}`}
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={submit} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="pb-name">
                  <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Phone" htmlFor="pb-phone">
                  <Input id="pb-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                </Field>
                <Field label="Email" htmlFor="pb-email">
                  <Input id="pb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </Field>
                <Field label="Country" htmlFor="pb-country">
                  <Input id="pb-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
                </Field>
              </div>

              <Field label="Choose a password" htmlFor="pb-password" hint="At least 8 characters — this signs you back in to pay and manage your stay.">
                <PasswordInput id="pb-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>

              <Field label="Anything we should know? (optional)" htmlFor="pb-requests">
                <Textarea id="pb-requests" rows={2} value={requests} onChange={(e) => setRequests(e.target.value)} />
              </Field>

              {error && (
                <p role="alert" className="text-sm text-status-cancelled">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("search")}>
                  Back
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" aria-hidden />}
                  {saving
                    ? "Saving…"
                    : waitlistFor
                      ? "Create account & join waiting list"
                      : "Create account & request booking"}
                </Button>
              </div>
              <p className="text-xs text-stone-600">
                Booking confirms once we have checked your payment receipt. Already have an
                account? Sign in above instead.
              </p>
            </form>
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
