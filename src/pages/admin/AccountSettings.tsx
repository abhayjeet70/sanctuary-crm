import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Lock, LogOut, Mail, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow, PasswordInput } from "@/components/common";
import { supabase } from "@/services/supabase/client";
import { useDepartment, useEmployees, useMockData } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { titleCase } from "@/lib/status";
import { formatDate } from "@/lib/format";

/**
 * The signed-in person's own account.
 *
 * Everything here is about *you*, not the property — which is why it is a tab
 * of its own rather than mixed into Property, where the display name lived
 * until now and nobody could find it.
 */
export function AccountSettings() {
  const { session, signIn, updatePassword, resetPassword } = useSession();
  const { updateOwnName } = useMockData();
  const employees = useEmployees();
  const record = employees.find((e) => e.email === session?.email);
  const department = useDepartment(record?.departmentId ?? session?.departmentId);

  return (
    <div className="space-y-6">
      <IdentityCard
        session={session}
        record={record}
        departmentName={department?.name}
      />
      <NameCard current={session?.name ?? ""} onSave={updateOwnName} />
      <EmailCard current={session?.email ?? ""} />
      <PasswordCard
        email={session?.email}
        signIn={signIn}
        updatePassword={updatePassword}
        resetPassword={resetPassword}
      />
      <SessionsCard />
    </div>
  );
}

/* --------------------------------------------------------------- identity */

