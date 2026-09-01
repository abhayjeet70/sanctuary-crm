import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eyebrow, PasswordInput } from "@/components/common";
import { useSession } from "@/services/session";

/**
 * Change your own password.
 *
 * Supabase would let a signed-in client set a new password with no proof of the
 * old one, which makes an unattended open tab enough to take an account over.
 * So the current password is checked first, by signing in with it — a failure
 * there stops the change.
 */
export function ChangePassword() {
  const { session, signIn, updatePassword, resetPassword } = useSession();

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
    if (!session?.email) return setError("Could not read your sign-in address. Sign in again.");

    setBusy(true);
    const { error: authError } = await signIn(session.email, current);
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
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <Eyebrow className="text-gold-700">Your account</Eyebrow>
      <h2 className="mt-2 text-xl text-ink">Change your password</h2>
      <p className="mt-1.5 text-sm text-stone-600">
        Signed in as {session?.email ?? session?.name}.
      </p>
      <hr className="rule-gold my-4" />

      <form onSubmit={(event) => void submit(event)} className="max-w-sm space-y-4">
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
            disabled={busy || !session?.email}
            onClick={() => {
              void resetPassword(session!.email!).then(({ error: resetError }) =>
                resetError
                  ? toast.error(resetError)
                  : toast.success("Reset link sent", { description: session!.email! }),
              );
            }}
          >
            Email me a reset link instead
          </Button>
        </div>
      </form>
    </section>
  );
}
