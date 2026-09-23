import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BellRing,
  Check,
  PackageCheck,
  Search,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityTimeline, Eyebrow, SignedPhoto, StatusBadge } from "@/components/common";
import { useActivity, useMockData, useVillas } from "@/hooks/useData";
import type { OwnerSuggestion } from "@/services/mock/MockDataProvider";
import {
  CATEGORIES,
  COURIER,
  DISPOSITIONS,
  LOCATIONS,
  SENSITIVITY,
  STATUS,
} from "@/lib/lostFound";
import { formatDate, formatDateTime, money } from "@/lib/format";
import type { CourierStatus, LostItem, LostItemDisposition } from "@/types";
import { toISODate } from "@/services/domain";

/**
 * One found item, and everything the desk does with it.
 *
 * Only the step that fits the item's state is offered — the database refuses
 * anything else anyway (`lost_item_transition_allowed`), and a button that
 * always fails teaches people to distrust the buttons that work.
 */
export function LostItemSheet({
  item,
  onClose,
}: {
  item: LostItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(item)} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {item && <SheetBody item={item} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ item }: { item: LostItem }) {
  const villas = useVillas();
  const {
    customers,
    companions,
    bookings,
    lostClaims,
    lostReturns,
    lostReports,
    suggestLostItemOwners,
    identifyLostItemOwner,
    contactLostItemOwner,
    decideLostItemClaim,
    arrangeLostItemReturn,
    releaseLostItem,
    disposeLostItem,
    setLostItemStatus,
    moveLostItem,
    linkLostReport,
  } = useMockData();
  const trail = useActivity(item.id);

  const villa = villas.find((v) => v.id === item.villaId);
  const room = villa?.rooms.find((r) => r.id === item.roomId);
  const booking = bookings.find((b) => b.id === item.bookingId);
  const owner = customers.find((c) => c.id === item.customerId);
  const companion = companions.find((c) => c.id === item.companionId);
  const claim = lostClaims.find((c) => c.itemId === item.id && c.status === "pending");
  const lastClaim = lostClaims.find((c) => c.itemId === item.id);
  const back = lostReturns.find((r) => r.itemId === item.id);
  const status = STATUS[item.status];

  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<{ error: string | null }>, done: string) => {
    setBusy(true);
    const { error } = await task();
    setBusy(false);
    if (error) toast.error(error);
    else toast.success(done);
  };

  return (
    <>
      <SheetHeader>
        <Eyebrow className="text-gold-700">{item.reference}</Eyebrow>
        <SheetTitle className="text-2xl">{item.title}</SheetTitle>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={status.label} tone={status.tone} />
          {item.sensitivity !== "normal" && (
            <StatusBadge label={SENSITIVITY[item.sensitivity].label} tone="cancelled" />
          )}
        </div>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-8">
        {/* ------------------------------------------------------ photos */}
        {item.photoPaths.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {item.photoPaths.map((path) => (
              <SignedPhoto
                key={path}
                path={path}
                alt={item.title}
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-sand-200/60 p-3 text-sm text-stone-600">
            No photograph. Add one before contacting a guest — it is how they recognise it.
          </p>
        )}

        {/* ----------------------------------------------------- the facts */}
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="Kind">{CATEGORIES[item.category]}</Fact>
          <Fact label="Found">{formatDateTime(item.foundAt)}</Fact>
          <Fact label="Where">
            {[LOCATIONS[item.location], villa?.name, room?.name].filter(Boolean).join(" · ")}
            {item.locationNote && <span className="block text-stone-600">{item.locationNote}</span>}
          </Fact>
          <Fact label="Found by">{item.foundByName || "—"}</Fact>
          {(item.brand || item.colour) && (
            <Fact label="Looks like">{[item.brand, item.colour].filter(Boolean).join(", ")}</Fact>
          )}
          <Fact label="Hold until">
            {item.retentionUntil ? formatDate(item.retentionUntil) : "—"}
          </Fact>
          {item.description && <Fact label="Description">{item.description}</Fact>}
          {item.distinguishing && (
            <Fact label="Only the owner would know">
              <span className="text-status-cancelled">{item.distinguishing}</span>
            </Fact>
          )}
        </dl>

        <StorageEditor
          item={item}
          busy={busy}
          onSave={(where, ref) => run(() => moveLostItem(item.id, where, ref), "Storage updated")}
        />

        {/* ---------------------------------------------------- the owner */}
        <section className="space-y-3">
          <Eyebrow className="text-gold-700">Whose it may be</Eyebrow>
          {owner ? (
            <div className="rounded-lg bg-sand-200/60 p-3 text-sm">
              <p className="font-medium text-ink">{companion?.fullName ?? owner.name}</p>
              <p className="text-stone-600">
                {companion && `On ${owner.name}'s booking · `}
                {booking && (
                  <Link to={`/admin/bookings/${booking.id}`} className="underline">
                    {booking.reference}
                  </Link>
                )}
                {booking && ` · left ${formatDate(booking.checkOut)}`}
              </p>
              <p className="text-stone-600">{owner.phone}</p>
            </div>
          ) : (
            <OwnerSuggestions
              item={item}
              load={() => suggestLostItemOwners(item.id)}
              onPick={(bookingId, companionId) =>
                run(
                  () => identifyLostItemOwner(item.id, bookingId, companionId),
                  "Possible owner recorded — they have not been told yet",
                )
              }
            />
          )}

          {/* Contacting is its own deliberate step, never a side effect. */}
          {owner && ["guest_identified", "claim_rejected", "unclaimed"].includes(item.status) && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const { sent, error } = await contactLostItemOwner(item.id);
                setBusy(false);
                if (error) return toast.error(error);
                if (sent > 0) toast.success("They have been told in their portal");
                else
                  toast.warning("They have no portal login", {
                    description: `Nothing was sent. Call them on ${owner.phone || "their number"}.`,
                  });
              }}
            >
              <BellRing aria-hidden />
              Tell the guest
            </Button>
          )}
        </section>

        {/* ------------------------------------------------------- claims */}
        {claim && (
          <section className="space-y-3 rounded-xl bg-status-pending-bg/60 p-4">
            <Eyebrow className="text-status-pending">Claim to verify</Eyebrow>
            <blockquote className="text-sm text-ink italic">“{claim.statement}”</blockquote>
            {item.distinguishing ? (
              <p className="text-sm text-stone-600">
                Compare with: <span className="text-ink">{item.distinguishing}</span>
              </p>
            ) : (
              <p className="text-sm text-stone-600">
                Nothing distinguishing was recorded — ask them something only the owner
                would know before you approve.
              </p>
            )}
            {item.sensitivity !== "normal" && (
              <p className="flex items-center gap-1.5 text-sm text-status-cancelled">
                <ShieldAlert className="size-4" aria-hidden />
                Management verifies claims on this item.
              </p>
            )}
            <ClaimDecision
              busy={busy}
              onDecide={(approve, note) =>
                run(
                  () => decideLostItemClaim(claim.id, approve, note),
                  approve ? "Claim verified — the guest has been told" : "Claim rejected",
                )
              }
            />
          </section>
        )}

        {lastClaim?.status === "rejected" && !claim && (
          <p className="text-sm text-stone-600">
            Last claim rejected: {lastClaim.rejectionNote}
          </p>
        )}

        {/* ------------------------------------------------------- return */}
        {back && (
          <section className="space-y-3">
            <Eyebrow className="text-gold-700">
              {back.method === "courier" ? "Courier return" : "Collection"}
            </Eyebrow>
            {back.method === "courier" ? (
              <>
                <div className="rounded-lg bg-sand-200/60 p-3 text-sm">
                  <p className="font-medium text-ink">
                    {back.recipientName} · {back.recipientPhone}
                  </p>
                  <p className="text-stone-600">
                    {[back.addressLine1, back.addressLine2, back.city, back.state, back.postalCode, back.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {back.deliveryNotes && <p className="text-stone-600">{back.deliveryNotes}</p>}
                </div>
                {back.shippingStatus && (
                  <StatusBadge
                    label={COURIER[back.shippingStatus].label}
                    tone={COURIER[back.shippingStatus].tone}
                  />
                )}
                {!["returned", "closed"].includes(item.status) && (
                  <CourierForm
                    busy={busy}
                    initial={back}
                    onSave={(input) =>
                      run(() => arrangeLostItemReturn(item.id, input), "Return updated — the guest is told of any change")
                    }
                  />
                )}
              </>
            ) : (
              <PickupPanel
                item={item}
                pickupAt={back.pickupAt}
                collectedBy={back.collectedBy}
                releasedAt={back.releasedAt}
                busy={busy}
                onSchedule={(when) =>
                  run(() => arrangeLostItemReturn(item.id, { pickupAt: when }), "Collection arranged — the guest has been told")
                }
                onRelease={(who, checked) =>
                  run(() => releaseLostItem(item.id, who, checked), "Released and recorded")
                }
              />
            )}
          </section>
        )}

        {/* -------------------------------------------- matching reports */}
        {!owner && lostReports.some((r) => r.status === "open" && r.category === item.category) && (
          <section className="space-y-2">
            <Eyebrow className="text-gold-700">Guests who reported something like this</Eyebrow>
            <ul className="space-y-2">
              {lostReports
                .filter((r) => r.status === "open" && r.category === item.category)
                .slice(0, 4)
                .map((report) => (
                  <li
                    key={report.id}
                    className="flex items-center gap-3 rounded-lg bg-sand-200/60 p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">{report.title}</span>
                      <span className="block text-xs text-stone-600">
                        {report.reference} · {[report.colour, report.brand].filter(Boolean).join(", ")}
                        {report.locationNote && ` · ${report.locationNote}`}
                      </span>
                    </span>
                    {report.bookingId && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          await run(() => linkLostReport(report.id, item.id), "Report linked");
                          await run(
                            () => identifyLostItemOwner(item.id, report.bookingId!, report.companionId),
                            "Possible owner recorded",
                          );
                        }}
                      >
                        This is theirs
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------------- the end of it */}
        <section className="space-y-3">
          <Eyebrow className="text-gold-700">Status</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {["found", "guest_identified"].includes(item.status) && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => run(() => setLostItemStatus(item.id, "under_review"), "Under review")}
              >
                Mark under review
              </Button>
            )}
            {["found", "under_review", "guest_contacted", "claim_rejected"].includes(item.status) && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => run(() => setLostItemStatus(item.id, "unclaimed", "Nobody came forward"), "Marked unclaimed")}
              >
                Nobody has claimed it
              </Button>
            )}
            {["returned", "disposed", "claim_rejected"].includes(item.status) && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => run(() => setLostItemStatus(item.id, "closed"), "Closed")}
              >
                <Check aria-hidden />
                Close
              </Button>
            )}
          </div>
          {item.status === "unclaimed" && (
            <Disposal
              item={item}
              busy={busy}
              onDispose={(disposition, note) =>
                run(() => disposeLostItem(item.id, disposition, note), "Disposition recorded")
              }
            />
          )}
          {item.disposition && item.disposition !== "returned" && (
            <p className="text-sm text-stone-600">
              {DISPOSITIONS[item.disposition as Exclude<LostItemDisposition, "returned">]}
              {item.dispositionNote && ` — ${item.dispositionNote}`}
            </p>
          )}
        </section>

        {/* ---------------------------------------------- chain of custody */}
        <section>
          <Eyebrow className="mb-3 text-gold-700">Chain of custody</Eyebrow>
          <ActivityTimeline events={trail} />
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- pieces */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function StorageEditor({
  item,
  busy,
  onSave,
}: {
  item: LostItem;
  busy: boolean;
  onSave: (where: string, ref: string) => void;
}) {
  const [where, setWhere] = useState(item.storageLocation);
  const [ref, setRef] = useState(item.storageRef);
  const changed = where !== item.storageLocation || ref !== item.storageRef;

  return (
    <section className="space-y-2">
      <Eyebrow className="text-gold-700">
        Kept in {item.secured && "· secured"}
      </Eyebrow>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1 space-y-1">
          <Label htmlFor="storage-where" className="sr-only">Storage</Label>
          <Input id="storage-where" value={where} onChange={(e) => setWhere(e.target.value)} />
        </div>
        <div className="w-28 space-y-1">
          <Label htmlFor="storage-ref" className="sr-only">Shelf</Label>
          <Input id="storage-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Shelf" />
        </div>
        <Button size="sm" variant="outline" disabled={!changed || busy} onClick={() => onSave(where, ref)}>
          Move
        </Button>
      </div>
      <p className="text-xs text-stone-600">Every move is written to the custody trail.</p>
    </section>
  );
}

