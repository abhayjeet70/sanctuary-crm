import { useState } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Shown under the label — stays, nights, whatever the row is about. */
  detail?: string;
  /** The part of `value` already collected, drawn darker inside the bar. */
  filled?: number;
}

/**
 * Magnitude down a list of named things.
 *
 * Horizontal because the labels are words — "Villa Nirvaana", "WhatsApp" —
 * and a column chart would either clip them or turn them on their side. One
 * hue, because these categories carry no identity worth a palette: the length
 * is the message. Every row is direct-labelled with its number, so the bar is
 * a reading aid rather than the only way to get the value.
 */
export function BarList({
  data,
  format = money,
  emphasise,
  className,
}: {
  data: BarDatum[];
  format?: (n: number) => string;
  /** One key to hold in the accent hue while the rest recede. */
  emphasise?: string;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const top = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-stone-600">Nothing in this period.</p>;
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((row) => {
        const share = top > 0 ? row.value / top : 0;
        const dimmed = hovered !== null && hovered !== row.key;
        const accent = emphasise === undefined || emphasise === row.key;

        return (
          <li
            key={row.key}
            className={cn("transition-opacity", dimmed && "opacity-55")}
            onMouseEnter={() => setHovered(row.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink">{row.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-ink">{format(row.value)}</span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              {/* 12px track, 4px rounded data-end, grown from one baseline. */}
              <span className="relative h-3 flex-1 overflow-hidden rounded-sm bg-sand-200">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-r-[4px] transition-[width]",
                    accent ? "bg-gold/70" : "bg-stone/35",
                  )}
                  style={{ width: `${Math.max(share * 100, row.value > 0 ? 1.5 : 0)}%` }}
                  aria-hidden
                />
                {row.filled !== undefined && row.filled > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] bg-ink/55"
                    style={{ width: `${Math.max((row.filled / (top || 1)) * 100, 1.5)}%` }}
                    aria-hidden
                  />
                )}
              </span>
              {row.detail && (
                <span className="w-28 shrink-0 text-right text-xs text-stone-600">
                  {row.detail}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
