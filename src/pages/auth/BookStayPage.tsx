import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  FileText,
  ShieldCheck,
  BedDouble,
  Check,
  Expand,
  Hourglass,
  Loader2,
  MessageCircle,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/common/PasswordInput";
import { EmailInput } from "@/components/common/EmailInput";
import { emailProblem } from "@/lib/email";
import { EmptyState, Logo, StatusBadge } from "@/components/common";
import { PaymentAndPolicies } from "@/components/booking/StayInfo";
import { VoucherCard } from "@/components/booking/VoucherDocument";
import { supabase } from "@/services/supabase/client";
import { toSettings } from "@/services/supabase/mappers";
import { useSession } from "@/services/session";
import { addDays, toISODate } from "@/services/domain";
import { formatDateRange, money, nightsBetween } from "@/lib/format";
import { policyFields, policyHeadline } from "@/lib/cancellation";
import { collage } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { EMPTY_PREFERENCES, toggle } from "@/lib/preferences";
import { clearDraft, saveDraft, submitDraft, type BookingDraft } from "@/lib/pendingBooking";
import type { PropertySettings } from "@/types";

/**
 * Book without signing in first — as one guided flow, in its own window.
 *
 * Dates, the house, who is coming. The last step shows the voucher exactly as
 * it will read, marked payment pending, and only then asks for a password.
 * Food & wishes are asked in the guest portal once the booking exists.
 * `check_availability` is granted to anon, so browsing needs no account;
 * `request_booking` needs one, so the answers are also kept in the browser and
 * on the new account (`pendingBooking`) until the guest is signed in.
 */

const STEPS = ["Dates", "Your house", "About you", "Review"] as const;

interface Villa {
  id: string;
  name: string;
  image: string;
  description: string;
  gallery: string[];
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

interface RoomMedia {
  id: string;
  villa_id: string;
  name: string;
  capacity: number;
  description: string;
  gallery: string[];
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
/** GST follows the same slab the invoice uses; the exact figure is on the invoice. */
const withTax = (amount: number, nightly: number) =>
  Math.round(amount * (1 + (nightly > 7500 ? 0.18 : 0.12)));

export default function BookStayPage() {
  const { signUp, signIn } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // ------------------------------------------- what the property tells guests
  const [villas, setVillas] = useState<Villa[]>([]);
  const [roomMedia, setRoomMedia] = useState<RoomMedia[]>([]);
  const [info, setInfo] = useState<Partial<PropertySettings> | null>(null);
  useEffect(() => {
    void supabase
      .from("villas")
      .select("id, name, image, description, gallery, capacity, bedrooms, amenities, cancellation_policy")
      .order("name")
      .then(({ data }) => setVillas((data as Villa[]) ?? []));
    void supabase.rpc("public_room_media").then(({ data }) => setRoomMedia((data as RoomMedia[]) ?? []));
    void supabase.rpc("public_stay_info").then(({ data }) => {
      if (data) setInfo(toSettings(data));
    });
  }, []);

  // Every photograph the property has, for the backdrop. Falls back to the
  // bundled four until Admin → Media has uploads.
  const backdrop = useMemo(() => {
    const uploaded = [
      ...villas.flatMap((v) => [v.image, ...(v.gallery ?? [])]),
      ...roomMedia.flatMap((r) => r.gallery ?? []),
    ].filter(Boolean);
    const all = [...new Set(uploaded.length >= 4 ? uploaded : [...uploaded, ...collage.map((c) => c.src)])];
    return Array.from({ length: 12 }, (_, i) => all[i % all.length]);
  }, [villas, roomMedia]);

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
  // The villa page lives in the URL, so the phone's back button closes it.
  const [params, setParams] = useSearchParams();
  const detailsFor = results?.find((r) => r.villa_id === params.get("villa")) ?? null;
  const setDetailsFor = (row: Availability | null) => {
    if (row) {
      setParams({ villa: row.villa_id });
      window.scrollTo(0, 0);
    } else navigate(-1);
  };

  const nights = checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  const chosen = results?.find((r) => r.villa_id === chosenVilla);
  const isSplit = chosen?.villa_mode === "split";
  const chosenVillaRecord = villas.find((v) => v.id === chosenVilla);
  const chosenRoomRows = rooms.filter((r) => chosenRooms.includes(r.room_id));
  const nightly = isSplit
    ? chosenRoomRows.reduce((s, r) => s + r.base_rate, 0)
    : (chosen?.nightly_rate ?? 0);
  const total = withTax(nightly * nights, nightly);

  // The dates changing invalidates whatever availability we were showing.
  useEffect(() => {
    setResults(null);
    setChosenVilla(null);
    setChosenRooms([]);
    setRooms([]);
    setWaitlistFor(null);
  }, [checkIn, checkOut]);

  // Typing can get past the inputs' min, so the rule is enforced here too:
  // moving check-in on or past check-out carries check-out along, and a
  // check-out on or before check-in is refused.
  const changeCheckIn = (value: string) => {
    if (!value) return;
    const earliest = toISODate(new Date());
    const next = value < earliest ? earliest : value;
    setCheckIn(next);
    if (checkOut <= next) setCheckOut(addDays(next, 1));
  };
  const changeCheckOut = (value: string) => {
    if (!value) return;
    if (value <= checkIn) {
      toast.error("Check-out must be after check-in");
      setCheckOut(addDays(checkIn, 1));
      return;
    }
    setCheckOut(value);
  };

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
    prefs: EMPTY_PREFERENCES,
    requests,
    phone: phone.trim(),
    country: country.trim(),
    waitlist: waitlistFor ?? undefined,
  };

