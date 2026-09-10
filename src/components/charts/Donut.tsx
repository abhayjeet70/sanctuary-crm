import { useId, useState } from "react";
import { seriesColor } from "./palette";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Slice {
  key: string;
  label: string;
  value: number;
}

const TAU = Math.PI * 2;

/** A point on the ring, measured clockwise from twelve o'clock. */
function polar(cx: number, cy: number, r: number, fraction: number) {
  const angle = fraction * TAU - Math.PI / 2;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/**
 * Part-to-whole, at a glance.
 *
 * A donut earns its place only for a handful of segments read as "roughly how
 * much of the whole" — never for comparing two close values, which is what a
 * bar is for. Capped at five plus an Other, and every segment is direct-
 * labelled beside the ring, so nothing depends on matching a colour to a key.
 *
 * The 2px gap between segments is the surface showing through, not a stroke:
 * a border would add ink that is not data.
 */
export function Donut({
  slices,
  total,
  caption,
  className,
}: {
  slices: Slice[];
  /** Shown in the middle. Defaults to the sum. */
  total?: number;
  caption?: string;
  className?: string;
}) {
  const titleId = useId();
  const [hovered, setHovered] = useState<string | null>(null);

  const shown = slices.filter((s) => s.value > 0);
  const sum = shown.reduce((n, s) => n + s.value, 0);
  if (sum <= 0) {
    return (
      <p className="py-6 text-center text-sm text-stone-600">Nothing to show for this period.</p>
    );
  }

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outer = 82;
  const inner = 52;
  // A 2px gap at the outer edge, expressed as the fraction of a turn it spans.
  const gap = shown.length > 1 ? 2 / (TAU * outer) : 0;

  let cursor = 0;
  const arcs = shown.map((slice, index) => {
    const fraction = slice.value / sum;
    const from = cursor + gap / 2;
    const to = cursor + fraction - gap / 2;
    cursor += fraction;

    const [x1, y1] = polar(cx, cy, outer, from);
    const [x2, y2] = polar(cx, cy, outer, to);
    const [x3, y3] = polar(cx, cy, inner, to);
    const [x4, y4] = polar(cx, cy, inner, from);
    const large = to - from > 0.5 ? 1 : 0;

    return {
      ...slice,
      fraction,
      color: seriesColor(index),
      d: [
        `M ${x1} ${y1}`,
        `A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4}`,
        "Z",
      ].join(" "),
    };
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-44 shrink-0"
        role="img"
        aria-labelledby={titleId}
      >
        {/* One string: React cannot join an array into a <title>, and a
            chart whose accessible name silently vanishes is worse than one
            with no name at all. */}
        <title id={titleId}>
          {`${caption ?? "Composition"}: ${arcs
            .map((a) => `${a.label} ${Math.round(a.fraction * 100)}%`)
            .join(", ")}`}
        </title>
        {arcs.map((arc) => (
          <path
            key={arc.key}
            d={arc.d}
            fill={arc.color}
            opacity={hovered && hovered !== arc.key ? 0.35 : 1}
            className="transition-opacity"
            onMouseEnter={() => setHovered(arc.key)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-ink font-display text-[15px]"
        >
          {money(total ?? sum)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-stone text-[9px]">
          total
        </text>
      </svg>

      {/* The legend is the identity channel; the ring only shows proportion. */}
      <ul className="min-w-0 flex-1 space-y-2">
        {arcs.map((arc) => (
          <li
            key={arc.key}
            className={cn(
              "flex items-baseline gap-2.5 text-sm transition-opacity",
              hovered && hovered !== arc.key && "opacity-50",
            )}
            onMouseEnter={() => setHovered(arc.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              aria-hidden
              className="mt-1 size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: arc.color }}
            />
            <span className="min-w-0 flex-1 truncate text-stone-600">{arc.label}</span>
            <span className="tabular-nums text-ink">{money(arc.value)}</span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-stone">
              {Math.round(arc.fraction * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
