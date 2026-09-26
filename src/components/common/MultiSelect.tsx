import { useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A dropdown you can tick several things in.
 *
 * The native `<select multiple>` is a list box nobody finds on a phone, and the
 * shadcn Select is single-choice, so this is a Popover with checkboxes — real
 * inputs, so it works with a keyboard and a screen reader without any ARIA
 * gymnastics. Picks show as chips under the trigger and can be removed there.
 *
 * With a `max`, the rest of the list is disabled once it is reached, and the
 * count says so. The database holds the same limit; this is the courtesy.
 */
export function MultiSelect({
  label,
  hint,
  options,
  value,
  onChange,
  max,
  placeholder = "Choose…",
  className,
}: {
  label: string;
  /** Shown beside the label, e.g. "choose up to 2". */
  hint?: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number | null;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const atMax = max != null && value.length >= max;

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : atMax ? value : [...value, v]);

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} chosen`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-stone-600">{hint}</span>}
      </label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-left text-sm text-ink transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className={cn("truncate", value.length === 0 && "text-stone-600")}>{summary}</span>
            <ChevronDown className="size-4 shrink-0 text-stone" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-72 overflow-y-auto p-1.5"
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          <ul role="listbox" aria-multiselectable aria-label={label} className="space-y-0.5">
            {options.map((o) => {
              const checked = value.includes(o.value);
              const blocked = atMax && !checked;
              return (
                <li key={o.value}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm",
                      checked ? "bg-gold/12 text-ink" : "hover:bg-sand-200/70",
                      blocked && "cursor-not-allowed opacity-45 hover:bg-transparent",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked}
                      onChange={() => toggle(o.value)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--color-clay)]"
                    />
                    <span className="min-w-0 flex-1">{o.label}</span>
                    {checked && <Check className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />}
                  </label>
                </li>
              );
            })}
          </ul>
          {max != null && (
            <p className="px-2.5 pt-2 pb-1 text-xs text-stone-600" role="status">
              {value.length} of {max} chosen{atMax ? " — untick one to change" : ""}
            </p>
          )}
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <li
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-sand-200 py-1 pr-1 pl-3 text-xs text-ink"
            >
              <span className="truncate">{options.find((o) => o.value === v)?.label ?? v}</span>
              <button
                type="button"
                aria-label={`Remove ${options.find((o) => o.value === v)?.label ?? v}`}
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="rounded-full p-0.5 text-stone hover:bg-ink/8 hover:text-ink"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
