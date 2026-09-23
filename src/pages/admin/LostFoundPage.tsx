import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  ClipboardCheck,
  PackageSearch,
  Search,
  ShieldAlert,
  Truck,
  UserSearch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  PageHeader,
  SignedPhoto,
  StatCard,
  StatusBadge,
} from "@/components/common";
import { LogFoundItemDialog } from "@/components/lostfound/LogFoundItemDialog";
import { LostItemSheet } from "@/components/lostfound/LostItemSheet";
import { useMockData, useVillas } from "@/hooks/useData";
import {
  CATEGORIES,
  COURIER,
  LANES,
  LOCATIONS,
  SENSITIVITY,
  STATUS,
  isDueSoon,
  isOpen,
  isOverdue,
  type LaneKey,
} from "@/lib/lostFound";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LostItem } from "@/types";

const ALL = "all";

/**
 * Lost & Found.
 *
 * Laid out as the desk works it: a lane per question — what came in, who we
 * are waiting on, what needs verifying, what is on its way back — with the
 * photograph leading every card, because the photograph is how anyone finds
 * anything on a shelf.
 *
 * Every figure here counts real rows. There is no "recovery rate" because
 * nothing records what was lost and never found.
 */
export default function LostFoundPage() {
  const villas = useVillas();
  const { lostItems, lostClaims, lostReturns, lostReports, customers, companions, today } =
    useMockData();

  const [lane, setLane] = useState<LaneKey>("found");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [villa, setVilla] = useState(ALL);
  const [since, setSince] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  /* ------------------------------------------------------------- counts */
  const counts = {
    open: lostItems.filter(isOpen).length,
    toContact: lostItems.filter((i) => i.status === "guest_identified").length,
    toIdentify: lostItems.filter((i) => ["found", "under_review"].includes(i.status)).length,
    claims: lostClaims.filter((c) => c.status === "pending").length,
    awaiting: lostItems.filter((i) => i.status === "guest_contacted").length,
    returns: lostItems.filter((i) =>
      ["claim_verified", "return_method_selected", "return_arranged", "ready_for_pickup"].includes(i.status),
    ).length,
    inTransit: lostItems.filter((i) => i.status === "in_transit").length,
    returned: lostItems.filter((i) => i.status === "returned" || i.disposition === "returned").length,
    overdue: lostItems.filter((i) => isOverdue(i, today)).length,
    dueSoon: lostItems.filter((i) => isDueSoon(i, today)).length,
  };

  /* ----------------------------------------------------------- filtering */
  const shown = useMemo(() => {
    const statuses = LANES.find((l) => l.key === lane)?.statuses ?? [];
    const needle = query.trim().toLowerCase();

    return lostItems
      .filter((item) => (statuses as readonly string[]).includes(item.status))
      .filter((item) => category === ALL || item.category === category)
      .filter((item) => villa === ALL || item.villaId === villa)
      .filter((item) => !since || item.foundAt.slice(0, 10) >= since)
      .filter((item) => {
        if (!needle) return true;
        const owner = customers.find((c) => c.id === item.customerId)?.name ?? "";
        const companion = companions.find((c) => c.id === item.companionId)?.fullName ?? "";
        const back = lostReturns.find((r) => r.itemId === item.id);
        return [
          item.reference,
          item.title,
          item.brand,
          item.colour,
          item.description,
          item.storageLocation,
          item.storageRef,
          owner,
          companion,
          back?.trackingNumber ?? "",
        ].some((field) => field.toLowerCase().includes(needle));
      });
  }, [lostItems, lane, category, villa, since, query, customers, companions, lostReturns]);

  const openItem = lostItems.find((i) => i.id === openId) ?? null;
  const openReports = lostReports.filter((r) => r.status === "open");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="From the shelf to the guest's door"
        title="Lost & Found"
        description="Everything found on the property, who it may belong to, and how it gets back to them."
        actions={<LogFoundItemDialog onLogged={(id) => setOpenId(id)} />}
      />

      {/* ------------------------------------------------------ the figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Open items" value={counts.open} icon={<PackageSearch className="size-4" />} />
        <StatCard
          label="Guests to contact"
          value={counts.toContact}
          hint={`${counts.toIdentify} still to identify`}
          icon={<UserSearch className="size-4" />}
          tone={counts.toContact ? "warn" : "default"}
        />
        <StatCard
          label="Claims waiting"
          value={counts.claims}
          icon={<ClipboardCheck className="size-4" />}
          tone={counts.claims ? "warn" : "default"}
        />
        <StatCard
          label="Returns pending"
          value={counts.returns}
          hint={`${counts.awaiting} awaiting an answer`}
          icon={<BellRing className="size-4" />}
        />
        <StatCard label="In transit" value={counts.inTransit} icon={<Truck className="size-4" />} />
        <StatCard
          label="Past retention"
          value={counts.overdue}
          hint={counts.dueSoon ? `${counts.dueSoon} due this week` : "Property policy"}
          icon={<AlertTriangle className="size-4" />}
          tone={counts.overdue ? "warn" : "default"}
        />
      </div>

      {/* ------------------------------------------------------- the lanes */}
      <div role="tablist" aria-label="Lost and found lanes" className="flex flex-wrap gap-2">
        {LANES.map((option) => {
          const count = lostItems.filter((i) =>
            (option.statuses as readonly string[]).includes(i.status),
          ).length;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={lane === option.key}
              onClick={() => setLane(option.key)}
              className={cn(
                "rounded-lg px-3.5 py-2 text-left text-sm transition-colors",
                lane === option.key
                  ? "bg-ink text-sand"
                  : "bg-white text-stone-600 ring-1 ring-ink/[0.08] hover:text-ink",
              )}
            >
              <span className="font-medium">{option.label}</span>
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
              <span className="block text-[0.6875rem] opacity-70">{option.hint}</span>
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------------- the filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="lf-search">Search</Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" aria-hidden />
            <Input
              id="lf-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Item, guest, shelf, tracking number"
              className="pl-9"
            />
          </div>
        </div>
        <FilterSelect id="lf-filter-category" label="Kind" value={category} onChange={setCategory}
          options={[[ALL, "All kinds"], ...Object.entries(CATEGORIES)]} />
        <FilterSelect id="lf-filter-villa" label="Villa" value={villa} onChange={setVilla}
          options={[[ALL, "All villas"], ...villas.map((v) => [v.id, v.name] as [string, string])]} />
        <div className="w-40 space-y-1.5">
          <Label htmlFor="lf-since">Found since</Label>
          <Input id="lf-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
      </div>

      {/* ------------------------------------------------------- the cards */}
      {shown.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-5" />}
          title="Nothing here"
          description={
            lostItems.length === 0
              ? "Nothing has been logged yet. When housekeeping finds something, it lands in Found."
              : "No item in this lane matches the filters."
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} today={today} onOpen={() => setOpenId(item.id)} />
          ))}
        </ul>
      )}

      {/* ------------------------------------------------ what guests said */}
      {openReports.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
          <h2 className="text-xl text-ink">Reported by guests</h2>
          <p className="mt-1 text-sm text-stone-600">
            Things guests say they left behind. Open a found item to link one to it.
          </p>
          <ul className="mt-4 divide-y divide-ink/8">
            {openReports.map((report) => {
              const reporter =
                companions.find((c) => c.id === report.companionId)?.fullName ??
                customers.find((c) => c.id === report.customerId)?.name ??
                "Guest";
              return (
                <li key={report.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{report.title}</span>
                    <span className="block text-xs text-stone-600">
                      {report.reference} · {reporter} · {CATEGORIES[report.category]}
                      {report.colour && ` · ${report.colour}`}
                      {report.locationNote && ` · “${report.locationNote}”`}
                    </span>
                  </span>
                  <span className="text-xs text-stone-600">
                    prefers {report.contactPref} · {relativeTime(report.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <LostItemSheet item={openItem} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* --------------------------------------------------------------- card */

function ItemCard({ item, today, onOpen }: { item: LostItem; today: string; onOpen: () => void }) {
  const villas = useVillas();
  const { customers, companions, bookings, lostReturns } = useMockData();

  const villa = villas.find((v) => v.id === item.villaId);
  const room = villa?.rooms.find((r) => r.id === item.roomId);
  const owner = customers.find((c) => c.id === item.customerId);
  const companion = companions.find((c) => c.id === item.companionId);
  const booking = bookings.find((b) => b.id === item.bookingId);
  const back = lostReturns.find((r) => r.itemId === item.id);
  const status = STATUS[item.status];
  const overdue = isOverdue(item, today);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex h-full w-full flex-col overflow-hidden rounded-xl bg-white text-left shadow-soft ring-1 ring-ink/[0.06] transition-all hover:shadow-lift hover:ring-gold/35"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <SignedPhoto
            path={item.photoPaths[0]}
            alt={item.title}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <StatusBadge label={status.label} tone={status.tone} />
            {item.sensitivity !== "normal" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-cancelled px-2 py-1 text-[0.6875rem] font-medium text-white">
                <ShieldAlert className="size-3" aria-hidden />
                {SENSITIVITY[item.sensitivity].label}
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="font-mono text-xs text-gold-700">{item.reference}</p>
          <h3 className="mt-0.5 font-display text-lg text-ink">{item.title}</h3>

          <dl className="mt-3 space-y-1.5 text-xs">
            <Row label="Found">
              {[villa?.name, room?.name ?? LOCATIONS[item.location]].filter(Boolean).join(" — ")}
              <span className="block text-stone-600">{formatDateTime(item.foundAt)}</span>
            </Row>
            {item.foundByName && <Row label="By">{item.foundByName}</Row>}
            {owner && (
              <Row label="Possible guest">
                {companion?.fullName ?? owner.name}
                {booking && <span className="text-stone-600"> · {booking.reference}</span>}
              </Row>
            )}
            <Row label="Kept in">
              {item.storageLocation || "—"}
              {item.storageRef && ` ${item.storageRef}`}
            </Row>
            {back?.shippingStatus && (
              <Row label="Courier">
                {COURIER[back.shippingStatus].label}
                {back.trackingNumber && <span className="text-stone-600"> · {back.trackingNumber}</span>}
              </Row>
            )}
          </dl>

          {overdue && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-status-cancelled">
              <AlertTriangle className="size-3.5" aria-hidden />
              Past its retention date, {formatDate(item.retentionUntil!)}
            </p>
          )}

          <span className="mt-auto pt-4 text-sm font-medium text-clay-600">
            {nextStep(item.status)} →
          </span>
        </div>
      </button>
    </li>
  );
}

/** What the desk does next, in words, so the card says what to do rather
 *  than only what state it is in. */
function nextStep(status: LostItem["status"]): string {
  switch (status) {
    case "found":
    case "under_review":
      return "Find the guest";
    case "guest_identified":
      return "Tell the guest";
    case "guest_contacted":
      return "Waiting on them";
    case "claim_pending":
      return "Verify the claim";
    case "claim_rejected":
      return "Follow up";
    case "claim_verified":
      return "Waiting for their choice";
    case "return_method_selected":
      return "Arrange the return";
    case "return_arranged":
      return "Ship or set a time";
    case "ready_for_pickup":
      return "Release at the desk";
    case "in_transit":
      return "Track the shipment";
    case "unclaimed":
      return "Decide what happens";
    default:
      return "View";
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-stone-600">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="w-44 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