  // ------------------------------------------------------------- WhatsApp
  const whatsappNumber = (info?.contactPhone ?? "").replace(/\D/g, "");
  const chatOnWhatsApp = () => {
    const villaName = chosen?.villa_name ?? waitlistFor?.villaName ?? "";
    const lines = [
      `Hello Homes of Sanctuary — I would like to book a stay.`,
      name.trim() && `Name: ${name.trim()}`,
      phone.trim() && `Phone: ${phone.trim()}`,
      email.trim() && `Email: ${email.trim()}`,
      nights > 0 && `Dates: ${formatDateRange(checkIn, checkOut)} (${nights} ${nights === 1 ? "night" : "nights"})`,
      `Guests: ${Number(adults) || 1} adults${Number(children) ? `, ${children} children` : ""}`,
      villaName && `House: ${villaName}${isSplit && chosenRoomRows.length ? ` — ${chosenRoomRows.map((r) => r.name).join(", ")}` : ""}`,
      total > 0 && `Estimated total: ${money(total)} incl. GST`,
      requests.trim() && `Requests: ${requests.trim()}`,
    ].filter(Boolean) as string[];
    const message = lines.join("\n");
    // Logged first so the desk sees it under Enquiries even if the chat is
    // never sent. Fire-and-forget: a failed log must not block the chat.
    void supabase.rpc("log_whatsapp_enquiry", {
      p_name: name.trim(),
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_villa_name: villaName,
      p_check_in: nights > 0 ? checkIn : null,
      p_check_out: nights > 0 ? checkOut : null,
      p_adults: Number(adults) || 0,
      p_children: Number(children) || 0,
      p_estimate: total,
      p_message: message,
    });
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };

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
      // The draft rides on the account too, so confirming the email on another
      // device or browser still lands the booking.
      const { error: signUpError, needsConfirmation: pending, alreadyRegistered } = await signUp(
        email.trim(),
        password,
        name.trim(),
        { pending_booking: draft },
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
    await clearDraft();
    toast.success(result.waitlisted ? "You are on the waiting list" : "Booking held — payment pending");
    // A full load, not a route change: the portal's data was fetched before this
    // guest had an account, so it has to be fetched again to show their stay.
    window.location.assign(result.waitlisted ? "/guest/waitlist" : "/guest/dashboard");
  };

  const chatButton = whatsappNumber && (
        <button
          type="button"
          onClick={chatOnWhatsApp}
          aria-label="Chat with us on WhatsApp"
          className={cn("fixed right-3 bottom-24 z-40 flex items-center gap-2 rounded-full bg-[#25D366] p-3 text-sm font-medium text-white shadow-lift transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:right-6 sm:px-4", !detailsFor && chosen && total > 0 && !needsConfirmation ? "lg:bottom-24" : "lg:bottom-6")}
        >
          <MessageCircle className="size-5" aria-hidden />
          <span className="hidden sm:inline">Chat with us</span>
        </button>
  );

