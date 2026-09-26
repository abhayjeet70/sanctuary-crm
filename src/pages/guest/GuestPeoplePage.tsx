import { EmailInput } from "@/components/common/EmailInput";
import { emailProblem } from "@/lib/email";
import { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  MessageCircle,
  Plus,
  Share2,
  UserX,
  Users,
} from "lucide-react";
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
import { EmptyState, ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { useGuestStay } from "@/hooks/useGuest";
import { useFoodOrderViews, useMockData, useRequestViews } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { companionAccess, RELATIONSHIPS, ACCESS } from "@/lib/companions";
import { formatDateRange, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingCompanion, CompanionCredentials, CompanionRelationship } from "@/types";

/**
 * The people staying with you.
 *
 * The booking holder adds each person once and hands them a login. Everybody
 * then orders and asks for things as themselves, the kitchen knows whose
 * dinner it is, and the holder can see all of it.
 *
 * The password is shown exactly once, straight out of the database call that
 * made it. It is not stored anywhere readable, so there is no "show password"
 * later — losing it means issuing a new one.
 */
export default function GuestPeoplePage() {
  const { view } = useGuestStay();
  const { session } = useSession();
  const { companions, addCompanion, revokeCompanion, resetCompanionPassword } = useMockData();
  const orders = useFoodOrderViews();
  const requests = useRequestViews();

  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<(CompanionCredentials & { name: string }) | null>(null);
  const [revoking, setRevoking] = useState<BookingCompanion | null>(null);
  const [busy, setBusy] = useState(false);

  if (!view) return <ErrorState className="m-5" title="No stay found" />;
  const { booking, villa } = view;

  const people = companions.filter((c) => c.bookingId === booking.id);
  const listed = people.filter((c) => !c.revokedAt);
  // The holder is one of the adults the booking sold, so their own place is
  // never available to give away.
  const adultsLeft = Math.max(0, booking.adults - 1 - listed.filter((c) => !c.isChild).length);
  const childrenLeft = Math.max(0, booking.children - listed.filter((c) => c.isChild).length);
  const full = adultsLeft === 0 && childrenLeft === 0;

  // One tap, one login, no names. Whoever it is shared with signs in and adds
  // their own details in their portal, so the holder never types anybody in.
  const generateShared = async () => {
    setBusy(true);
    const first = session?.name?.split(" ")[0] || "the holder";
    const { credentials, error } = await addCompanion({
      bookingId: booking.id,
      fullName: `Guest of ${first}`,
      phone: "",
      email: "",
      relationship: "other",
      isChild: false,
    });
    setBusy(false);
    if (error || !credentials) {
      return toast.error("Could not create the login", { description: error ?? "" });
    }
    setIssued({ ...credentials, name: `Guest of ${first}` });
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    const { error } = await revokeCompanion(revoking.id);
    setBusy(false);
    if (error) return toast.error("Could not revoke access", { description: error });
    toast.success(`${revoking.fullName} can no longer sign in`);
    setRevoking(null);
  };

  const reissue = async (person: BookingCompanion) => {
    setBusy(true);
    const { credentials, error } = await resetCompanionPassword(person.id);
    setBusy(false);
    if (error || !credentials) {
      return toast.error("Could not issue a new password", { description: error ?? "" });
    }
    setIssued({ ...credentials, name: person.fullName });
  };

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">{villa?.name}</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">People with you</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Give everyone their own way in. They can order food and ask for things as
          themselves — and you will still see everything.
        </p>
      </header>

      {/* --------------------------------------------------------- the holder */}
      <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07]">
        <Eyebrow className="text-gold-700">Booking holder</Eyebrow>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={session?.name ?? "You"} tone="holder" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{session?.name}</p>
            <p className="text-xs text-stone-600">
              {booking.reference} · {formatDateRange(booking.checkIn, booking.checkOut)}
            </p>
          </div>
          <StatusBadge label="You" tone="confirmed" />
        </div>
      </section>

      {/* ------------------------------------------------- shared login */}
      <section className="rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
        <Eyebrow className="text-gold-400">Share one login</Eyebrow>
        <p className="mt-2 font-display text-xl text-white">
          Nobody to type in — just send them a Guest ID and password
        </p>
        <p className="mt-2 max-w-xl text-sm text-sand/75">
          Generate a login and share it with anyone staying with you. They sign in and add
          their own name in their portal, then order food and ask for things as themselves.
        </p>
        <Button
          className="mt-4 bg-gold/20 text-gold-200 ring-1 ring-gold/40 hover:bg-gold/30 hover:text-white"
          disabled={full || busy}
          onClick={() => void generateShared()}
        >
          <KeyRound aria-hidden />
          {listed.length > 0 ? "Generate another login" : "Generate shared login"}
        </Button>
        {full && (
          <p className="mt-2 text-xs text-sand/60">
            Everyone the booking was sold for already has a place.
          </p>
        )}
      </section>

      {/* --------------------------------------------------------- everyone */}
      <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow className="text-gold-700">Staying with you</Eyebrow>
          <p className="text-xs text-stone-600">
            {full
              ? "Everyone on the booking is listed"
              : `Room for ${[
                  adultsLeft && `${adultsLeft} ${adultsLeft === 1 ? "adult" : "adults"}`,
                  childrenLeft && `${childrenLeft} ${childrenLeft === 1 ? "child" : "children"}`,
                ]
                  .filter(Boolean)
                  .join(" and ")} more`}
          </p>
        </div>

        {people.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Users className="size-5" />}
            title="Nobody added yet"
            description="Add the people travelling with you and each gets their own login."
          />
        ) : (
          <ul className="mt-4 divide-y divide-ink/8">
            {people.map((person) => {
              const access = companionAccess(person, booking);
              const state = ACCESS[access];
              const theirOrders = orders.filter((o) => o.order.companionId === person.id);
              const theirRequests = requests.filter((r) => r.request.companionId === person.id);

              return (
                <li key={person.id} className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={person.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{person.fullName}</p>
                      <p className="text-xs text-stone-600">
                        {RELATIONSHIPS[person.relationship]}
                        {person.isChild && " · child"} · {person.guestCode}
                      </p>
                    </div>
                    <StatusBadge label={state.label} tone={state.tone} />
                  </div>

                  {/* What they have done — the holder sees all of it. */}
                  {(theirOrders.length > 0 || theirRequests.length > 0) && (
                    <ul className="mt-3 space-y-1 pl-12 text-xs text-stone-600">
                      {theirOrders.slice(0, 3).map(({ order }) => (
                        <li key={order.id}>
                          Ordered {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}{" "}
                          · {formatTime(order.placedAt)}
                        </li>
                      ))}
                      {theirRequests.slice(0, 3).map(({ request }) => (
                        <li key={request.id}>
                          Asked for: {request.description} · {formatTime(request.createdAt)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {access === "active" && (
                    <div className="mt-3 flex flex-wrap gap-2 pl-12">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void reissue(person)}
                      >
                        <KeyRound aria-hidden />
                        New password
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevoking(person)}
                      >
                        <UserX aria-hidden />
                        Revoke
                      </Button>
                    </div>
                  )}
                  {access === "revoked" && (
                    <div className="mt-3 pl-12">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void reissue(person)}
                      >
                        Let them back in
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Button
          variant="outline"
          className="mt-4 w-full sm:w-auto"
          disabled={full}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden />
          Add a named guest instead
        </Button>
      </section>

      <AddGuestDialog
        open={adding}
        onClose={() => setAdding(false)}
        adultsLeft={adultsLeft}
        childrenLeft={childrenLeft}
        onAdd={async (input) => {
          const { credentials, error } = await addCompanion({ bookingId: booking.id, ...input });
          if (error || !credentials) return error ?? "Could not add them";
          setAdding(false);
          setIssued({ ...credentials, name: input.fullName });
          return null;
        }}
      />

      <CredentialsDialog issued={issued} villaName={villa?.name} onClose={() => setIssued(null)} />

      {/* ------------------------------------------------------- revoke */}
      <Dialog open={Boolean(revoking)} onOpenChange={(open: boolean) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.fullName}?</DialogTitle>
            <DialogDescription>
              They are signed out and cannot sign back in. What they ordered and asked for
              stays on the booking — you can let them back in later with a new password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Keep access
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void revoke()}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Avatar({ name, tone = "plain" }: { name: string; tone?: "plain" | "holder" }) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        tone === "holder" ? "bg-ink text-gold-200" : "bg-sand-200 text-stone-600",
      )}
    >
      {letters}
    </span>
  );
}

function AddGuestDialog({
  open,
  onClose,
  onAdd,
  adultsLeft,
  childrenLeft,
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
  adultsLeft: number;
  childrenLeft: number;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<CompanionRelationship>("family");
  const [isChild, setIsChild] = useState(adultsLeft === 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (name.trim().length < 2) return setError("Their name, please.");
    const emailIssue = emailProblem(email, { required: false });
    if (emailIssue) return setError(emailIssue);
    setSaving(true);
    const failure = await onAdd({
      fullName: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      relationship,
      isChild,
    });
    setSaving(false);
    if (failure) return setError(failure);
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a guest</DialogTitle>
          <DialogDescription>
            Only a name is needed. They get a Guest ID and a password to sign in with.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="companion-name">Full name</Label>
            <Input
              id="companion-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rahul Sharma"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="companion-phone">Phone (optional)</Label>
              <Input
                id="companion-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98450 00000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companion-email">Email (optional)</Label>
              <EmailInput id="companion-email" required={false} showError={tried} value={email} onChange={setEmail} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="companion-relationship">They are your</Label>
              <Select
                value={relationship}
                onValueChange={(value) => {
                  setRelationship(value as CompanionRelationship);
                  if (value === "child") setIsChild(true);
                }}
              >
                <SelectTrigger id="companion-relationship" className="w-full">
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

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Counts as</legend>
              <div className="flex gap-2">
                {[
                  { value: false, text: "Adult", left: adultsLeft },
                  { value: true, text: "Child", left: childrenLeft },
                ].map((option) => (
                  <button
                    key={option.text}
                    type="button"
                    aria-pressed={isChild === option.value}
                    disabled={option.left === 0}
                    onClick={() => setIsChild(option.value)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40",
                      isChild === option.value
                        ? "bg-ink text-sand"
                        : "bg-sand-200 text-stone-600 hover:bg-sand-300",
                    )}
                  >
                    {option.text}
                    <span className="block text-[0.6875rem] opacity-70">{option.left} left</span>
                  </button>
                ))}
              </div>
            </fieldset>
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
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add and create login"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one moment the password exists in readable form.
 *
 * Copy and WhatsApp both carry the sign-in address, so the person receiving it
 * does not have to be told where to go.
 */
function CredentialsDialog({
  issued,
  villaName,
  onClose,
}: {
  issued: (CompanionCredentials & { name: string }) | null;
  villaName?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!issued) return null;

  const signIn = `${window.location.origin}/login`;
  const message =
    `Hello ${issued.name.split(" ")[0]} — you are on our stay at ${villaName ?? "Homes of Sanctuary"}.\n\n` +
    `Sign in to order food and ask for anything you need:\n${signIn}\n\n` +
    `Guest ID: ${issued.guestCode}\nPassword: ${issued.temporaryPassword}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the details are on screen");
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
      } catch {
        // They closed the share sheet; nothing to report.
      }
    } else {
      void copy();
    }
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issued.name} can sign in</DialogTitle>
          <DialogDescription>
            Send these now. The password is shown only this once — we do not keep a copy
            anyone can read.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 rounded-xl bg-sand-200/70 p-4">
          <div>
            <dt className="label-caps">Guest ID</dt>
            <dd className="mt-1 font-mono text-lg tracking-wide text-ink">{issued.guestCode}</dd>
          </div>
          <div>
            <dt className="label-caps">Password</dt>
            <dd className="mt-1 font-mono text-lg tracking-wide text-ink">
              {issued.temporaryPassword}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void copy()} variant="outline">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy login details"}
          </Button>
          <Button asChild variant="outline">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
          </Button>
          <Button variant="ghost" onClick={() => void share()}>
            <Share2 aria-hidden />
            Share
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
