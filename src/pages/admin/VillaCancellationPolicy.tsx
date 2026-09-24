import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/common";
import { useMockData } from "@/hooks/useData";
import { CancellationPolicyEditor } from "./CancellationPolicyEditor";
import { policyFields } from "@/lib/cancellation";
import type { PropertySettings, Villa } from "@/types";

type Fields = Pick<
  PropertySettings,
  "cancellationFree" | "cancellationFreeDays" | "cancellationTiers" | "cancellationNote"
>;

/**
 * One villa's cancellation policy: the property-wide one, or its own.
 *
 * "Same as all villas" stores nothing on the villa, so a later change to the
 * property policy reaches it automatically. "Custom" stores a policy on the
 * villa that overrides the property's for bookings of this villa only.
 */
export function VillaCancellationPolicy({ villa }: { villa: Villa }) {
  const { settings, updateVilla } = useMockData();
  const shared = policyFields(null, settings);

  const [custom, setCustom] = useState(Boolean(villa.cancellationPolicy));
  const [draft, setDraft] = useState<Fields>(policyFields(villa.cancellationPolicy, settings));

  const dirty =
    custom !== Boolean(villa.cancellationPolicy) ||
    (custom && JSON.stringify(draft) !== JSON.stringify(policyFields(villa.cancellationPolicy, settings)));

  const save = () => {
    updateVilla(villa.id, {
      cancellationPolicy: custom
        ? {
            free: draft.cancellationFree,
            freeDays: draft.cancellationFreeDays,
            tiers: draft.cancellationTiers,
            note: draft.cancellationNote,
          }
        : null,
    });
    toast.success(custom ? `${villa.name} has its own policy` : `${villa.name} follows the property policy`);
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <Eyebrow className="text-gold-700">Cancellation policy</Eyebrow>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { v: false, t: "Same as all villas" },
          { v: true, t: `Custom for ${villa.name}` },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={custom === o.v}
            onClick={() => {
              setCustom(o.v);
              // Starting a custom policy from the property's is kinder than from blank.
              if (o.v && !villa.cancellationPolicy) setDraft(shared);
            }}
            className={
              custom === o.v
                ? "rounded-lg bg-ink px-4 py-2 text-sm text-sand"
                : "rounded-lg bg-sand-200 px-4 py-2 text-sm text-stone-600 hover:bg-sand-300"
            }
          >
            {o.t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {custom ? (
          <CancellationPolicyEditor
            draft={draft}
            set={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
          />
        ) : (
          <p className="text-sm text-stone-600">
            {villa.name} follows the property-wide policy set under Settings → Cancellation.
          </p>
        )}
      </div>

      {dirty && (
        <Button className="mt-5" onClick={save}>
          <Save aria-hidden />
          Save cancellation policy
        </Button>
      )}
    </section>
  );
}