  if (detailsFor) {
    return (
      <>
        <VillaDetails
          row={detailsFor}
          villa={villas.find((v) => v.id === detailsFor.villa_id)}
          rooms={roomMedia.filter((r) => r.villa_id === detailsFor.villa_id)}
          nights={nights}
          guests={Number(adults) + Number(children)}
          dates={formatDateRange(checkIn, checkOut)}
          highlights={[
            policyHeadline(policyFields(villas.find((v) => v.id === detailsFor.villa_id)?.cancellation_policy, info), checkIn),
            info?.breakfastLine,
          ].filter(Boolean) as string[]}
          onClose={() => setDetailsFor(null)}
          onSelect={(row) => {
            navigate(-1);
            void pickVilla(row);
          }}
        />
        {chatButton}
      </>
    );
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-ink">
      {/* ------------------------------------------------ photo collage */}
      <div aria-hidden className="fixed inset-0 grid grid-cols-3 grid-rows-4 gap-1.5 p-1.5 sm:grid-cols-4 sm:grid-rows-3">
        {backdrop.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className={cn("size-full rounded-lg object-cover", i % 5 === 0 && "row-span-2")}
          />
        ))}
      </div>
      <div aria-hidden className="fixed inset-0 bg-ink/75 backdrop-blur-[2px]" />

      <div className="relative mx-auto flex min-h-dvh max-w-[90rem] flex-col px-3 py-3 sm:px-6 lg:pl-40">
        <header className="flex items-center justify-between lg:justify-end">
          {/* Laptop and up: its own column left of the card, at twice the size. */}
          <Link to="/login" aria-label="Back to sign in" className="z-20 lg:absolute lg:top-6 lg:left-8">
            <Logo variant="onDark" size="h-12 lg:h-24" />
          </Link>
          <Button asChild variant="ghost" className="text-sand/80 hover:bg-white/10 hover:text-white">
            <Link to="/login">
              <ArrowLeft aria-hidden />
              Back
            </Link>
          </Button>
        </header>

        <main className={cn("mt-3 flex-1 rounded-2xl bg-sand p-4 shadow-lift ring-1 ring-gold/30", step === 3 ? "sm:p-5" : "sm:mt-6 sm:p-8")}>
          {/* ---------------------------------------------------- progress bar */}
          {step !== 3 && (<>
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
          </>)}

