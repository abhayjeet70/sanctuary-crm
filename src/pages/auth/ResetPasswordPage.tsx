import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Logo, PasswordInput } from "@/components/common";
import { photo } from "@/lib/assets";
import { useSession } from "@/services/session";

/**
 * Where the emailed recovery link lands.
 *
 * The link carries a one-time session, which the Supabase client picks up from
 * the URL before this renders — so setting the password needs no old password.
 * If the link has expired there is no session and Supabase refuses the update,
 * which is what the error line says.
 */
export default function ResetPasswordPage() {
  const { updatePassword, session } = useSession();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");

    setBusy(true);
    const { error: updateError } = await updatePassword(password);
    setBusy(false);
    if (updateError) {
      return setError(
        `${updateError}. If the link has expired, ask for a new one from the sign-in page.`,
      );
    }
    navigate(session?.role === "admin" ? "/admin" : "/guest", { replace: true });
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink px-6 text-sand">
      <img
        src={photo.hills}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full scale-105 object-cover opacity-40"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink/88 via-ink/70 to-ink/96" />

      <form
        onSubmit={(event) => void submit(event)}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-ink/45 p-6 ring-1 ring-gold/40 backdrop-blur-md"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
        />
        <Logo variant="onDark" size="h-14" />
        <p className="mt-5 font-display text-2xl text-white">
          {session ? `Welcome, ${session.name}` : "Choose a new password"}
        </p>
        {session && (
          <p className="mt-1.5 text-sm leading-relaxed text-sand/70">
            You are signed in. Choose a password so you can get back in without a link.
          </p>
        )}

        <div className="mt-5 space-y-4">
          {(
            [
              ["new-password", "New password", password, setPassword, "At least 8 characters"],
              ["confirm-password", "Confirm password", confirm, setConfirm, "Type it again"],
            ] as const
          ).map(([id, label, value, setValue, placeholder]) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id} className="text-sand/70">
                {label}
              </Label>
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-gold-400">
                  <Lock className="size-4" aria-hidden />
                </span>
                <PasswordInput
                  dark
                  id={id}
                  autoComplete="new-password"
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="border-0 bg-white/10 pl-9 text-sand placeholder:text-sand/40"
                  placeholder={placeholder}
                />
              </div>
            </div>
          ))}

          {error && (
            <p role="alert" className="rounded-lg bg-status-cancelled/25 p-3 text-sm text-white">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
            <ArrowRight aria-hidden />
          </Button>

          {session ? (
            <Link
              to={session.role === "admin" ? "/admin" : session.role === "staff" ? "/staff" : "/guest"}
              className="block text-center text-xs text-sand/60 underline underline-offset-4 hover:text-sand"
            >
              Skip for now
            </Link>
          ) : (
            <Link
              to="/login"
              className="block text-center text-xs text-sand/60 underline underline-offset-4 hover:text-sand"
            >
              Back to sign in
            </Link>
          )}
        </div>
      </form>
    </main>
  );
}
