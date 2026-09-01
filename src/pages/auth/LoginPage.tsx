import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound } from "lucide-react";
import { DevBadge, Eyebrow, Logo } from "@/components/common";
import { collage, photo } from "@/lib/assets";
import { useSession } from "@/services/mock/MockSessionProvider";
import type { Role } from "@/types";
import { cn } from "@/lib/utils";

const HERO = photo.hills;

/** Two soft parallax layers that respond to the pointer — the one piece of
 *  cinematic motion carried over from the reference, kept cheap and optional. */
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
  const { signInAs } = useSession();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Role | null>(null);
  const { x, y } = useParallax();

  const enter = (role: Role) => {
    setPending(role);
    signInAs(role);
    // A beat of latency so the button's loading state is visible, the way the
    // real sign-in will feel once Supabase Auth is wired in.
    window.setTimeout(() => navigate(role === "admin" ? "/admin" : "/guest"), 420);
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
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-ink/88 via-ink/65 to-ink/96"
      />
      {/* A low brass wash, so the accents read as light rather than paint. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(201,169,97,0.18),transparent_60%)]"
      />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Logo variant="onDark" size="h-20 sm:h-24" />
          <DevBadge className="bg-gold/15 text-gold-200 ring-1 ring-gold/30" />
        </header>
        <hr className="rule-gold mt-6 opacity-70" />

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_minmax(0,26rem)] lg:gap-16">
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
              everything that happens between an enquiry and a goodbye. Bookings,
              payment verification, the kitchen board and the guest portal.
            </p>
          </div>

          {/* Right — the way in */}
          <div className="flex flex-col gap-4">
            <RoleCard
              featured
              eyebrow="Owner & reception"
              title="Continue as Admin"
              description="Dashboard, bookings, payment queue, calendar, kitchen and requests."
              loading={pending === "admin"}
              disabled={pending !== null}
              onClick={() => enter("admin")}
            />
            <RoleCard
              eyebrow="Signed in as Pooja Bothra"
              title="Continue as Guest"
              description="A confirmed whole-villa stay at Villa Maaya, 12–15 September."
              loading={pending === "guest"}
              disabled={pending !== null}
              onClick={() => enter("guest")}
            />

            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-sand/55">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              No password, no OTP, no auth provider. The chosen role is kept in
              localStorage for the session.
            </p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gold/20 pt-6 text-xs text-sand/60">
          <span>Internal operations CRM · UI phase</span>
          <Link to="/design-system" className="text-gold-400 underline underline-offset-4 transition-colors hover:text-gold-200">
            View the design system
          </Link>
        </footer>
      </div>
    </main>
  );
}

function RoleCard({
  featured = false,
  eyebrow,
  title,
  description,
  onClick,
  loading,
  disabled,
}: {
  /** The primary way in — a heavier brass edge and ring than the other card. */
  featured?: boolean;
  eyebrow: string;
  title: string;
  description: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-ink/45 p-6 text-left backdrop-blur-md transition-all",
        "ring-1 ring-gold/25 hover:bg-ink/60 hover:ring-gold/70 hover:shadow-deep",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        "disabled:cursor-not-allowed disabled:opacity-60",
        featured && "ring-gold/55",
      )}
    >
      {/* A brass edge along the top — heavier on the primary way in. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent",
          featured ? "opacity-100" : "opacity-45",
        )}
      />
      {/* Warmth pooling in from the corner, on hover. */}
      <span
        aria-hidden
        className="absolute -top-16 -right-16 size-40 rounded-full bg-gold/15 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative">
        <p className={cn("label-caps", featured ? "text-gold" : "text-gold-400/75")}>
          {eyebrow}
        </p>
        <p className="mt-1.5 font-display text-2xl text-white">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-sand/75">{description}</p>
        <hr className={cn("rule-gold mt-5", !featured && "opacity-55")} />
        <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gold-200">
          {loading ? "Signing in…" : "Enter"}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>
    </button>
  );
}