          <div className={cn("space-y-4", step !== 3 && "mt-4")}>
            {needsConfirmation ? (
              <div className="py-8 text-center">
                <Heading
                  title="Check your email"
                  description={
                    <>
                      We sent a confirmation link to <strong>{needsConfirmation}</strong>. Follow it
                      — on this or any device — and your booking is placed the moment you land in
                      your portal.
                    </>
                  }
                />
                <Button className="mt-6" onClick={() => navigate("/login")}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                {/* ------------------------------------------------ 1. dates */}
                {step === 0 && (
                  <>
                    <Heading title="Book a stay" description="Pick your dates — no account needed until the very end." />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <Field label="Check-in" htmlFor="pb-checkin">
                        <Input
                          id="pb-checkin"
                          type="date"
                          min={toISODate(new Date())}
                          value={checkIn}
                          onChange={(e) => changeCheckIn(e.target.value)}
                        />
                      </Field>
                      <Field label="Check-out" htmlFor="pb-checkout">
                        <Input
                          id="pb-checkout"
                          type="date"
                          min={addDays(checkIn, 1)}
                          value={checkOut}
                          onChange={(e) => changeCheckOut(e.target.value)}
                        />
                      </Field>
                      <Field label="Adults" htmlFor="pb-adults">
                        <Input id="pb-adults" type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} />
                      </Field>
                      <Field label="Children" htmlFor="pb-children">
                        <Input id="pb-children" type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                    <section aria-label="Homes of Sanctuary" className="relative mt-5 h-52 overflow-hidden rounded-2xl sm:h-56">
                      <ul aria-hidden className="flex size-full gap-1.5">
                        {backdrop.slice(0, 4).map((src, i) => (
                          <li key={src + i} className={cn("h-full min-w-0 overflow-hidden", i === 0 ? "flex-[2]" : "flex-1")}>
                            <img src={src} alt="" className="size-full object-cover" />
                          </li>
                        ))}
                      </ul>
                      <div className="absolute inset-0 bg-gradient-to-r from-forest/95 via-forest/70 to-forest/10" />
                      <figure className="absolute inset-0 flex max-w-xl flex-col justify-center p-6 text-sand sm:p-8">
                        <blockquote className="font-display text-xl leading-snug text-white sm:text-2xl">
                          &ldquo;Some places you visit. Others, you return to — in your mind, long after you leave.&rdquo;
                        </blockquote>
                        <hr className="rule-gold my-4 w-20" />
                        <figcaption className="text-[10px] tracking-[0.3em] text-gold-200 uppercase">
                          Three houses above the clouds · Nandi Hills
                        </figcaption>
                      </figure>
                    </section>
                  </>
                )}

                {/* ------------------------------------------------ 2. house */}
                {step === 1 && results && (
                  <>
                    <Heading
                      title="Choose your house"
                      description={`${nights} ${nights === 1 ? "night" : "nights"} · ${Number(adults) + Number(children)} guests`}
                    />
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {results.map((row) => {
                        const villa = villas.find((v) => v.id === row.villa_id);
                        const free = row.villa_mode === "split" ? row.free_rooms > 0 : row.whole_available;
                        const picked = chosenVilla === row.villa_id;
                        const stay = row.nightly_rate * nights;
                        const tax = withTax(stay, row.nightly_rate) - stay;
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
                                "flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-soft ring-1 transition-all",
                                picked ? "ring-2 ring-gold" : "ring-ink/[0.07] hover:ring-gold/40",
                                !free && "opacity-85",
                              )}
                            >
                              <button
                                type="button"
                                className="group relative block h-40 w-full shrink-0 xl:h-44"
                                onClick={() => setDetailsFor(row)}
                                aria-label={`View photos and details of ${row.villa_name}`}
                              >
                                {villa?.image && (
                                  <img src={villa.image} alt="" className="absolute inset-0 size-full object-cover" />
                                )}
                                {free && (
                                  <span className="absolute top-3 right-3">
                                    <StatusBadge label="Available" tone="confirmed" />
                                  </span>
                                )}
                                <span className="absolute top-3 left-3 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-ink shadow-soft">
                                  {row.villa_mode === "split" ? "Rooms or villa" : "Entire villa"}
                                </span>
                                <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-md bg-ink/75 px-2 py-1 text-xs text-white">
                                  <Expand className="size-3.5" aria-hidden />
                                  {1 + (villa?.gallery ?? []).length} photos
                                </span>
                              </button>

                              <div className="min-w-0 flex-1 space-y-2 p-4">
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
                                <ul className="space-y-1 text-xs sm:text-sm">
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
                                <button
                                  type="button"
                                  className="text-sm text-clay-600 underline underline-offset-2"
                                  onClick={() => setDetailsFor(row)}
                                >
                                  View all details &amp; photos
                                </button>
                              </div>

                              <div className="flex items-end justify-between gap-3 border-t border-ink/10 p-4">
                                {free ? (
                                  <>
                                    <div className="min-w-0">
                                      <p className="font-display text-2xl text-ink tabular-nums">
                                        {money(stay + tax)}
                                        <span className="ml-1 font-sans text-xs text-stone-600">total</span>
                                      </p>
                                      <p className="text-xs text-stone-600">
                                        {nights} {nights === 1 ? "night" : "nights"} · {money(row.nightly_rate)}/night + {money(tax)} GST
                                      </p>
                                    </div>
                                    <Button
                                      className="shrink-0"
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
                                    <Button
                                      className="shrink-0"
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
                      results.every((r) => (r.villa_mode === "split" ? r.free_rooms === 0 : !r.whole_available)) && (
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
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {rooms.map((room) => {
                            const picked = chosenRooms.includes(room.room_id);
                            const media = roomMedia.find((m) => m.id === room.room_id);
                            return (
                              <label
                                key={room.room_id}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg p-2.5 text-sm",
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
                                {media?.gallery[0] && (
                                  <img src={media.gallery[0]} alt="" className="h-14 w-20 shrink-0 rounded-md object-cover" />
                                )}
                                <span className="min-w-0 flex-1">
                                  {room.name} — sleeps {room.capacity}
                                  <span className="block text-xs text-stone-600">{money(room.base_rate)} / night</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ------------------------------------------------ 3. about you */}
                {step === 2 && (
                  <>
                    <Heading
                      title={waitlistFor ? "Join the waiting list" : "About you"}
                      description={
                        waitlistFor
                          ? `We will hold your place for ${waitlistFor.villaName ?? "any house"} and write to you the moment it frees up.`
                          : `${chosenVillaRecord?.name ?? chosen?.villa_name} · ${nights} ${nights === 1 ? "night" : "nights"}`
                      }
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <Field
                      label="Anything we should know (optional)"
                      htmlFor="pb-requests"
                      hint="Food and other wishes are asked in your portal after booking."
                    >
                      <Textarea id="pb-requests" rows={2} value={requests} onChange={(e) => setRequests(e.target.value)} />
                    </Field>
                  </>
                )}

                {/* ------------------------------------------------ 4. review */}
                {step === 3 && (
                  <form onSubmit={finish} noValidate>
                    <h1 className="sr-only">{waitlistFor ? "Almost done" : "Review your voucher"}</h1>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_21rem] lg:items-start">
                    {!waitlistFor && chosen && (
                      <VoucherCard
                        compact
                        className="rounded-2xl"
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
                          total,
                          paid: 0,
                          balance: total,
                          meals: "Chosen in your portal after booking",
                          statusLabel: "Pending payment",
                          arrangements: requests.trim() ? [requests.trim()] : [],
                          image: chosenVillaRecord?.image,
                          blurb: chosenVillaRecord?.description,
                        }}
                        footer={
                          <details className="group rounded-xl bg-white/80 ring-1 ring-ink/[0.06]">
                            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-display text-ink">
                              <FileText className="size-5 text-ink/70" aria-hidden />
                              <span className="flex-1">Terms &amp; policies</span>
                              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                            </summary>
                            <div className="px-4 pb-4">
                              <PaymentAndPolicies
                                settings={{ ...info, ...policyFields(chosenVillaRecord?.cancellation_policy, info) }}
                                payment={false}
                              />
                            </div>
                          </details>
                        }
                      />
                    )}

                    <div className="space-y-3 lg:sticky lg:top-4">
                      {/* progress */}
                      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-ink/[0.06]">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sand ring-1 ring-gold/30">
                          <FileText className="size-5 text-gold-700" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="label-caps text-ink">Step 4 of 4 · Review</span>
                            <span className="text-sm font-semibold text-gold-700">100%</span>
                          </p>
                          <p className="text-xs text-stone-600">
                            {waitlistFor ? "Create your account to join the queue" : "Please review your booking details"}
                          </p>
                          <div className="mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-gold to-clay" />
                        </div>
                      </div>

                      {/* total */}
                      {!waitlistFor && chosen && (
                        <div className="relative overflow-hidden rounded-2xl bg-forest p-4 text-sand shadow-lift">
                          <p className="relative text-[11px] font-semibold tracking-[0.18em] text-gold-200 uppercase">
                            Total to pay · 100% advance
                          </p>
                          <p className="relative mt-1 font-display text-4xl text-white tabular-nums">{money(total)}</p>
                          <p className="relative mt-1 text-sm text-sand/85">
                            {nights} {nights === 1 ? "night" : "nights"} · incl. GST
                          </p>
                          <p className="relative text-sm text-sand/70">Payment pending until we verify your receipt.</p>
                        </div>
                      )}

                      {/* login */}
                      <div className="space-y-2.5 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]">
                        <div>
                          <p className="font-display text-lg text-ink">
                            {returning ? `Sign in as ${email}` : "Create your login to continue"}
                          </p>
                          
                        </div>
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
                        {error && (
                          <p role="alert" className="text-sm text-status-cancelled">
                            {error}
                          </p>
                        )}
                        <Button type="submit" disabled={saving} size="lg" className="w-full bg-forest hover:bg-forest/90">
                          {saving && <Loader2 className="animate-spin" aria-hidden />}
                          {saving
                            ? "Saving…"
                            : waitlistFor
                              ? "Create account & join waiting list"
                              : "Sign in & continue"}
                          {!saving && <ArrowRight aria-hidden />}
                        </Button>
                      </div>

                      {/* reassurance */}
                      <div className="flex items-center gap-3 rounded-2xl bg-sand-200/60 p-3 ring-1 ring-gold/20">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-gold/30">
                          <ShieldCheck className="size-5 text-gold-700" aria-hidden />
                        </span>
                        <p className="text-xs text-stone-600">
                          <span className="block text-sm font-medium text-ink">Your information is secure</span>
                          Your password is encrypted and never shared.
                        </p>
                      </div>
                    </div>
                    </div>
                  </form>
                )}

                {error && step !== 3 && !(step === 2 && emailProblem(email) === error) && (
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
                    {step < 3 && (
                      <Button type="button" onClick={next}>
                        Continue
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* ------------------------------------------- running total, every step */}
        {chosen && total > 0 && !needsConfirmation && (
          <div
            role="status"
            aria-live="polite"
            className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/95 px-5 py-3 text-sand shadow-lift ring-1 ring-gold/30"
          >
            <span className="text-sm">
              {chosen.villa_name}
              {isSplit && chosenRoomRows.length > 0 && ` · ${chosenRoomRows.map((r) => r.name).join(", ")}`} ·{" "}
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
            <span className="font-display text-xl text-white tabular-nums">
              {money(total)} <span className="text-xs text-sand/70">incl. GST</span>
            </span>
          </div>
        )}
      </div>

      {chatButton}

    </div>
  );
}

/**
 * One villa, as its own page — laid out the way MakeMyTrip shows a property:
 * title, then photos beside a booking card with the total and the button, all
 * above the fold; details below. Phones get a swipe strip and a price bar
 * pinned to the bottom.
 */
function VillaDetails({
  row,
  villa,
  rooms,
  nights,
  guests,
  dates,
  highlights,
  onClose,
  onSelect,
}: {
  row: Availability;
  villa?: Villa;
  rooms: RoomMedia[];
  nights: number;
  guests: number;
  dates: string;
  highlights: string[];
  onClose: () => void;
  onSelect: (row: Availability) => void;
}) {
  const photos = villa ? [villa.image, ...(villa.gallery ?? [])].filter(Boolean) : [];
  const [allPhotos, setAllPhotos] = useState(false);
  const free = row.villa_mode === "split" ? row.free_rooms > 0 : row.whole_available;
  const stayTotal = withTax(row.nightly_rate * nights, row.nightly_rate);
  const cta = row.villa_mode === "split" ? "Choose rooms" : "Book this villa";
  const showAll = () => {
    setAllPhotos(true);
    setTimeout(() => document.getElementById("all-photos")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="min-h-dvh bg-sand pb-24 lg:pb-10">
      {/* --------------------------------------------------------- top bar */}
      <header className="sticky top-0 z-30 border-b border-ink/8 bg-sand/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-6">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back to all villas">
            <ArrowLeft aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{row.villa_name}</p>
            <p className="truncate text-xs text-stone-600">
              {dates} · {guests} guests · {nights} {nights === 1 ? "night" : "nights"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 pt-3 sm:px-6 sm:pt-4">
        {/* ------------------------------------------------- title */}
        <h1 className="font-display text-2xl text-ink sm:text-3xl">{row.villa_name}</h1>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
          <span className="flex items-center gap-1">
            <BedDouble className="size-4" aria-hidden />
            {row.total_rooms} bedrooms
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-4" aria-hidden />
            Sleeps {villa?.capacity ?? row.total_rooms * 2}
          </span>
          <span>{row.villa_mode === "split" ? "Book rooms or the whole villa" : "Entire villa, private to you"}</span>
        </p>

        {/* ----------------------------------- photos + booking card */}
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_21rem]">
          <section aria-label="Photos" className="min-w-0">
            {/* Phone: swipe strip */}
            <ul className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 sm:hidden">
              {photos.map((src, i) => (
                <li key={src + i} className="relative w-[88%] shrink-0 snap-center">
                  <img src={src} alt={`${row.villa_name}, photo ${i + 1}`} className="aspect-[4/3] w-full rounded-xl object-cover" />
                  <span className="absolute right-2 bottom-2 rounded bg-ink/70 px-2 py-0.5 text-xs text-white">
                    {i + 1}/{photos.length}
                  </span>
                </li>
              ))}
            </ul>
            {/* Tablet & desktop: one large, two stacked */}
            <div className="hidden h-[22rem] grid-cols-3 grid-rows-2 gap-2 sm:grid xl:h-[24rem]">
              {photos.slice(0, 3).map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={showAll}
                  className={cn("relative overflow-hidden rounded-xl", i === 0 && "col-span-2 row-span-2", photos.length === 1 && "col-span-3")}
                  aria-label={`Show all ${photos.length} photos`}
                >
                  <img src={src} alt="" className="size-full object-cover transition-transform duration-500 hover:scale-105" />
                  {i === 0 && (
                    <span className="absolute bottom-3 left-3 rounded-full bg-ink/75 px-3 py-1 text-xs text-white">
                      {photos.length} photos →
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* booking card — beside the photos on desktop */}
          <aside className="hidden lg:block">
            <div className="flex h-full flex-col rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07]">
              <p className="font-display text-lg text-ink">
                {row.villa_mode === "split" ? "Rooms or whole villa" : "Entire villa"}
              </p>
              <p className="text-sm text-stone-600">Fits {villa?.capacity ?? row.total_rooms * 2} guests</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-status-confirmed">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                <p className="text-xs text-stone-600">
                  {money(row.nightly_rate)} per night × {nights}
                </p>
                <p className="font-display text-3xl text-ink tabular-nums">{money(stayTotal)}</p>
                <p className="text-xs text-stone-600">total incl. GST · 100% advance</p>
                {free ? (
                  <Button className="mt-3 w-full" size="lg" onClick={() => onSelect(row)}>
                    {cta}
                  </Button>
                ) : (
                  <div className="mt-3">
                    <StatusBadge label="Not available for these dates" tone="cancelled" />
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* ------------------------------------------------- details */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_21rem]">
          <div className="min-w-0 space-y-6">
            {villa?.description && (
              <section>
                <h2 className="font-display text-xl text-ink">About the villa</h2>
                <p className="mt-2 max-w-prose leading-relaxed text-ink/85">{villa.description}</p>
              </section>
            )}

            {highlights.length > 0 && (
              <ul className="space-y-1.5 text-sm lg:hidden">
                {highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-status-confirmed">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            )}

            {villa && villa.amenities.length > 0 && (
              <section>
                <h2 className="font-display text-xl text-ink">Amenities</h2>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {villa.amenities.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-sm text-ink/85">
                      <Check className="mt-0.5 size-4 shrink-0 text-status-confirmed" aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {rooms.length > 0 && (
              <section>
                <h2 className="font-display text-xl text-ink">The rooms</h2>
                <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {rooms.map((room) => (
                    <li key={room.id} className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.07]">
                      {room.gallery.length > 0 && (
                        <div className="flex snap-x snap-mandatory overflow-x-auto">
                          {room.gallery.map((src) => (
                            <img key={src} src={src} alt={room.name} className="aspect-[4/3] w-full shrink-0 snap-center object-cover" />
                          ))}
                        </div>
                      )}
                      <div className="p-4">
                        <p className="font-medium text-ink">{room.name}</p>
                        <p className="text-xs text-stone-600">Sleeps {room.capacity}</p>
                        {room.description && <p className="mt-1 text-sm text-ink/80">{room.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {allPhotos && (
              <section id="all-photos">
                <h2 className="font-display text-xl text-ink">All photos</h2>
                <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {photos.map((src, i) => (
                    <li key={src + i}>
                      <img src={src} alt={`${row.villa_name}, photo ${i + 1}`} loading="lazy" className="w-full rounded-xl object-cover" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* ------------------------------------------ phone/tablet price bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-ink/10 bg-white px-4 py-3 shadow-lift lg:hidden">
        <PriceBlock row={row} nights={nights} total={stayTotal} />
        {free ? (
          <Button size="lg" onClick={() => onSelect(row)}>
            {row.villa_mode === "split" ? "Choose rooms" : "Book now"}
          </Button>
        ) : (
          <StatusBadge label="Not available" tone="cancelled" />
        )}
      </div>
    </div>
  );
}

function PriceBlock({ row, nights, total }: { row: Availability; nights: number; total: number }) {
  return (
    <div>
      <p className="font-display text-2xl text-ink tabular-nums">
        {money(total)} <span className="font-sans text-xs text-stone-600">total</span>
      </p>
      <p className="text-xs text-stone-600 tabular-nums">
        {money(row.nightly_rate)}/night × {nights} · incl. GST
      </p>
    </div>
  );
}

function Heading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-xl text-ink sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-stone-600">{description}</p>
    </div>
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