function IdentityCard({
  session,
  record,
  departmentName,
}: {
  session: ReturnType<typeof useSession>["session"];
  record?: { employeeCode: string; designation: string; dateOfJoining?: string };
  departmentName?: string;
}) {
  const facts = [
    { label: "Role", value: session?.role ? titleCase(session.role) : "—" },
    { label: "Department", value: departmentName ?? "None" },
    { label: "Designation", value: record?.designation || "—" },
    { label: "Employee code", value: record?.employeeCode ?? "—" },
    {
      label: "With the property since",
      value: record?.dateOfJoining ? formatDate(record.dateOfJoining) : "—",
    },
  ];

  return (
    <section className="rounded-xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xl text-gold-200 ring-1 ring-gold/35">
          {(session?.name ?? "?")
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="font-display text-2xl text-white">{session?.name}</p>
          <p className="text-sm text-sand/60">{session?.email}</p>
        </div>
      </div>

      <hr className="rule-gold my-5 opacity-60" />

      <dl className="grid gap-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="label-caps text-gold-400/75">{fact.label}</dt>
            <dd className="mt-1 text-sm text-sand">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-sand/50">
        Your role and department are set on the employee record, not here — they
        decide what you can reach, so they are not yours to change about yourself.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------- name */

function NameCard({ current, onSave }: { current: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(current);
  const changed = name.trim() !== current && name.trim().length >= 2;

  return (
    <Card
      icon={<User className="size-4" aria-hidden />}
      title="Your name"
      note="Shown in the sidebar, on activity you record, and beside decisions you make."
    >
      <div className="flex max-w-md flex-wrap gap-2">
        <Input
          id="account-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Anjali Rao"
          className="min-w-48 flex-1"
        />
        <Button
          disabled={!changed}
          onClick={() => {
            onSave(name.trim());
            toast.success("Name updated", {
              description: "It appears everywhere the moment the page reloads.",
            });
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ email */

function EmailCard({ current }: { current: string }) {
  const [email, setEmail] = useState(current);
  const [busy, setBusy] = useState(false);
  const changed = email.trim().toLowerCase() !== current.toLowerCase() && email.includes("@");

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
    setBusy(false);

    if (error) return toast.error("Could not change your address", { description: error.message });

    toast.success(`Confirm it from ${email.trim()}`, {
      description: "Your sign-in address changes only once you follow that link.",
    });
  };

  return (
    <Card
      icon={<Mail className="size-4" aria-hidden />}
      title="Sign-in address"
      note="Changing this changes how you sign in."
    >
      <div className="flex max-w-md flex-wrap gap-2">
        <Input
          id="account-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-w-48 flex-1"
        />
        <Button variant="outline" disabled={!changed || busy} onClick={() => void save()}>
          {busy ? "Sending…" : "Change"}
        </Button>
      </div>
      <p className="mt-3 rounded-lg bg-status-pending-bg p-3 text-xs leading-relaxed text-ink">
        A confirmation link goes to the new address and the change only takes effect
        when it is followed — so the old address keeps working until then. That link
        needs working email; if the property has none configured yet, this will appear
        to do nothing.
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------- password */

function PasswordCard({
  email,
  signIn,
  updatePassword,
  resetPassword,
}: {
  email?: string;
  signIn: ReturnType<typeof useSession>["signIn"];
  updatePassword: ReturnType<typeof useSession>["updatePassword"];
  resetPassword: ReturnType<typeof useSession>["resetPassword"];
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next.length < 8) return setError("Use at least 8 characters.");
    if (next !== confirm) return setError("The two new passwords do not match.");
    if (next === current) return setError("That is already your password.");
    if (!email) return setError("Could not read your sign-in address. Sign in again.");

    setBusy(true);
    // Supabase would let a signed-in client set a new password with no proof of
    // the old one, which makes an unattended open tab enough to take an account
    // over. So the current password is checked first.
    const { error: authError } = await signIn(email, current);
    if (authError) {
      setBusy(false);
      return setError("That is not your current password.");
    }

    const { error: updateError } = await updatePassword(next);
    setBusy(false);
    if (updateError) return setError(updateError);

    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password changed", { description: "Use it the next time you sign in." });
  };

  return (
    <Card
      icon={<KeyRound className="size-4" aria-hidden />}
      title="Password"
      note="Your current one is checked first, so an open tab is not enough to change it."
    >
      <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-4">
        {(
          [
            ["current-password", "Current password", current, setCurrent, "current-password"],
            ["next-password", "New password", next, setNext, "new-password"],
            ["confirm-password", "Confirm new password", confirm, setConfirm, "new-password"],
          ] as const
        ).map(([id, label, value, setValue, autoComplete]) => (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-gold-700">
                <Lock className="size-4" aria-hidden />
              </span>
              <PasswordInput
                id={id}
                autoComplete={autoComplete}
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="pl-9"
                placeholder={id === "next-password" ? "At least 8 characters" : undefined}
              />
            </div>
          </div>
        ))}

        {error && (
          <p role="alert" className="rounded-lg bg-status-cancelled-bg p-3 text-sm text-ink">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            <KeyRound aria-hidden />
            {busy ? "Changing…" : "Change password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !email}
            onClick={() => {
              void resetPassword(email!).then(({ error: resetError }) =>
                resetError
                  ? toast.error(resetError)
                  : toast.success("Reset link sent", { description: email }),
              );
            }}
          >
            Email me a reset link instead
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------- sessions */

function SessionsCard() {
  const [busy, setBusy] = useState(false);

  const signOutOthers = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setBusy(false);
    if (error) return toast.error("Could not do that", { description: error.message });
    toast.success("Signed out everywhere else", {
      description: "This device stays signed in.",
    });
  };

  return (
    <Card
      icon={<ShieldCheck className="size-4" aria-hidden />}
      title="Other devices"
      note="If you have signed in on a phone at the desk, or on a machine you no longer have."
    >
      <Button variant="outline" disabled={busy} onClick={() => void signOutOthers()}>
        <LogOut aria-hidden />
        {busy ? "Signing out…" : "Sign out everywhere else"}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------ shell */

function Card({
  icon,
  title,
  note,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex items-center gap-2 text-gold-700">
        {icon}
        <Eyebrow>{title}</Eyebrow>
      </div>
      {note && <p className="mt-2 text-sm text-stone-600">{note}</p>}
      <hr className="rule-gold my-4" />
      {children}
    </section>
  );
}
