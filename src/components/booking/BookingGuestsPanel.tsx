import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, KeyRound, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eyebrow, StatusBadge } from "@/components/common";
import { useFeedbackViews, useFoodOrderViews, useMockData, useRequestViews } from "@/hooks/useData";
import { ACCESS, RELATIONSHIPS, companionAccess } from "@/lib/companions";
import { foodOrderStatus, requestStatus } from "@/lib/status";
import { formatDateTime, initials, money } from "@/lib/format";
import { orderTotal } from "@/services/domain";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";
import type { CompanionCredentials, CompanionRelationship } from "@/types";

/**
 * Who belongs to this booking.
 *
 * The holder first, then everybody they brought, each with whether they can
 * still sign in. Opening a companion answers the three questions the desk
 * actually asks: who ordered this, who raised this, who wrote this.
 */
export function BookingGuestsPanel({ view }: { view: BookingView }) {
  const { booking, customer } = view;
  const { companions, addCompanion, revokeCompanion, resetCompanionPassword } = useMockData();
  const orders = useFoodOrderViews();
  const requests = useRequestViews();
  const feedback = useFeedbackViews();

  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<(CompanionCredentials & { name: string }) | null>(null);

  const people = companions.filter((c) => c.bookingId === booking.id);

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow className="text-gold-700">Guests</Eyebrow>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <UserPlus aria-hidden />
          Add a guest
        </Button>
      </div>

      {/* ------------------------------------------------------ the holder */}
      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-gold-200"
        >
          {initials(customer?.name ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{customer?.name}</p>
          <p className="text-xs text-stone-600">
            {customer?.phone}
            {customer?.email && ` · ${customer.email}`}
          </p>
        </div>
        <StatusBadge label="Booking holder" tone="confirmed" />
      </div>

      {/* ------------------------------------------------ everybody else */}
      {people.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">
          Nobody else is listed. The holder can add the people travelling with them from
          their portal, or you can add them here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/8 border-t border-ink/8">
          {people.map((person) => {
            const access = companionAccess(person, booking);
            const state = ACCESS[access];
            const theirOrders = orders.filter((o) => o.order.companionId === person.id);
            const theirRequests = requests.filter((r) => r.request.companionId === person.id);
            const theirFeedback = feedback.filter((f) => f.entry.companionId === person.id);
            const expanded = open === person.id;

            return (
              <li key={person.id} className="py-3">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : person.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand-200 text-xs font-semibold text-stone-600"
                  >
                    {initials(person.fullName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{person.fullName}</span>
                    <span className="block text-xs text-stone-600">
                      {RELATIONSHIPS[person.relationship]}
                      {person.isChild && " · child"} · {person.guestCode}
                      {(theirOrders.length > 0 || theirRequests.length > 0) &&
                        ` · ${theirOrders.length} orders, ${theirRequests.length} requests`}
                    </span>
                  </span>
                  <StatusBadge label={state.label} tone={state.tone} />
                  <ChevronDown
                    aria-hidden
                    className={cn("size-4 text-stone transition-transform", expanded && "rotate-180")}
                  />
                </button>

                {expanded && (
                  <div className="mt-3 space-y-4 rounded-lg bg-sand-200/50 p-4 text-sm">
                    <dl className="grid gap-3 sm:grid-cols-3">
                      <Fact label="Phone">{person.phone || "—"}</Fact>
                      <Fact label="Email">{person.email || "—"}</Fact>
                      <Fact label="Added">{formatDateTime(person.createdAt)}</Fact>
                      {person.revokedAt && (
                        <Fact label="Revoked">{formatDateTime(person.revokedAt)}</Fact>
                      )}
                    </dl>

                    <Activity title="Food orders" empty="Has not ordered">
                      {theirOrders.map(({ order }) => {
                        const s = foodOrderStatus.get(order.status);
                        return (
                          <li key={order.id} className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1">
                              {order.reference} ·{" "}
                              {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                            </span>
                            <span className="tabular-nums">{money(orderTotal(order.lines))}</span>
                            <StatusBadge label={s.label} tone={s.tone} />
                          </li>
                        );
                      })}
                    </Activity>

                    <Activity title="Requests" empty="Has not asked for anything">
                      {theirRequests.map(({ request }) => {
                        const s = requestStatus.get(request.status);
                        return (
                          <li key={request.id} className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1">{request.description}</span>
                            <StatusBadge label={s.label} tone={s.tone} />
                          </li>
                        );
                      })}
                    </Activity>

                    <Activity title="Feedback" empty="Has not left feedback">
                      {theirFeedback.map(({ entry }) => (
                        <li key={entry.id}>
                          {entry.rating}★ {entry.comment && `— ${entry.comment}`}
                        </li>
                      ))}
                    </Activity>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const { credentials, error } = await resetCompanionPassword(person.id);
                          if (error || !credentials) {
                            return toast.error("Could not issue a password", {
                              description: error ?? "",
                            });
                          }
                          setIssued({ ...credentials, name: person.fullName });
                        }}
                      >
                        <KeyRound aria-hidden />
                        {access === "revoked" ? "Restore with a new password" : "New password"}
                      </Button>
                      {access === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const { error } = await revokeCompanion(person.id);
                            if (error) return toast.error("Could not revoke", { description: error });
                            toast.success(`${person.fullName} can no longer sign in`);
                          }}
                        >
                          <UserX aria-hidden />
                          Revoke access
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AdminAddGuest
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={async (input) => {
          const { credentials, error } = await addCompanion({ bookingId: booking.id, ...input });
          if (error || !credentials) return error ?? "Could not add them";
          setAdding(false);
          setIssued({ ...credentials, name: input.fullName });
          return null;
        }}
      />

      <Dialog open={Boolean(issued)} onOpenChange={(o: boolean) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{issued?.name} can sign in</DialogTitle>
            <DialogDescription>
              Pass these on now. The password is not kept anywhere readable, so it cannot
              be shown again.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-3 rounded-xl bg-sand-200/70 p-4 font-mono">
            <div>
              <dt className="label-caps font-sans">Guest ID</dt>
              <dd className="mt-1 text-lg text-ink">{issued?.guestCode}</dd>
            </div>
            <div>
              <dt className="label-caps font-sans">Password</dt>
              <dd className="mt-1 text-lg text-ink">{issued?.temporaryPassword}</dd>
            </div>
          </dl>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function Activity({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div>
      <p className="label-caps mb-1.5">{title}</p>
      {children.length === 0 ? (
        <p className="text-stone-600">{empty}</p>
      ) : (
        <ul className="space-y-1.5 text-ink">{children}</ul>
      )}
    </div>
  );
}

function AdminAddGuest({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (input: {
    fullName: string;
    phone: string;
    email: string;
    relationship: CompanionRelationship;
    isChild: boolean;
  }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState<CompanionRelationship>("family");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a guest to this booking</DialogTitle>
          <DialogDescription>
            Counted against the adults and children the booking was sold for.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (name.trim().length < 2) return setError("Their name, please.");
            const failure = await onAdd({
              fullName: name.trim(),
              phone: phone.trim(),
              email: "",
              relationship,
              isChild: relationship === "child",
            });
            if (failure) return setError(failure);
            setName("");
            setPhone("");
            setError(null);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="admin-companion-name">Full name</Label>
            <Input
              id="admin-companion-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-companion-phone">Phone</Label>
              <Input
                id="admin-companion-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-companion-relationship">Relationship</Label>
              <Select
                value={relationship}
                onValueChange={(v) => setRelationship(v as CompanionRelationship)}
              >
                <SelectTrigger id="admin-companion-relationship" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RELATIONSHIPS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-status-cancelled">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add and create login</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

