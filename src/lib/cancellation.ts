import { addDays } from "@/services/domain";
import { formatDate } from "@/lib/format";
import type { CancellationPolicy, CancellationTier, PropertySettings } from "@/types";

type Policy = Partial<
  Pick<
    PropertySettings,
    "cancellationFree" | "cancellationFreeDays" | "cancellationTiers" | "cancellationNote"
  >
> | null | undefined;

const sorted = (tiers?: CancellationTier[]) =>
  [...(tiers ?? [])].sort((a, b) => b.days - a.days);

/**
 * The refund the policy gives, for the settings preview only. The real number
 * is always the database's (`cancellation_quote`) — this mirrors it so the
 * admin can see a change before saving it, not so anything is charged from it.
 */
export function previewRefundPercent(policy: Policy, daysBefore: number): number {
  if (policy?.cancellationFree && daysBefore >= (policy.cancellationFreeDays ?? 0)) return 100;
  for (const tier of sorted(policy?.cancellationTiers)) {
    if (daysBefore >= tier.days) return tier.refundPercent;
  }
  return 0;
}

/** The one line a guest sees on a listing: what cancelling costs, in plain words. */
export function policyHeadline(policy: Policy, checkIn?: string): string {
  if (policy?.cancellationFree) {
    const days = policy.cancellationFreeDays ?? 0;
    return checkIn
      ? `Free cancellation until ${formatDate(addDays(checkIn, -days))}`
      : `Free cancellation up to ${days} days before check-in`;
  }
  const best = sorted(policy?.cancellationTiers).find((t) => t.refundPercent > 0);
  if (!best) return "Non-refundable";
  return `${best.refundPercent}% refund if cancelled ${best.days}+ days before check-in`;
}

/** Every rule, one per line, for the fuller "cancellation policy" view. */
export function policyLines(policy: Policy): string[] {
  const out: string[] = [];
  if (policy?.cancellationFree) {
    out.push(`Free cancellation (100% refund) up to ${policy.cancellationFreeDays} days before check-in`);
  }
  const tiers = sorted(policy?.cancellationTiers);
  tiers.forEach((t, i) => {
    const upper = i === 0 ? null : tiers[i - 1].days;
    const when =
      t.days === 0
        ? upper === null
          ? "at any time"
          : `less than ${upper} days before check-in`
        : upper === null || (policy?.cancellationFree && i === 0)
          ? `${t.days} or more days before check-in`
          : `${t.days} to ${upper - 1} days before check-in`;
    out.push(`${t.refundPercent}% refund if cancelled ${when}`);
  });
  if (policy?.cancellationNote) out.push(policy.cancellationNote);
  return out;
}

type Fields = Pick<
  PropertySettings,
  "cancellationFree" | "cancellationFreeDays" | "cancellationTiers" | "cancellationNote"
>;

/** The four policy fields for a villa: its own if it has one, else the property's. */
export function policyFields(
  villaPolicy: CancellationPolicy | null | undefined,
  property: Partial<PropertySettings> | null | undefined,
): Fields {
  return villaPolicy
    ? {
        cancellationFree: villaPolicy.free,
        cancellationFreeDays: villaPolicy.freeDays,
        cancellationTiers: villaPolicy.tiers,
        cancellationNote: villaPolicy.note,
      }
    : {
        cancellationFree: property?.cancellationFree ?? false,
        cancellationFreeDays: property?.cancellationFreeDays ?? 15,
        cancellationTiers: property?.cancellationTiers ?? [
          { days: 10, refundPercent: 50 },
          { days: 0, refundPercent: 0 },
        ],
        cancellationNote: property?.cancellationNote ?? "",
      };
}
