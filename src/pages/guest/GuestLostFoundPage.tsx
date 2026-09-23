import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, PackageSearch, Search, Truck, X } from "lucide-react";
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
import { EmptyState, Eyebrow, SignedPhoto, StatusBadge } from "@/components/common";
import { useMockData, useVillas } from "@/hooks/useData";
import { supabase } from "@/services/supabase/client";
import { ACCEPTED_PHOTO_TYPES } from "@/services/supabase/receipts";
import { CATEGORIES, COURIER, LOCATIONS, STATUS } from "@/lib/lostFound";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GuestLostItem, LostItemCategory, LostReport } from "@/types";

/**
 * Lost & Found, from the guest's side.
 *
 * Everything here reads the `guest_lost_items` view: the guest sees their own
 * cases and nothing about the property's shelves, who found it, or the detail
 * they will be asked to describe. It stays open after checkout — recovering
 * something you left behind is the one thing a guest needs once they have
 * gone — without reopening the kitchen, requests or the bill.
 */
export default function GuestLostFoundPage() {
  const { guestLostItems, lostReports } = useMockData();

  const toAnswer = guestLostItems.filter(
    (i) => i.isMineToAnswer && ["guest_contacted", "claim_rejected", "unclaimed"].includes(i.status),
  );
  const underWay = guestLostItems.filter((i) => !toAnswer.includes(i) && !["returned", "closed", "disposed"].includes(i.status));
  const finished = guestLostItems.filter((i) => ["returned", "closed"].includes(i.status));

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">Lost & Found</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Left something behind?</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Tell us what is missing, and see anything our team has found that may be yours.
        </p>
      </header>

      {/* ------------------------------------------------- needs an answer */}
      {toAnswer.map((item) => (
        <FoundForYou key={item.id} item={item} />
      ))}

      {/* ------------------------------------------------------ under way */}
      {underWay.map((item) => (
        <CaseCard key={item.id} item={item} />
      ))}

      <ReportForm />

      {lostReports.length > 0 && <MyReports reports={lostReports} />}

      {finished.length > 0 && (
        <section className="space-y-3">
          <Eyebrow className="text-gold-700">Returned to you</Eyebrow>
          {finished.map((item) => (
            <CaseCard key={item.id} item={item} compact />
          ))}
        </section>
      )}

      {guestLostItems.length === 0 && lostReports.length === 0 && (
        <EmptyState
          icon={<PackageSearch className="size-5" />}
          title="Nothing found for you"
          description="If our team finds something that may be yours, it will appear here and we will let you know."
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ we found something */

function FoundForYou({ item }: { item: GuestLostItem }) {
  const villas = useVillas();
  const { respondToLostItem } = useMockData();
  const [claiming, setClaiming] = useState(false);
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);

  const villa = villas.find((v) => v.id === item.villaId);
  const room = villa?.rooms.find((r) => r.id === item.roomId);

  const answer = async (isMine: boolean) => {
    setBusy(true);
    const { error } = await respondToLostItem(item.id, isMine, statement.trim());
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(
      isMine ? "Thank you — we will check it and be in touch" : "Thank you for letting us know",
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-soft ring-2 ring-gold/40">
      <div className="relative aspect-[16/9]">
        <SignedPhoto path={item.photoPaths[0]} alt={item.title} className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        <div className="absolute inset-x-5 bottom-4">
          <Eyebrow className="text-gold-300">We found something</Eyebrow>
          <h2 className="mt-1 font-display text-2xl text-white">{item.title}</h2>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Careful words: it may be theirs. Nobody has decided it is. */}
        <p className="text-sm text-ink">
          Our team found an item that <em>may</em> belong to you
          {villa && ` after your stay at ${villa.name}`}. Is it yours?
        </p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="label-caps">Found</dt>
            <dd className="mt-0.5 text-ink">
              {[villa?.name, room?.name ?? LOCATIONS[item.location]].filter(Boolean).join(" — ")}
            </dd>
          </div>
          <div>
            <dt className="label-caps">When</dt>
            <dd className="mt-0.5 text-ink">{formatDate(item.foundAt.slice(0, 10))}</dd>
          </div>
          {(item.brand || item.colour) && (
            <div>
              <dt className="label-caps">Looks like</dt>
              <dd className="mt-0.5 text-ink">{[item.brand, item.colour].filter(Boolean).join(", ")}</dd>
            </div>
          )}
        </dl>

        {item.status === "claim_rejected" && item.claimNote && (
          <p className="rounded-lg bg-status-cancelled-bg p-3 text-sm text-status-cancelled">
            We could not confirm it last time: {item.claimNote}
          </p>
        )}

        {!claiming ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setClaiming(true)}>
              <Check aria-hidden />
              Yes, this is mine
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void answer(false)}>
              <X aria-hidden />
              Not mine
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`claim-${item.id}`}>
              Tell us something only the owner would know
            </Label>
            <Textarea
              id={`claim-${item.id}`}
              rows={3}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="An engraving, a scratch, the wallpaper, what was inside"
              aria-describedby={`claim-hint-${item.id}`}
            />
            <p id={`claim-hint-${item.id}`} className="text-xs text-stone-600">
              A person checks this against the item before anything is sent — it is how we
              make sure it goes back to the right person.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || statement.trim().length < 10} onClick={() => void answer(true)}>
                Send
              </Button>
              <Button variant="ghost" onClick={() => setClaiming(false)}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ one case */

function CaseCard({ item, compact }: { item: GuestLostItem; compact?: boolean }) {
  const status = STATUS[item.status];

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-ink/[0.07]">
      <div className={cn("flex gap-4 p-4", !compact && "sm:p-5")}>
        <SignedPhoto
          path={item.photoPaths[0]}
          alt={item.title}
          className={cn("shrink-0 rounded-xl object-cover", compact ? "size-16" : "size-24")}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-gold-700">{item.reference}</p>
          <p className="font-display text-lg text-ink">{item.title}</p>
          <div className="mt-1.5">
            <StatusBadge label={status.label} tone={status.tone} />
          </div>
          {!item.isMineToAnswer && (
            <p className="mt-2 text-xs text-stone-600">
              Someone on your booking answers for this one.
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <div className="border-t border-ink/8 px-4 py-4 sm:px-5">
          {item.status === "claim_pending" && (
            <p className="text-sm text-stone-600">
              We are checking your description against the item. We will tell you as soon as
              it is confirmed.
            </p>
          )}

          {item.status === "claim_verified" && item.isMineToAnswer && <ReturnChooser item={item} />}

          {item.returnMethod === "courier" && item.status !== "claim_verified" && (
            <Shipment item={item} />
          )}

          {item.returnMethod === "pickup" && item.status !== "claim_verified" && (
            <p className="text-sm text-ink">
              {item.pickupAt
                ? `Ready at reception from ${formatDateTime(item.pickupAt)}. Please bring photo ID.`
                : "We will confirm a collection time shortly."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------- how it comes back */

function ReturnChooser({ item }: { item: GuestLostItem }) {
  const { chooseLostItemReturn } = useMockData();
  const [method, setMethod] = useState<"pickup" | "courier" | null>(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({
    pickupAt: "",
    collectedBy: "",
    recipientName: "",
    recipientPhone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    country: "India",
    postalCode: "",
    deliveryNotes: "",
  });
  const set = (key: keyof typeof fields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!method) return;
    setBusy(true);
    const { error } = await chooseLostItemReturn(item.id, {
      method,
      ...fields,
      pickupAt: fields.pickupAt ? new Date(fields.pickupAt).toISOString() : undefined,
    });
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(
      method === "courier" ? "Thank you — we will arrange the courier" : "Thank you — see you soon",
    );
  };

  return (
    <div className="space-y-4">
      <p className="font-medium text-ink">It is yours. How would you like it back?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["pickup", "Collect from Homes of Sanctuary", "Bring photo ID"],
            ["courier", "Send it to me", "We quote the shipping first"],
          ] as const
        ).map(([value, text, hint]) => (
          <button
            key={value}
            type="button"
            aria-pressed={method === value}
            onClick={() => setMethod(value)}
            className={cn(
              "rounded-xl p-4 text-left transition-colors",
              method === value ? "bg-ink text-sand" : "bg-sand-200/70 text-ink hover:bg-sand-300/70",
            )}
          >
            <span className="block font-medium">{text}</span>
            <span className="block text-xs opacity-70">{hint}</span>
          </button>
        ))}
      </div>

      {method === "pickup" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pickup-at" label="When would suit you">
            <Input id="pickup-at" type="datetime-local" value={fields.pickupAt} onChange={(e) => set("pickupAt", e.target.value)} />
          </Field>
          <Field id="collected-by" label="Who is collecting">
            <Input id="collected-by" value={fields.collectedBy} onChange={(e) => set("collectedBy", e.target.value)} placeholder="Yourself, or their name" />
          </Field>
        </div>
      )}

      {method === "courier" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="rcpt-name" label="Name">
            <Input id="rcpt-name" value={fields.recipientName} onChange={(e) => set("recipientName", e.target.value)} autoComplete="name" />
          </Field>
          <Field id="rcpt-phone" label="Phone">
            <Input id="rcpt-phone" type="tel" value={fields.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} autoComplete="tel" />
          </Field>
          <Field id="rcpt-line1" label="Address" className="sm:col-span-2">
            <Input id="rcpt-line1" value={fields.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} autoComplete="address-line1" />
          </Field>
          <Field id="rcpt-line2" label="Address line 2" className="sm:col-span-2">
            <Input id="rcpt-line2" value={fields.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} autoComplete="address-line2" />
          </Field>
          <Field id="rcpt-city" label="City">
            <Input id="rcpt-city" value={fields.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />
          </Field>
          <Field id="rcpt-state" label="State">
            <Input id="rcpt-state" value={fields.state} onChange={(e) => set("state", e.target.value)} autoComplete="address-level1" />
          </Field>
          <Field id="rcpt-postal" label="PIN / postal code">
            <Input id="rcpt-postal" value={fields.postalCode} onChange={(e) => set("postalCode", e.target.value)} autoComplete="postal-code" />
          </Field>
          <Field id="rcpt-country" label="Country">
            <Input id="rcpt-country" value={fields.country} onChange={(e) => set("country", e.target.value)} autoComplete="country-name" />
          </Field>
          <Field id="rcpt-notes" label="Delivery instructions" className="sm:col-span-2">
            <Input id="rcpt-notes" value={fields.deliveryNotes} onChange={(e) => set("deliveryNotes", e.target.value)} placeholder="Leave with the security desk" />
          </Field>
          <p className="text-xs text-stone-600 sm:col-span-2">
            We will tell you the shipping cost and how to pay it before anything is sent.
          </p>
        </div>
      )}

      {method && (
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? "Sending…" : "Confirm"}
        </Button>
      )}
    </div>
  );
}

function Shipment({ item }: { item: GuestLostItem }) {
  const courier = item.shippingStatus ? COURIER[item.shippingStatus] : null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="size-4 text-stone" aria-hidden />
        <Eyebrow className="text-gold-700">Return shipment</Eyebrow>
        {courier && <StatusBadge label={courier.label} tone={courier.tone} />}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {item.courierProvider && <Detail label="Courier">{item.courierProvider}</Detail>}
        {item.trackingNumber && (
          <Detail label="Tracking">
            <span className="font-mono">{item.trackingNumber}</span>
          </Detail>
        )}
        {item.expectedDelivery && <Detail label="Expected">{formatDate(item.expectedDelivery)}</Detail>}
        {item.deliveredAt && <Detail label="Delivered">{formatDateTime(item.deliveredAt)}</Detail>}
        {item.shippingCost != null && (
          <Detail label="Shipping">
            {money(item.shippingCost)}, paid by {item.paidBy === "property" ? "us" : "you"}
            {item.shippingPaymentStatus && ` · ${item.shippingPaymentStatus}`}
          </Detail>
        )}
        {item.recipientName && (
          <Detail label="To">
            {item.recipientName}
            {item.deliveryCity && `, ${item.deliveryCity}`}
          </Detail>
        )}
      </dl>
      {!item.trackingNumber && (
        <p className="text-xs text-stone-600">We will add the tracking number once it has shipped.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------- report a loss */

function ReportForm() {
  const { reportLostItem } = useMockData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LostItemCategory>("other");
  const [colour, setColour] = useState("");
  const [brand, setBrand] = useState("");
  const [where, setWhere] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState<"portal" | "phone" | "whatsapp" | "email">("portal");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Search aria-hidden />
        Report a lost item
      </Button>
    );
  }

  const submit = async () => {
    if (title.trim().length < 2) return toast.error("What did you lose?");
    setBusy(true);
    const { error } = await reportLostItem(
      {
        title: title.trim(),
        category,
        colour: colour.trim(),
        brand: brand.trim(),
        locationNote: where.trim(),
        description: description.trim(),
        contactPref: contact,
      },
      photo,
    );
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("Thank you — our team is looking");
    setOpen(false);
    setTitle("");
    setColour("");
    setBrand("");
    setWhere("");
    setDescription("");
    setPhoto(null);
  };

  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07]">
      <Eyebrow className="text-gold-700">Report a lost item</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="rep-title" label="What is it" className="sm:col-span-2">
          <Input id="rep-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Silver earring" />
        </Field>
        <Field id="rep-category" label="Kind">
          <Select value={category} onValueChange={(v) => setCategory(v as LostItemCategory)}>
            <SelectTrigger id="rep-category" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIES).map(([value, text]) => (
                <SelectItem key={value} value={value}>{text}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="rep-colour" label="Colour">
          <Input id="rep-colour" value={colour} onChange={(e) => setColour(e.target.value)} />
        </Field>
        <Field id="rep-brand" label="Brand">
          <Input id="rep-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field id="rep-where" label="Where you think you left it">
          <Input id="rep-where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Pool bathroom" />
        </Field>
        <Field id="rep-description" label="Anything else" className="sm:col-span-2">
          <Textarea id="rep-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field id="rep-contact" label="How should we reach you">
          <Select value={contact} onValueChange={(v) => setContact(v as typeof contact)}>
            <SelectTrigger id="rep-contact" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="portal">Here, in the portal</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="phone">Phone call</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">A photo, if you have one</span>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES.join(",")}
            className="sr-only"
            aria-label="Photo of the lost item"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" className="w-full" onClick={() => fileInput.current?.click()}>
            <Camera aria-hidden />
            {photo ? photo.name : "Add a photo"}
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? "Sending…" : "Send report"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/**
 * What they reported, and — as a number only — whether anything on our
 * shelves looks similar. Never the items themselves: a guest must not be able
 * to browse what other people left behind.
 */
function MyReports({ reports }: { reports: LostReport[] }) {
  const [matches, setMatches] = useState<Record<string, number>>({});
  const ids = reports.filter((r) => r.status === "open").map((r) => r.id).join(",");

  useEffect(() => {
    if (!ids) return;
    let live = true;
    void (async () => {
      const found: Record<string, number> = {};
      for (const id of ids.split(",")) {
        const { data } = await supabase.rpc("lost_report_possible_matches", { p_report_id: id });
        if (typeof data === "number") found[id] = data;
      }
      if (live) setMatches(found);
    })();
    return () => {
      live = false;
    };
  }, [ids]);

  return (
    <section className="space-y-3">
      <Eyebrow className="text-gold-700">What you reported</Eyebrow>
      <ul className="space-y-2">
        {reports.map((report) => (
          <li key={report.id} className="rounded-xl bg-white p-4 text-sm shadow-soft ring-1 ring-ink/[0.07]">
            <p className="font-medium text-ink">{report.title}</p>
            <p className="text-xs text-stone-600">
              {report.reference} · reported {formatDate(report.createdAt.slice(0, 10))}
            </p>
            <p className="mt-2 text-stone-600">
              {report.status === "matched"
                ? "We think we have found it — look above for a match."
                : matches[report.id]
                  ? "Our team has something that may match and will be in touch."
                  : "Our team is looking. We will tell you here as soon as we find anything."}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
