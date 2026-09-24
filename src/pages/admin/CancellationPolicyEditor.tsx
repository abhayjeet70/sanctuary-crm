import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { policyLines, previewRefundPercent } from "@/lib/cancellation";
import type { CancellationTier, PropertySettings } from "@/types";

type Patch = Partial<PropertySettings>;
type Fields = Pick<
  PropertySettings,
  "cancellationFree" | "cancellationFreeDays" | "cancellationTiers" | "cancellationNote"
>;

/**
 * Edit the cancellation policy and see what it would mean before saving.
 *
 * Free cancellation is a yes/no. When it is yes, the guest gets everything back
 * until the chosen number of days before check-in; after that — or from the
 * start when it is no — the tiers decide how much is deducted.
 */
export function CancellationPolicyEditor({
  draft,
  set,
}: {
  draft: Fields;
  set: <K extends keyof Fields>(key: K, value: Fields[K]) => void;
}) {
  const tiers = draft.cancellationTiers;
  const setTiers = (next: CancellationTier[]) => set("cancellationTiers", next);
  const patchTier = (i: number, patch: Partial<CancellationTier>) =>
    setTiers(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-ink">Free cancellation</legend>
        <div className="mt-2 flex gap-2">
          {[
            { v: true, t: "Yes — free until a cut-off" },
            { v: false, t: "No — a charge always applies" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              aria-pressed={draft.cancellationFree === o.v}
              onClick={() => set("cancellationFree", o.v)}
              className={
                draft.cancellationFree === o.v
                  ? "rounded-lg bg-ink px-4 py-2 text-sm text-sand"
                  : "rounded-lg bg-sand-200 px-4 py-2 text-sm text-stone-600 hover:bg-sand-300"
              }
            >
              {o.t}
            </button>
          ))}
        </div>
      </fieldset>

      {draft.cancellationFree && (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="free-days">Free until this many days before check-in</Label>
          <Input
            id="free-days"
            type="number"
            min={0}
            value={draft.cancellationFreeDays}
            onChange={(e) => set("cancellationFreeDays", clamp(Number(e.target.value), 365))}
          />
          <p className="text-xs text-stone-600">
            Cancel this early or earlier and the guest gets 100% back.
          </p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-ink">
          {draft.cancellationFree
            ? "After the free period — what is deducted"
            : "What is deducted, by how close the stay is"}
        </p>
        <p className="mt-1 text-xs text-stone-600">
          Read top to bottom: cancelling at least this many days before check-in earns that
          refund. Below the last row the guest gets nothing back.
        </p>

        <ul className="mt-3 space-y-2">
          {tiers.map((t, i) => (
            <li key={i} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`tier-days-${i}`}>At least (days before)</Label>
                <Input
                  id={`tier-days-${i}`}
                  type="number"
                  min={0}
                  className="w-32"
                  value={t.days}
                  onChange={(e) => patchTier(i, { days: clamp(Number(e.target.value), 365) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`tier-pct-${i}`}>Refund %</Label>
                <Input
                  id={`tier-pct-${i}`}
                  type="number"
                  min={0}
                  max={100}
                  className="w-28"
                  value={t.refundPercent}
                  onChange={(e) => patchTier(i, { refundPercent: clamp(Number(e.target.value), 100) })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this row"
                onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setTiers([...tiers, { days: 0, refundPercent: 0 }])}
        >
          <Plus aria-hidden />
          Add a row
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cancel-note">Note shown to guests (optional)</Label>
        <Textarea
          id="cancel-note"
          rows={2}
          value={draft.cancellationNote}
          onChange={(e) => set("cancellationNote", e.target.value)}
          placeholder="Refunds are sent within 7 working days of cancellation."
        />
      </div>

      <div className="grid gap-6 rounded-xl bg-sand-200/50 p-4 sm:grid-cols-2">
        <div>
          <p className="label-caps text-gold-700">Guests will read</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {policyLines(draft as Patch).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label-caps text-gold-700">On a ₹1,00,000 booking, fully paid</p>
          <dl className="mt-2 space-y-1 text-sm">
            {[30, 15, 10, 7, 3, 0].map((d) => (
              <div key={d} className="flex justify-between gap-4">
                <dt className="text-stone-600">Cancelled {d} days before</dt>
                <dd className="tabular-nums text-ink">
                  ₹{(previewRefundPercent(draft, d) * 1000).toLocaleString("en-IN")} back
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
