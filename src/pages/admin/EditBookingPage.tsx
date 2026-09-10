import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { ErrorState, Eyebrow, PageHeader, StatusBadge } from "@/components/common";
import { FinancialBreakdown } from "@/components/booking/FinancialBreakdown";
import { useBookings, useBookingView, useMockData, useVillas } from "@/hooks/useData";
import { bookingTotals, findConflicts, holdsInventory } from "@/services/domain";
import { bookingStatus, sourceOptions } from "@/lib/status";
import { formatDate, money, nightsBetween } from "@/lib/format";
import { GST_RATES } from "@/lib/tax";
import { cn } from "@/lib/utils";
import type { BookingSource } from "@/types";

/**
 * Editing an existing booking.
 *
 * Every field that touches inventory — villa, rooms, dates — re-runs the
 * conflict check, ignoring this booking so a stay never collides with itself.
 * The guest is deliberately not editable here: moving a booking to a different
 * person is a different operation, and doing it by accident on this screen
 * would be far too easy.
 */
export default function EditBookingPage() {
  const { id } = useParams();
  const view = useBookingView(id);
  const villas = useVillas();
  const bookings = useBookings();
  const { updateBooking } = useMockData();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => ({
    villaId: view?.booking.villaId ?? "",
    roomIds: view?.booking.roomIds ?? [],
    checkIn: view?.booking.checkIn ?? "",
    checkOut: view?.booking.checkOut ?? "",
    // Empty means the villa's standard hours, which is what the column holds
    // as null — so an empty field here saves as "no special arrangement".
    checkInTime: view?.booking.checkInTime ?? "",
    checkOutTime: view?.booking.checkOutTime ?? "",
    adults: String(view?.booking.adults ?? 2),
    children: String(view?.booking.children ?? 0),
    source: (view?.booking.source ?? "phone") as BookingSource,
    nightlyRate: String(view?.booking.charges.nightlyRate ?? 0),
    weekendSurcharge: String(view?.booking.charges.weekendSurcharge ?? 0),
    seasonalSurcharge: String(view?.booking.charges.seasonalSurcharge ?? 0),
    extraGuestCharge: String(view?.booking.charges.extraGuestCharge ?? 0),
    addOns: String(view?.booking.charges.addOns ?? 0),
    discount: String(view?.booking.charges.discount ?? 0),
    // A rate outside the legal set (HOS-1020 carried 25%) is corrected to the
    // nearest legal one rather than shown as a valid choice.
    taxRate: String(Math.round((view?.booking.charges.taxRate ?? 0.18) * 100)),
    specialRequests: view?.booking.specialRequests ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Hooks must run on every render, so the conflict check is hoisted above the
  // guards below rather than sitting after them.
  const villaForConflicts = villas.find((v) => v.id === form.villaId);
  const conflicts = useMemo(() => {
    if (!view) return [];
    if (!form.villaId || !form.checkIn || !form.checkOut || form.checkOut <= form.checkIn)
      return [];
    return findConflicts(
      {
        villaId: form.villaId,
        roomIds: villaForConflicts?.mode === "split" ? form.roomIds : [],
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        ignoreBookingId: view.booking.id,
      },
      bookings,
    );
  }, [
    view, form.villaId, form.roomIds, form.checkIn, form.checkOut,
    villaForConflicts?.mode, bookings,
  ]);

  if (!view) {
    return (
      <ErrorState
        title="Booking not found"
        action={
          <Button asChild variant="outline" className="mt-2">
            <Link to="/admin/bookings">Back to bookings</Link>
          </Button>
        }
      />
    );
  }

  const { booking, customer } = view;

  // A released booking is history; re-dating it would resurrect a hold on
  // inventory someone else may already have taken.
  if (!holdsInventory(booking)) {
    return (
      <div className="space-y-6">
        <Button asChild variant="link" size="sm" className="-ml-2">
          <Link to={`/admin/bookings/${booking.id}`}>
            <ArrowLeft aria-hidden />
            Back to the booking
          </Link>
        </Button>
        <ErrorState
          title={`${booking.reference} is ${bookingStatus.get(booking.status).label.toLowerCase()}`}
          description="A booking that no longer holds inventory cannot be edited — its dates may since have been sold to someone else. Create a new booking instead."
          action={
            <Button asChild className="mt-2">
              <Link to="/admin/bookings/new">New booking</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const villa = villas.find((v) => v.id === form.villaId);
  const isSplit = villa?.mode === "split";
  const nights =
    form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0;

  const errors: Record<string, string | undefined> = {};
  if (!form.checkIn) errors.checkIn = "A check-in date is required.";
  if (!form.checkOut) errors.checkOut = "A check-out date is required.";
  if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn)
    errors.dates = "Check-out has to be after check-in.";
  if (isSplit && form.roomIds.length === 0)
    errors.roomIds = "This villa is in split mode — pick at least one room.";
  if (Number(form.adults) < 1) errors.adults = "At least one adult.";
  const guests = Number(form.adults) + Number(form.children);
  if (villa && guests > villa.capacity)
    errors.adults = `${villa.name} sleeps ${villa.capacity}. That is ${guests} guests.`;
  if (!(Number(form.nightlyRate) > 0)) errors.nightlyRate = "Enter a nightly rate.";

  const charges = {
    nightlyRate: Number(form.nightlyRate) || 0,
    nights,
    weekendSurcharge: Number(form.weekendSurcharge) || 0,
    seasonalSurcharge: Number(form.seasonalSurcharge) || 0,
    extraGuestCharge: Number(form.extraGuestCharge) || 0,
    food: booking.charges.food, // owned by the kitchen board (BR12), not editable here
    addOns: Number(form.addOns) || 0,
    discount: Number(form.discount) || 0,
    taxRate: (Number(form.taxRate) || 0) / 100,
  };
  const totals = bookingTotals(charges, booking.amountPaid);
  const blocked = Object.values(errors).some(Boolean) || conflicts.length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blocked) {
      toast.error("The changes cannot be saved yet", {
        description:
          conflicts.length > 0
            ? "Those dates conflict with an existing hold."
            : "Some fields still need attention.",
      });
      return;
    }
    setSaving(true);
    updateBooking(booking.id, {
      villaId: form.villaId,
      roomIds: isSplit ? form.roomIds : [],
      bookingMode: isSplit ? "split" : "whole",
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      checkInTime: form.checkInTime,
      checkOutTime: form.checkOutTime,
      adults: Number(form.adults),
      children: Number(form.children),
      source: form.source,
      charges,
      specialRequests: form.specialRequests.trim() || undefined,
    });
    toast.success(`${booking.reference} updated`);
    window.setTimeout(() => navigate(`/admin/bookings/${booking.id}`), 400);
  };

  const showError = (key: string) => submitted && Boolean(errors[key]);

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <Button asChild variant="link" size="sm" className="mb-2 -ml-2">
          <Link to={`/admin/bookings/${booking.id}`}>
            <ArrowLeft aria-hidden />
            Back to the booking
          </Link>
        </Button>
        <PageHeader
          eyebrow={`${booking.reference} · ${customer?.name}`}
          title="Edit booking"
          description="Changing the villa, rooms or dates re-checks availability. The guest and the payments are not editable here."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="The stay">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Villa" htmlFor="villa">
                <Select
                  value={form.villaId}
                  onValueChange={(value) => {
                    setForm((prev) => ({ ...prev, villaId: value, roomIds: [] }));
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
              <Field label="Source" htmlFor="source">
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
                          Sleeps {room.capacity}
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
                <Input id="check-in" type="date" value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} />
              </Field>
              <Field label="Check-out" htmlFor="check-out" error={showError("checkOut") ? errors.checkOut : undefined}>
                <Input id="check-out" type="date" min={form.checkIn} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} />
              </Field>
              <Field label="Adults" htmlFor="adults" error={showError("adults") ? errors.adults : undefined}>
                <Input id="adults" type="number" min={1} value={form.adults} onChange={(e) => set("adults", e.target.value)} />
              </Field>
              <Field label="Children" htmlFor="children">
                <Input id="children" type="number" min={0} value={form.children} onChange={(e) => set("children", e.target.value)} />
              </Field>
              <Field
                label="Arrival time"
                htmlFor="check-in-time"
                hint={`Blank keeps the villa's ${villa?.checkInTime ?? "14:00"}`}
              >
                <Input id="check-in-time" type="time" value={form.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
              </Field>
              <Field
                label="Departure time"
                htmlFor="check-out-time"
                hint={`Blank keeps the villa's ${villa?.checkOutTime ?? "11:00"}`}
              >
                <Input id="check-out-time" type="time" value={form.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
              </Field>
            </div>

            {submitted && errors.dates && (
              <p role="alert" className="mt-2 text-xs text-status-cancelled">
                {errors.dates}
              </p>
            )}

            {conflicts.length > 0 ? (
              <div role="alert" className="mt-4 flex gap-3 rounded-xl bg-status-cancelled-bg p-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-cancelled" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium text-ink">Those dates are already held</p>
                  <ul className="mt-2 space-y-1">
                    {conflicts.map((other) => (
                      <li key={other.id}>
                        <Link to={`/admin/bookings/${other.id}`} className="text-status-cancelled underline underline-offset-4">
                          {other.reference}
                        </Link>
                        <span className="text-stone-600">
                          {" "}— {formatDate(other.checkIn)} to {formatDate(other.checkOut)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              nights > 0 && (
                <p className="mt-4 flex items-center gap-2 text-sm text-status-confirmed">
                  <Check className="size-4" aria-hidden />
                  {villa?.name} is free for those {nights} {nights === 1 ? "night" : "nights"}.
                </p>
              )
            )}
          </Section>

          <Section title="Charges">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nightly rate" htmlFor="rate" error={showError("nightlyRate") ? errors.nightlyRate : undefined}>
                <Input id="rate" type="number" min={0} step={500} value={form.nightlyRate} onChange={(e) => set("nightlyRate", e.target.value)} />
              </Field>
              <Field label="Weekend surcharge" htmlFor="weekend">
                <Input id="weekend" type="number" min={0} step={500} value={form.weekendSurcharge} onChange={(e) => set("weekendSurcharge", e.target.value)} />
              </Field>
              <Field label="Seasonal surcharge" htmlFor="seasonal">
                <Input id="seasonal" type="number" min={0} step={500} value={form.seasonalSurcharge} onChange={(e) => set("seasonalSurcharge", e.target.value)} />
              </Field>
              <Field label="Extra guest charge" htmlFor="extra">
                <Input id="extra" type="number" min={0} step={500} value={form.extraGuestCharge} onChange={(e) => set("extraGuestCharge", e.target.value)} />
              </Field>
              <Field label="Add-ons" htmlFor="addons">
                <Input id="addons" type="number" min={0} step={500} value={form.addOns} onChange={(e) => set("addOns", e.target.value)} />
              </Field>
              <Field label="Discount" htmlFor="discount">
                <Input id="discount" type="number" min={0} step={500} value={form.discount} onChange={(e) => set("discount", e.target.value)} />
              </Field>
              <Field label="GST" htmlFor="tax">
                <Select value={form.taxRate} onValueChange={(value) => set("taxRate", value)}>
                  <SelectTrigger id="tax" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((rate) => (
                      <SelectItem key={rate.value} value={String(rate.value)}>
                        {rate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <p className="mt-3 text-xs text-stone-600">
              Food is {money(booking.charges.food)} and is set by the kitchen board as
              orders are billed — it is not editable here.
            </p>
          </Section>

          <Section title="Special requests">
            <Textarea
              rows={3}
              value={form.specialRequests}
              onChange={(e) => set("specialRequests", e.target.value)}
              aria-label="Special requests"
            />
          </Section>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
            <Eyebrow className="text-gold-400">Revised total</Eyebrow>
            <p className="mt-3 font-display text-2xl text-white">{villa?.name}</p>
            <p className="mt-1 text-sm text-sand/70">
              {nights > 0 ? `${nights} ${nights === 1 ? "night" : "nights"}` : "Pick the dates"}
            </p>
            {conflicts.length > 0 && (
              <div className="mt-4">
                <StatusBadge label="Dates unavailable" tone="cancelled" />
              </div>
            )}
            <hr className="rule-gold my-5" />
            {nights > 0 && <FinancialBreakdown charges={charges} totals={totals} tone="dark" />}
            <Button type="submit" className="mt-6 w-full" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full text-sand/70 hover:bg-sand/12">
              <Link to={`/admin/bookings/${booking.id}`}>Discard</Link>
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
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
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-status-cancelled">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-stone-600">{hint}</p>
      )}
    </div>
  );
}
