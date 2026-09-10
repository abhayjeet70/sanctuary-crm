import type { ReactNode } from "react";
import { AlertTriangle, FlaskConical, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export { StatusBadge } from "./StatusBadge";

/** The all-caps, wide-tracked eyebrow used above sections and beside figures. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("label-caps", className)}>{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2 text-gold-700">{eyebrow}</Eyebrow>}
        <h1 className="text-3xl text-ink sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-stone-600">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A single scannable figure. The admin dashboard is built from a row of these. */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "warn";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06] transition-all hover:shadow-lift hover:ring-gold/30",
        tone === "accent" && "bg-ink text-sand ring-gold/25",
        tone === "warn" && "bg-status-pending-bg ring-status-pending/25",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "label-caps",
            tone === "accent" && "text-gold-400",
            tone === "warn" && "text-status-pending",
          )}
        >
          {label}
        </p>
        {icon && (
          <span className={cn("text-stone", tone === "accent" && "text-sand/60")} aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-3 font-display text-3xl leading-none",
          tone === "accent" ? "text-gold-gradient" : "text-ink",
        )}
      >
        {value}
      </p>
      <hr className="rule-gold mt-3 opacity-70" />
      {hint && (
        <p className={cn("mt-2 text-xs text-stone-600", tone === "accent" && "text-sand/65")}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Empty states are designed, not apologetic — this is a hospitality product. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl bg-white px-6 py-14 text-center ring-1 ring-ink/[0.07]",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-gold/12 text-gold-700 shadow-soft" aria-hidden>
        {icon ?? <FlaskConical className="size-5" />}
      </span>
      <p className="font-display text-xl text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-stone-600">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl bg-status-cancelled-bg px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-6 text-status-cancelled" aria-hidden />
      <p className="font-display text-xl text-ink">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-status-cancelled">{description}</p>
      )}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center gap-3 py-14 text-stone-600", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

/** Shimmer block for skeleton screens. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-sand-300/70", className)} aria-hidden />;
}

/**
 * Marks the build as running on demo data.
 *
 * Authentication, the database and storage are real; what is still seeded is
 * the content, and the two shared-password demo accounts. Keeping this honest
 * matters — a badge that overstates what is fake is as misleading as one that
 * understates it.
 */
export function DevBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-clay/12 px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-clay-600 uppercase",
        className,
      )}
      title="Real Supabase auth and database, seeded with demo content. No payment gateway, email or WhatsApp yet."
    >
      <FlaskConical className="size-3" aria-hidden />
      Demo data
    </span>
  );
}
export { Logo } from "./Logo";
export { PasswordInput } from "./PasswordInput";
export { ActivityTimeline } from "./ActivityTimeline";
