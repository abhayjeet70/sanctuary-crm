import { Eyebrow } from "@/components/common";
import { useSettings } from "@/hooks/useData";

/** The admin writes one bullet per line; this is the only place that splits. */
export const lines = (text?: string) =>
  (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

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

/** Dining menu and add-ons, exactly as set in admin Settings → Guest info. */
export function DiningInfo() {
  const s = useSettings();
  if (!s) return null;
  return (
    <div className="space-y-5 rounded-xl bg-sand-200/50 p-5">
      <Block title="Dining & menu" text={s.diningMenu} />
      <Block title="Optional add-ons" text={s.addons} />
    </div>
  );
}

/** Where to pay, plus the terms and both policies, all from admin Settings. */
export function PaymentAndPolicies() {
  const s = useSettings();
  if (!s) return null;
  const rows: [string, string][] = [
    ["Account name", s.accountName],
    ["Bank", s.bankName],
    ["Account number", s.accountNumber],
    ["IFSC", s.ifsc],
    ["UPI", s.upiId],
  ];
  return (
    <div className="space-y-5">
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
      <Block title="Terms" text={s.stayTerms} />
      <Block title="Booking policy" text={s.bookingPolicy} />
      <Block title="Pet policy" text={s.petPolicy} />
    </div>
  );
}
