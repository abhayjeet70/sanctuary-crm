import { StatusBadge } from "@/components/common";
import type { Tone } from "@/lib/status";
import type { WifiAuthStatus, WifiDeviceStatus } from "@/services/wifi/types";

/**
 * One badge vocabulary for Wi-Fi, admin and guest alike. Always a word, never
 * colour alone — and "authorised", never "online": the CRM knows what it
 * allowed, not what the network is doing.
 */
const ACCESS: Record<WifiAuthStatus, { label: string; tone: Tone }> = {
  authorized: { label: "Access authorised", tone: "confirmed" },
  pending: { label: "Pending", tone: "pending" },
  revoked: { label: "Revoked", tone: "cancelled" },
  expired: { label: "Expired", tone: "completed" },
};

const DEVICE: Record<WifiDeviceStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "confirmed" },
  disconnected: { label: "Disconnected", tone: "completed" },
  blocked: { label: "Blocked", tone: "cancelled" },
  expired: { label: "Expired", tone: "completed" },
};

export function AccessBadge({ status }: { status?: WifiAuthStatus }) {
  const s = status ? ACCESS[status] : { label: "No access", tone: "completed" as Tone };
  return <StatusBadge label={s.label} tone={s.tone} />;
}

export function DeviceBadge({ status }: { status: WifiDeviceStatus }) {
  return <StatusBadge label={DEVICE[status].label} tone={DEVICE[status].tone} />;
}

/** Says which controller acted. "Mock" is shown, not hidden. */
export function ControllerTag({ kind }: { kind?: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-sand-200 px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide text-stone-600">
      {`Controller: ${kind === "mock" || !kind ? "Mock" : kind}`}
    </span>
  );
}