function OwnerSuggestions({
  item,
  load,
  onPick,
}: {
  item: LostItem;
  load: () => Promise<OwnerSuggestion[]>;
  onPick: (bookingId: string, companionId?: string) => void;
}) {
  const { companions } = useMockData();
  const [rows, setRows] = useState<OwnerSuggestion[] | null>(null);

  useEffect(() => {
    let live = true;
    if (!item.villaId) return;
    void load().then((found) => {
      if (live) setRows(found);
    });
    return () => {
      live = false;
    };
    // `load` is a fresh closure each render; the item is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.villaId]);

  if (!item.villaId) {
    return (
      <p className="text-sm text-stone-600">
        Found outside a villa, so there is no stay to suggest. Link a guest report below,
        or wait for someone to ask.
      </p>
    );
  }

  if (rows === null) return <p className="text-sm text-stone-600">Looking at recent stays…</p>;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-stone-600">
        No stay at that villa around then. It may be a staff member&rsquo;s, or a visitor&rsquo;s.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-stone-600">
        <Search className="size-3.5" aria-hidden />
        Suggestions from stays at that villa — nothing is tied to anyone until you choose.
      </p>
      <ul className="space-y-2">
        {rows.map((row) => {
          const party = companions.filter((c) => c.bookingId === row.bookingId);
          return (
            <li key={row.bookingId} className="rounded-lg bg-sand-200/60 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{row.guestName}</span>
                  <span className="block text-xs text-stone-600">
                    {row.reference} · left {formatDate(row.checkOut)}
                    {row.sameRoom && " · same bedroom"}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => onPick(row.bookingId)}>
                  Theirs
                </Button>
              </div>
              {party.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {party.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => onPick(row.bookingId, person.id)}
                      className="rounded-full bg-white px-2.5 py-1 text-xs text-ink ring-1 ring-ink/10 hover:ring-gold/50"
                    >
                      {person.fullName}&rsquo;s
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClaimDecision({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (approve: boolean, note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <Label htmlFor="claim-note">Note — required to reject</Label>
      <Textarea
        id="claim-note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="The engraving they described matches"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onDecide(true, note)}>
          <Check aria-hidden />
          It is theirs
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || note.trim().length < 3}
          onClick={() => onDecide(false, note)}
        >
          <X aria-hidden />
          Reject
        </Button>
      </div>
    </div>
  );
}

function CourierForm({
  busy,
  initial,
  onSave,
}: {
  busy: boolean;
  initial: {
    courierProvider: string;
    trackingNumber: string;
    shippingCost?: number;
    paidBy?: "guest" | "property";
    paymentStatus: "pending" | "paid" | "waived";
    paymentReference: string;
    shippingStatus?: CourierStatus;
    expectedDelivery?: string;
  };
  onSave: (input: {
    courierProvider: string;
    trackingNumber: string;
    shippingCost?: number;
    paidBy?: "guest" | "property";
    paymentStatus: "pending" | "paid" | "waived";
    paymentReference: string;
    shippingStatus?: CourierStatus;
    expectedDelivery?: string;
  }) => void;
}) {
  const [provider, setProvider] = useState(initial.courierProvider);
  const [tracking, setTracking] = useState(initial.trackingNumber);
  const [cost, setCost] = useState(initial.shippingCost != null ? String(initial.shippingCost) : "");
  const [paidBy, setPaidBy] = useState<"guest" | "property">(initial.paidBy ?? "guest");
  const [payment, setPayment] = useState(initial.paymentStatus);
  const [paymentRef, setPaymentRef] = useState(initial.paymentReference);
  const [shipping, setShipping] = useState<CourierStatus>(initial.shippingStatus ?? "quote_required");
  const [expected, setExpected] = useState(initial.expectedDelivery ?? "");

  return (
    <div className="space-y-3 rounded-xl ring-1 ring-ink/10 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="courier-provider" label="Courier">
          <Input id="courier-provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Blue Dart" />
        </Field>
        <Field id="courier-tracking" label="Tracking number">
          <Input id="courier-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </Field>
        <Field id="courier-cost" label="Shipping (₹)">
          <Input id="courier-cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field id="courier-payer" label="Paid by">
          <Select value={paidBy} onValueChange={(v) => setPaidBy(v as "guest" | "property")}>
            <SelectTrigger id="courier-payer" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="guest">The guest</SelectItem>
              <SelectItem value="property">The property</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="courier-payment" label="Payment">
          <Select value={payment} onValueChange={(v) => setPayment(v as typeof payment)}>
            <SelectTrigger id="courier-payment" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="waived">Waived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="courier-payment-ref" label="Payment reference">
          <Input id="courier-payment-ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="UPI / UTR" />
        </Field>
        <Field id="courier-status" label="Shipment">
          <Select value={shipping} onValueChange={(v) => setShipping(v as CourierStatus)}>
            <SelectTrigger id="courier-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(COURIER).map(([value, meta]) => (
                <SelectItem key={value} value={value}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="courier-expected" label="Expected">
          <Input id="courier-expected" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
      </div>
      {cost && (
        <p className="text-xs text-stone-600">
          {money(Number(cost))}, paid by {paidBy === "guest" ? "the guest" : "the property"} ·{" "}
          {payment}. No payment is taken here — record it once it has arrived.
        </p>
      )}
      <Button
        size="sm"
        disabled={busy}
        onClick={() =>
          onSave({
            courierProvider: provider.trim(),
            trackingNumber: tracking.trim(),
            shippingCost: cost ? Number(cost) : undefined,
            paidBy,
            paymentStatus: payment,
            paymentReference: paymentRef.trim(),
            shippingStatus: shipping,
            expectedDelivery: expected || undefined,
          })
        }
      >
        <Truck aria-hidden />
        Save shipment
      </Button>
    </div>
  );
}

function PickupPanel({
  item,
  pickupAt,
  collectedBy,
  releasedAt,
  busy,
  onSchedule,
  onRelease,
}: {
  item: LostItem;
  pickupAt?: string;
  collectedBy: string;
  releasedAt?: string;
  busy: boolean;
  onSchedule: (when: string) => void;
  onRelease: (who: string, idChecked: boolean) => void;
}) {
  const [when, setWhen] = useState("");
  const [who, setWho] = useState(collectedBy);
  const [checked, setChecked] = useState(false);

  if (releasedAt) {
    return (
      <p className="text-sm text-ink">
        Released {formatDateTime(releasedAt)} to {collectedBy}, photo ID checked.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl ring-1 ring-ink/10 p-4">
      {pickupAt ? (
        <p className="text-sm text-ink">Collecting {formatDateTime(pickupAt)}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field id="pickup-when" label="Collection time">
            <Input id="pickup-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Button size="sm" variant="outline" disabled={!when || busy} onClick={() => onSchedule(new Date(when).toISOString())}>
            Set time
          </Button>
        </div>
      )}

      {item.status === "ready_for_pickup" && (
        <div className="space-y-2 border-t border-ink/10 pt-3">
          <Field id="pickup-who" label="Collected by">
            <Input id="pickup-who" value={who} onChange={(e) => setWho(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="size-4 accent-[var(--color-clay)]"
            />
            I have checked their photo ID
          </label>
          <Button size="sm" disabled={!checked || who.trim().length < 2 || busy} onClick={() => onRelease(who.trim(), checked)}>
            <PackageCheck aria-hidden />
            Release item
          </Button>
        </div>
      )}
    </div>
  );
}

function Disposal({
  item,
  busy,
  onDispose,
}: {
  item: LostItem;
  busy: boolean;
  onDispose: (disposition: LostItemDisposition, note: string) => void;
}) {
  const [disposition, setDisposition] = useState<LostItemDisposition>("donated");
  const [note, setNote] = useState("");
  const past = item.retentionUntil && item.retentionUntil < toISODate(new Date());

  return (
    <div className="space-y-2 rounded-xl ring-1 ring-ink/10 p-4">
      <p className="text-sm text-stone-600">
        {past
          ? `Held past ${formatDate(item.retentionUntil!)} — the property's retention period is over.`
          : `Property policy holds it until ${item.retentionUntil ? formatDate(item.retentionUntil) : "its retention date"}.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={disposition} onValueChange={(v) => setDisposition(v as LostItemDisposition)}>
          <SelectTrigger aria-label="Disposition" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(DISPOSITIONS).map(([value, text]) => (
              <SelectItem key={value} value={value}>{text}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input aria-label="Disposition note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where it went" />
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onDispose(disposition, note.trim())}>
        Record disposition
      </Button>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
