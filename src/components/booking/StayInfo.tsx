import { Eyebrow } from "@/components/common";
import { cn } from "@/lib/utils";
import { policyLines } from "@/lib/cancellation";
import type { PropertySettings } from "@/types";

/** The admin writes one bullet per line; this is the only place that splits. */
export const lines = (text?: string) =>
  (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

type Info = Partial<PropertySettings> | null | undefined;

function Block({ title, text }: { title: string; text?: string }) {
  const items = lines(text);
  if (!items.length) return null;
  return (
    <div>
      <Eyebrow className="text-gold-700">{title}</Eyebrow>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600 marker:text-gold">
        {items.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

/** Dining menu and add-ons, exactly as set in admin Settings → Guest info.
 *  Takes the settings as a prop because the booking wizard runs before sign-in,
 *  where the data provider does not exist. */
export function DiningInfo({ settings: s }: { settings: Info }) {
  if (!s) return null;
  return (
    <div className="space-y-5 rounded-xl bg-sand-200/50 p-5">
      <Block title="Dining & menu" text={s.diningMenu} />
      <Block title="Optional add-ons" text={s.addons} />
    </div>
  );
}

/** Terms and both policies; with `payment`, where to pay as well. */
export function PaymentAndPolicies({ settings: s, payment = true }: { settings: Info; payment?: boolean }) {
  if (!s) return null;
  const rows: [string, string | undefined][] = [
    ["Account name", s.accountName],
    ["Bank", s.bankName],
    ["Account number", s.accountNumber],
    ["IFSC", s.ifsc],
    ["UPI", s.upiId],
  ];
  return (
    <div className="space-y-5">
      {payment && (
        <div>
          <Eyebrow className="text-gold-700">Payment details</Eyebrow>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 sm:block">
                  <dt className="text-stone-600">{k}</dt>
                  <dd className="font-medium text-ink">{v}</dd>
                </div>
              ))}
          </dl>
          {s.paymentNote && <p className="mt-2 text-xs text-stone-600">{s.paymentNote}</p>}
        </div>
      )}
      <Block title="Terms" text={s.stayTerms} />
      <Block title="Cancellation & refunds" text={policyLines(s).join("\n")} />
      <Block title="Booking policy" text={s.bookingPolicy} />
      <Block title="Pet policy" text={s.petPolicy} />
    </div>
  );
}

/** Multi-select as chips. A row of checkboxes asks to be read; chips ask to
 *  be tapped, which is what a phone wants. */
export function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: Record<string, string>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label-caps mb-2">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([value, text]) => {
          const picked = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={picked}
              onClick={() => onToggle(value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                picked
                  ? "bg-ink text-sand"
                  : "bg-sand-200 text-stone-600 hover:bg-sand-300 hover:text-ink",
              )}
            >
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
