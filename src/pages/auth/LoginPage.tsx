import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound } from "lucide-react";
import { Eyebrow, Logo } from "@/components/common";
import { collage, photo } from "@/lib/assets";
import { useSession } from "@/services/session";
import { AuthPanel } from "./AuthPanel";
import { cn } from "@/lib/utils";

const HERO = photo.hills;

/**
 * Demo accounts, seeded by supabase/migrations/..._demo_auth_users.sql.
 *
 * Dev only. One of these is an admin with a shared four-character password, so
 * on a public URL the panel is an open door to the whole operation — Vite
 * strips it from the production bundle rather than merely hiding it.
 */
// The shared password comes from the environment and is deliberately absent
// from the deployed build, which is what actually keeps it out of the bundle —
// a hidden panel would still have shipped the password to anyone who greps the
// JavaScript. No VITE_DEMO_PASSWORD, no panel.
const DEMO_PASSWORD = ((import.meta.env ?? {}) as Record<string, string | undefined>)
  .VITE_DEMO_PASSWORD;

const DEMO = [
  { label: "Owner & reception", email: "admin@gmail.com" },
  { label: "Guest — Pooja Bothra", email: "user@gmail.com" },
  { label: "Housekeeping — staff queue", email: "housekeeping@gmail.com" },
];

function useParallax() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (event: PointerEvent) =>
      setOffset({
        x: event.clientX / window.innerWidth - 0.5,
        y: event.clientY / window.innerHeight - 0.5,
      });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return offset;
}

export default function LoginPage() {
  const { session, signIn } = useSession();
  const navigate = useNavigate();
  const { x, y } = useParallax();

  const [busy, setBusy] = useState(false);

  // The session arrives asynchronously after signIn resolves, so the redirect
  // watches for it rather than guessing where to go.
  useEffect(() => {
    if (!session) return;
    navigate(
      session.role === "admin" ? "/admin" : session.role === "staff" ? "/staff" : "/guest",
      { replace: true },
    );
  }, [session, navigate]);

  /** The demo buttons still sign in directly; the panel owns the real form. */
  const enterAs = async (demoEmail: string) => {
    setBusy(true);
    const { error } = await signIn(demoEmail, DEMO_PASSWORD!);
    if (error) setBusy(false);
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink text-sand">
      <img
        src={HERO}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover opacity-45 transition-transform duration-700 ease-out"
        style={{ transform: `scale(1.08) translate3d(${x * -18}px, ${y * -12}px, 0)` }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink/88 via-ink/65 to-ink/96" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(201,169,97,0.18),transparent_60%)]"
      />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Logo variant="onDark" size="h-20 sm:h-24" />
          <span className="rounded-full bg-gold/15 px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-gold-200 uppercase ring-1 ring-gold/30">
            Staff & guest sign-in
          </span>
        </header>
        <hr className="rule-gold mt-6 opacity-70" />

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_minmax(0,26rem)] lg:items-start lg:gap-16 lg:pt-16">
          {/* Left — the editorial column */}
          <div
            className="transition-transform duration-700 ease-out"
            style={{ transform: `translate3d(${x * 10}px, ${y * 6}px, 0)` }}
          >
            <Eyebrow className="text-gold-400">Nandi Hills · Bengaluru</Eyebrow>
            <h1 className="display-caps mt-5 text-[2.75rem] text-white sm:text-[4.5rem]">
              Moments of
              <br />
              <span className="text-gold-gradient">stillness.</span>
            </h1>
            <hr className="rule-gold mt-8 w-56" />

            <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {collage.map((image, index) => (
                <li
                  key={image.src}
                  className={cn(
                    "overflow-hidden rounded-xl ring-1 ring-gold/25 transition-shadow hover:ring-gold/60",
                    index === 0 && "col-span-2 sm:col-span-1",
                  )}
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    loading="lazy"
                    className="h-28 w-full object-cover opacity-80 transition-all duration-500 hover:scale-105 hover:opacity-100 sm:h-32"
                  />
                </li>
              ))}
            </ul>

            <p className="mt-10 max-w-lg text-base leading-relaxed text-sand/80">
              Three houses above the Nandi Hills escarpment — and one place for
              everything that happens between an enquiry and a goodbye.
            </p>
          </div>

          {/* Right — the way in */}
          <div className="flex flex-col gap-4">
            <AuthPanel />

            {/* One-click demo accounts — development builds only */}
            {DEMO_PASSWORD && (
            <div className="rounded-2xl bg-ink/40 p-4 backdrop-blur-md ring-1 ring-gold/20">
              <Eyebrow className="text-gold-400/75">Demo accounts</Eyebrow>
              <div className="mt-3 flex flex-col gap-2">
                {DEMO.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={busy}
                    onClick={() => void enterAs(account.email)}
                    className="group flex items-center justify-between gap-3 rounded-xl bg-white/6 px-4 py-3 text-left transition-all hover:bg-white/12 hover:ring-1 hover:ring-gold/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{account.label}</span>
                      <span className="block truncate font-mono text-xs text-sand/55">
                        {account.email}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-gold-400 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </button>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-sand/55">
                <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Real Supabase accounts, shown only because VITE_DEMO_PASSWORD is set
                locally. Delete the accounts before the property's own data is loaded.
              </p>
            </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gold/20 pt-6 text-xs text-sand/60">
          <span>Homes of Sanctuary · operations CRM</span>
          <Link
            to="/design-system"
            className="text-gold-400 underline underline-offset-4 transition-colors hover:text-gold-200"
          >
            View the design system
          </Link>
        </footer>
      </div>
    </main>
  );
}
