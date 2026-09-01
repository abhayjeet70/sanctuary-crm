import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
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
import { Eyebrow, PageHeader, StatusBadge } from "@/components/common";
import { FinancialBreakdown } from "@/components/booking/FinancialBreakdown";
import { useBookings, useCustomers, useMockData, useVillas } from "@/hooks/useData";
import { bookingTotals, findConflicts } from "@/services/domain";
import { bookingSource, sourceOptions } from "@/lib/status";
import { formatDate, money, nightsBetween } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Booking, BookingSource } from "@/types";

const NEW_GUEST = "__new__";

interface FormState {
  source: BookingSource;
  villaId: string;
  roomIds: string[];
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  customerId: string;
  name: string;
  phone: string;
  email: string;
  nightlyRate: string;
  discount: string;
  taxRate: string;
  advance: string;
  specialRequests: string;
}

export default function NewBookingPage() {
  const villas = useVillas();
  const customers = useCustomers();
  const bookings = useBookings();
  const { createBooking, today } = useMockData();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    source: "phone",
    villaId: villas[0]?.id ?? "",
    roomIds: [],
    checkIn: "",
    checkOut: "",
    adults: "2",
    children: "0",
    customerId: NEW_GUEST,
    name: "",
    phone: "",
    email: "",
    nightlyRate: String(villas[0]?.baseRate ?? 0),
    discount: "0",
    taxRate: "18",
    advance: "0",
    specialRequests: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const villa = villas.find((v) => v.id === form.villaId);
  const isSplit = villa?.mode === "split";
  const nights =
    form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0;

  /* ------------------------------------------------------------ validation */

  const errors = useMemo(() => {
    const next: Partial<Record<keyof FormState | "dates" | "conflict", string>> = {};
    if (!form.villaId) next.villaId = "Choose a villa.";
    if (isSplit && form.roomIds.length === 0)
      next.roomIds = "This villa is in split mode — pick at least one room.";
    if (!form.checkIn) next.checkIn = "A check-in date is required.";
    if (!form.checkOut) next.checkOut = "A check-out date is required.";
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn)
      next.dates = "Check-out has to be after check-in.";

    if (form.customerId === NEW_GUEST) {
      if (!form.name.trim()) next.name = "The guest's name is required.";
      if (!/^[+\d][\d\s-]{7,}$/.test(form.phone.trim()))
        next.phone = "Enter a reachable phone number.";
      if (form.email && !/^\S+@\S+\.\S+$/.test(form.email))
        next.email = "That does not look like a complete email address.";
    }

    const rate = Number(form.nightlyRate);
    if (!Number.isFinite(rate) || rate <= 0) next.nightlyRate = "Enter a nightly rate.";

    const guests = Number(form.adults) + Number(form.children);
    if (Number(form.adults) < 1) next.adults = "At least one adult.";
    if (villa && guests > villa.capacity)
      next.adults = `${villa.name} sleeps ${villa.capacity}. That is ${guests} guests.`;

    return next;
  }, [form, isSplit, villa]);

  /* --------------------------------------------------- BR5: block conflicts */

  const conflicts = useMemo(() => {
    if (!form.villaId || !form.checkIn || !form.checkOut || form.checkOut <= form.checkIn)
      return [];
    return findConflicts(
      {
        villaId: form.villaId,
        roomIds: isSplit ? form.roomIds : [],
        checkIn: form.checkIn,
        checkOut: form.checkOut,
      },
      bookings,
    );
  }, [form.villaId, form.roomIds, form.checkIn, form.checkOut, isSplit, bookings]);

  const charges = {
    nightlyRate: Number(form.nightlyRate) || 0,
    nights,
    weekendSurcharge: 0,
    seasonalSurcharge: 0,
    extraGuestCharge: 0,
    food: 0,
    addOns: 0,
    discount: Number(form.discount) || 0,
    taxRate: (Number(form.taxRate) || 0) / 100,
  };
  const totals = bookingTotals(charges, Number(form.advance) || 0);

  const blocked = Object.keys(errors).length > 0 || conflicts.length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blocked) {
      toast.error("The booking cannot be saved yet", {
        description:
          conflicts.length > 0
            ? "Those dates conflict with an existing hold."
            : "Some fields still need attention.",
      });
      return;
    }

    setSaving(true);
    const id = `b-${Date.now()}`;
    const customerId =
      form.customerId === NEW_GUEST ? `c-${Date.now()}` : form.customerId;

    const booking: Booking = {
      id,
      reference: `HOS-${String(Date.now()).slice(-4)}`,
      customerId,
      villaId: form.villaId,
      roomIds: isSplit ? form.roomIds : [],
      bookingMode: isSplit ? "split" : "whole",
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      adults: Number(form.adults),
      children: Number(form.children),
      source: form.source,
      status: Number(form.advance) > 0 ? "confirmed" : "pending_payment",
      paymentStatus: Number(form.advance) > 0 ? "partial" : "pending",
      charges,
      amountPaid: Number(form.advance) || 0,
      specialRequests: form.specialRequests.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    // A beat, so the saving state is visible the way a real write will feel.
    window.setTimeout(() => {
      createBooking(booking);
      toast.success(`${booking.reference} created`, {
        description: `${villa?.name} · ${formatDate(booking.checkIn)}`,
      });
      navigate(`/admin/bookings/${id}`);
    }, 500);
  };

  const showError = (key: string) => submitted && key in errors;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <Button asChild variant="link" size="sm" className="mb-2 -ml-2">
          <Link to="/admin/bookings">
            <ArrowLeft aria-hidden />
            All bookings
          </Link>
        </Button>
        <PageHeader
          eyebrow="Phone · WhatsApp · Goibibo · Walk-in"
          title="New booking"
          description="For stays taken anywhere other than the website. The dates are checked against existing holds before it can be saved."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------------- source */}
          <Section title="Where did this come from?">
            <Field label="Booking source" htmlFor="source" className="sm:max-w-xs">
              <Select
                value={form.source}
                onValueChange={(value) => set("source", value as BookingSource)}
              >
                <SelectTrigger id="source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          {/* ------------------------------------------------------ the stay */}
          <Section title="The stay">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Villa" htmlFor="villa" error={showError("villaId") ? errors.villaId : undefined}>
                <Select
                  value={form.villaId}
                  onValueChange={(value) => {
                    const next = villas.find((v) => v.id === value);
                    setForm((prev) => ({
                      ...prev,
                      villaId: value,
                      roomIds: [],
                      nightlyRate: String(next?.baseRate ?? prev.nightlyRate),
                    }));
                  }}
                >
                  <SelectTrigger id="villa" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {villas.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} — {v.mode === "whole" ? "whole villa" : "split rooms"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex items-end">
                <div
                  className={cn(
                    "w-full rounded-lg p-3 text-sm",
                    isSplit ? "bg-status-uploaded-bg" : "bg-status-confirmed-bg",
                  )}
                >
                  <p className="font-medium text-ink">
                    {isSplit ? "Split into rooms" : "Whole villa"}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-600">
                    {isSplit
                      ? "Pick the rooms below. Other rooms stay bookable."
                      : "This booking holds all four bedrooms."}
                  </p>
                </div>
              </div>
            </div>

            {isSplit && villa && (
              <fieldset className="mt-4">
                <legend className="label-caps mb-2">Rooms</legend>
                <div className="grid gap-2 sm:grid-cols-4">
                  {villa.rooms.map((room) => {
                    const checked = form.roomIds.includes(room.id);
                    return (
                      <label
                        key={room.id}
                        className={cn(
                          "cursor-pointer rounded-lg p-3 text-sm transition-colors",
                          checked
                            ? "bg-gold/15 ring-1 ring-gold/50"
                            : "bg-sand-200/70 hover:bg-sand-300/70",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              set(
                                "roomIds",
                                checked
                                  ? form.roomIds.filter((r) => r !== room.id)
                                  : [...form.roomIds, room.id],
                              )
                            }
                            className="size-4 accent-[var(--color-clay)]"
                          />
                          <span className="font-medium text-ink">{room.name}</span>
                        </span>
                        <span className="mt-1 block pl-6 text-xs text-stone-600">
                          Sleeps {room.capacity} · {money(room.baseRate)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {showError("roomIds") && (
                  <p role="alert" className="mt-2 text-xs text-status-cancelled">
                    {errors.roomIds}
                  </p>
                )}
              </fieldset>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <Field label="Check-in" htmlFor="check-in" error={showError("checkIn") ? errors.checkIn : undefined}>
                <Input
                  id="check-in"
                  type="date"
                  min={today}
                  value={form.checkIn}
                  onChange={(event) => set("checkIn", event.target.value)}
                />
              </Field>
              <Field label="Check-out" htmlFor="check-out" error={showError("checkOut") ? errors.checkOut : undefined}>
                <Input
                  id="check-out"
                  type="date"
                  min={form.checkIn || today}
                  value={form.checkOut}
                  onChange={(event) => set("checkOut", event.target.value)}
                />
              </Field>
              <Field label="Adults" htmlFor="adults" error={showError("adults") ? errors.adults : undefined}>
                <Input
                  id="adults"
                  type="number"
                  min={1}
                  value={form.adults}
                  onChange={(event) => set("adults", event.target.value)}
                />
              </Field>
              <Field label="Children" htmlFor="children">
                <Input
                  id="children"
                  type="number"
                  min={0}
                  value={form.children}
                  onChange={(event) => set("children", event.target.value)}
                />
              </Field>
            </div>

            {submitted && errors.dates && (
              <p role="alert" className="mt-2 text-xs text-status-cancelled">
                {errors.dates}
              </p>
            )}

            {/* BR5 — a known conflict blocks the save and names the culprit. */}
            {conflicts.length > 0 && (
              <div role="alert" className="mt-4 flex gap-3 rounded-xl bg-status-cancelled-bg p-4">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-status-cancelled"
                  aria-hidden
                />
                <div className="text-sm">
                  <p className="font-medium text-ink">
                    {conflicts.length === 1 ? "That conflicts with an existing booking" : "Those dates are already held"}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {conflicts.map((other) => (
                      <li key={other.id}>
                        <Link
                          to={`/admin/bookings/${other.id}`}
                          className="text-status-cancelled underline underline-offset-4"
                        >
                          {other.reference}
                        </Link>
                        <span className="text-stone-600">
                          {" "}
                          — {other.roomIds.length === 0 ? "whole villa" : "rooms"},{" "}
                          {formatDate(other.checkIn)} to {formatDate(other.checkOut)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-stone-600">
                    {isSplit
                      ? "A whole-villa hold blocks every room; a room can only be sold once."
                      : "A whole-villa booking needs all four bedrooms free."}
                  </p>
                </div>
              </div>
            )}

            {nights > 0 && conflicts.length === 0 && form.checkOut > form.checkIn && (
              <p className="mt-4 flex items-center gap-2 text-sm text-status-confirmed">
                <Check className="size-4" aria-hidden />
                {villa?.name} is free for those {nights} {nights === 1 ? "night" : "nights"}.
              </p>
            )}
          </Section>

          {/* --------------------------------------------------------- guest */}
          <Section title="Guest">
            <Field label="Existing guest" htmlFor="customer" className="sm:max-w-sm">
              <Select value={form.customerId} onValueChange={(value) => set("customerId", value)}>
                <SelectTrigger id="customer" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_GUEST}>Someone new</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {form.customerId === NEW_GUEST && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Name" htmlFor="name" error={showError("name") ? errors.name : undefined}>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Deepti Krishnan"
                  />
                </Field>
                <Field label="Phone" htmlFor="phone" error={showError("phone") ? errors.phone : undefined}>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => set("phone", event.target.value)}
                    placeholder="+91 98860 71592"
                  />
                </Field>
                <Field label="Email" htmlFor="email" error={showError("email") ? errors.email : undefined}>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => set("email", event.target.value)}
                    placeholder="deepti@example.com"
                  />
                </Field>
              </div>
            )}

            <Field label="Special requests" htmlFor="requests" className="mt-4">
              <Textarea
                id="requests"
                rows={3}
                value={form.specialRequests}
                onChange={(event) => set("specialRequests", event.target.value)}
                placeholder="Vegetarian kitchen. Airport transfer on arrival."
              />
            </Field>
          </Section>

          {/* --------------------------------------------------------- money */}
          <Section title="Rate & payment">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field
                label="Nightly rate"
                htmlFor="rate"
                error={showError("nightlyRate") ? errors.nightlyRate : undefined}
              >
                <Input
                  id="rate"
                  type="number"
                  min={0}
                  step={500}
                  value={form.nightlyRate}
                  onChange={(event) => set("nightlyRate", event.target.value)}
                />
              </Field>
              <Field label="Discount" htmlFor="discount">
                <Input
                  id="discount"
                  type="number"
                  min={0}
                  step={500}
                  value={form.discount}
                  onChange={(event) => set("discount", event.target.value)}
                />
              </Field>
              <Field label="GST %" htmlFor="tax">
                <Input
                  id="tax"
                  type="number"
                  min={0}
                  max={28}
                  value={form.taxRate}
                  onChange={(event) => set("taxRate", event.target.value)}
                />
              </Field>
              <Field label="Advance taken" htmlFor="advance">
                <Input
                  id="advance"
                  type="number"
                  min={0}
                  step={1000}
                  value={form.advance}
                  onChange={(event) => set("advance", event.target.value)}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-stone-600">
              An advance above zero saves the booking as <strong>confirmed</strong>. Leave it
              at zero and it saves as <strong>pending payment</strong>, and the guest is sent
              instructions.
            </p>
          </Section>
        </div>

        {/* --------------------------------------------------------- summary */}
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <Eyebrow className="text-gold-400">Summary</Eyebrow>
            <p className="mt-3 font-display text-2xl text-white">
              {villa?.name ?? "Choose a villa"}
            </p>
            <p className="mt-1 text-sm text-sand/70">
              {bookingSource[form.source]}
              {isSplit && form.roomIds.length > 0 && ` · ${form.roomIds.length} rooms`}
              {nights > 0 && ` · ${nights} ${nights === 1 ? "night" : "nights"}`}
            </p>

            {conflicts.length > 0 && (
              <div className="mt-4">
                <StatusBadge label="Dates unavailable" tone="cancelled" />
              </div>
            )}

            <hr className="rule-gold my-5" />
            {nights > 0 ? (
              <FinancialBreakdown charges={charges} totals={totals} tone="dark" />
            ) : (
              <p className="text-sm text-sand/60">
                Pick the dates to see the breakdown.
              </p>
            )}

            <Button type="submit" className="mt-6 w-full" disabled={saving}>
              {saving ? "Saving…" : "Create booking"}
            </Button>
            {submitted && blocked && (
              <p role="alert" className="mt-3 text-xs text-clay-200">
                Fix the highlighted fields before saving.
              </p>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- fragments */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <h2 className="text-xl text-ink">{title}</h2>
      <hr className="rule-gold my-4" />
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div aria-describedby={error ? errorId : undefined}>{children}</div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-status-cancelled">
          {error}
        </p>
      )}
    </div>
  );
}
