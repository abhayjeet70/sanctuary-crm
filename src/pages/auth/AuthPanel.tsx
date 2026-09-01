import { useState } from "react";
import { ArrowRight, Lock, Mail, MailCheck, User } from "lucide-react";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/services/session";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "reset";

/**
 * Sign in, or create a guest account.
 *
 * Only guests can self-register. Staff and admin accounts are created by the
 * property — the signup path forces `guest` in the database, so a `role` sent
 * from here is ignored rather than trusted.
 */
export function AuthPanel() {
  const { signIn, signUp, resetPassword } = useSession();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isReset) {
      setBusy(true);
      const { error: resetError } = await resetPassword(email);
      setBusy(false);
      if (resetError) return setError(resetError);
      // Deliberately confirmed whether or not the address has an account —
      // saying "no such account" would let anyone test who stays here.
      setSentTo(email.trim());
      return;
    }

    if (isSignup) {
      if (name.trim().length < 2) return setError("Please enter your name.");
      // Supabase enforces 6; asking for 8 is cheap and meaningfully better.
      if (password.length < 8) return setError("Use at least 8 characters for your password.");
    }

    setBusy(true);
    if (isSignup) {
      const { error: signUpError, needsConfirmation } = await signUp(email, password, name);
      setBusy(false);
      if (signUpError) return setError(signUpError);
      if (needsConfirmation) setSentTo(email.trim());
      return;
    }

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setBusy(false);
    }
    // On success the session arrives and LoginPage redirects.
  };

  if (sentTo) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-ink/45 p-6 ring-1 ring-gold/40 backdrop-blur-md">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
        />
        <div className="relative" role="status" aria-live="polite">
          <span className="flex size-11 items-center justify-center rounded-full bg-gold/15 text-gold-200 ring-1 ring-gold/35">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <p className="mt-4 font-display text-2xl text-white">Check your email</p>
          <p className="mt-2 text-sm leading-relaxed text-sand/75">
            We have sent {isReset ? "a password reset link" : "a confirmation link"} to{" "}
            <span className="text-gold-200">{sentTo}</span>.{" "}
            {isReset ? "Follow it to choose a new password." : "Follow it and then sign in."}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-sand/50">
            {isReset
              ? "If no account uses that address, no mail is sent — we do not confirm who has an account."
              : "Confirming proves the address is yours. It matters here: your account is matched to an existing booking by email, so an unconfirmed address would be a way into someone else's stay."}
          </p>
          <Button
            variant="ghost"
            className="mt-5 w-full text-gold-200 hover:bg-gold/15 hover:text-white"
            onClick={() => {
              setSentTo(null);
              switchTo("signin");
            }}
          >
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="relative overflow-hidden rounded-2xl bg-ink/45 p-6 ring-1 ring-gold/40 backdrop-blur-md"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
      />
      <div className="relative">
        {/* Mode switch */}
        <div
          role="tablist"
          aria-label="Sign in or create an account"
          className="flex gap-1 rounded-xl bg-white/6 p-1"
        >
          {(
            [
              ["signin", "Sign in"],
              ["signup", "Create account"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchTo(value)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                mode === value
                  ? "bg-gold/20 text-white ring-1 ring-gold/40"
                  : "text-sand/60 hover:text-sand",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-5 font-display text-2xl text-white">
          {isSignup ? "Create your guest account" : isReset ? "Reset your password" : "Welcome back"}
        </p>
        {isSignup && (
          <p className="mt-1.5 text-xs leading-relaxed text-sand/60">
            For guests. Staff accounts are set up by the property.
          </p>
        )}
        {isReset && (
          <p className="mt-1.5 text-xs leading-relaxed text-sand/60">
            We will email you a link to choose a new one.
          </p>
        )}

        <div className="mt-5 space-y-4">
          {isSignup && (
            <Field id="name" label="Your name" icon={<User className="size-4" aria-hidden />}>
              <Input
                id="name"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="border-0 bg-white/10 pl-9 text-sand placeholder:text-sand/40"
                placeholder="Pooja Bothra"
              />
            </Field>
          )}

          <Field id="email" label="Email" icon={<Mail className="size-4" aria-hidden />}>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border-0 bg-white/10 pl-9 text-sand placeholder:text-sand/40"
              placeholder="you@example.com"
            />
          </Field>

          {!isReset && (
            <Field
              id="password"
              label="Password"
              icon={<Lock className="size-4" aria-hidden />}
              action={
                !isSignup && (
                  <button
                    type="button"
                    onClick={() => switchTo("reset")}
                    className="text-xs text-gold-400 underline underline-offset-4 transition-colors hover:text-gold-200"
                  >
                    Forgot password?
                  </button>
                )
              }
            >
              <PasswordInput
                dark
                id="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-0 bg-white/10 pl-9 text-sand placeholder:text-sand/40"
                placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              />
            </Field>
          )}

          {isSignup && (
            <p className="text-xs leading-relaxed text-sand/50">
              If you have already stayed with us, use the email we have on file and your
              booking will appear automatically.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-status-cancelled/25 p-3 text-sm text-white">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? isSignup
                ? "Creating…"
                : isReset
                  ? "Sending…"
                  : "Signing in…"
              : isSignup
                ? "Create account"
                : isReset
                  ? "Email me a link"
                  : "Sign in"}
            <ArrowRight aria-hidden />
          </Button>

          {isReset && (
            <button
              type="button"
              onClick={() => switchTo("signin")}
              className="w-full text-center text-xs text-sand/60 underline underline-offset-4 hover:text-sand"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  icon,
  action,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sand/70">
          {label}
        </Label>
        {action}
      </div>
      <div className="relative">
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-gold-400">{icon}</span>
        {children}
      </div>
    </div>
  );
}
