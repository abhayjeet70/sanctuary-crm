import { cn } from "@/lib/utils";
import { toneClasses, toneOutline, type Tone } from "@/lib/status";

/** A dot plus a written label — the colour is never the only carrier of state. */
export function StatusBadge({
  label,
  tone,
  variant = "solid",
  className,
}: {
  label: string;
  tone: Tone;
  variant?: "solid" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        variant === "outline" ? cn("border", toneOutline[tone]) : toneClasses[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
