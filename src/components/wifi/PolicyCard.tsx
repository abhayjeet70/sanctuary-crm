import { Eyebrow } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WifiSettings } from "@/services/wifi/types";

const GRACE = [0, 15, 30, 60, 120, 180, 360];
const EARLY = [0, 2, 4, 6, 12, 24];

const minutesLabel = (m: number) =>
  m === 0 ? "None — off at check-out" : m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? "hour" : "hours"}`;

/** kbps <-> Mbps for the form; blank means "no limit". */
const toMbps = (kbps: number | null) => (kbps === null ? "" : String(Math.round(kbps / 1000)));
const fromMbps = (text: string) => {
  const n = Number(text);
  return text.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.max(64, Math.round(n * 1000));
};
const toGb = (mb: number | null) => (mb === null ? "" : String(Math.round((mb / 1000) * 10) / 10));
const fromGb = (text: string) => {
  const n = Number(text);
  return text.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.max(50, Math.round(n * 1000));
};

/**
 * How long, how many, how fast. These are property-wide rules the database
 * applies itself (expiry, opening time, device ceiling); speed and data limits
 * are passed to the controller with each authorisation.
 */
export function PolicyCard({
  value,
  onChange,
  canEdit,
  checkOutTime = "11:00",
}: {
  value: WifiSettings;
  onChange: (next: WifiSettings) => void;
  canEdit: boolean;
  checkOutTime?: string;
}) {
  const set = <K extends keyof WifiSettings>(key: K, v: WifiSettings[K]) => onChange({ ...value, [key]: v });

  // "11:00" + 30 minutes -> "11:30", so the effect is visible, not abstract.
  const [h, m] = checkOutTime.split(":").map(Number);
  const end = h * 60 + m + value.graceMinutes;
  const endText = `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;

  return (
    <section className="space-y-5 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div>
        <Eyebrow className="text-gold-700">Access policy</Eyebrow>
        <p className="mt-1 text-sm text-stone-600">
          Rules for every villa. Changing the after-check-out period moves access for guests already on
          the network (except anyone staff extended by hand).
        </p>
      </div>

      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <legend className="sr-only">Access policy</legend>

        <div className="space-y-1.5">
          <Label htmlFor="pol-grace">Stays on after check-out</Label>
          <Select value={String(value.graceMinutes)} onValueChange={(v) => set("graceMinutes", Number(v))}>
            <SelectTrigger id="pol-grace" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRACE.map((g) => (
                <SelectItem key={g} value={String(g)}>{minutesLabel(g)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-stone-600">
            A {checkOutTime} check-out keeps Wi-Fi until <strong className="text-ink">{endText}</strong> — time to
            check the taxi and the bill.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pol-early">Opens before the check-in day</Label>
          <Select value={String(value.earlyHours)} onValueChange={(v) => set("earlyHours", Number(v))}>
            <SelectTrigger id="pol-early" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EARLY.map((e) => (
                <SelectItem key={e} value={String(e)}>
                  {e === 0 ? "Not before the day" : `${e} hours earlier`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-stone-600">
            Lets a guest sign in on the drive up, or the evening before an early arrival.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pol-max">Devices per stay</Label>
          <Input
            id="pol-max"
            type="number"
            min={1}
            max={20}
            value={value.maxDevices}
            onChange={(e) => set("maxDevices", Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
          />
          <p className="text-xs text-stone-600">
            Counts every guest on the booking together. 8 suits a family of four with watches and tablets.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pol-cap">Data cap per device (GB)</Label>
          <Input
            id="pol-cap"
            inputMode="decimal"
            value={toGb(value.dataCapMb)}
            placeholder="No cap"
            onChange={(e) => set("dataCapMb", fromGb(e.target.value))}
          />
          <p className="text-xs text-stone-600">Leave empty for none. Enforced by the controller.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pol-down">Download limit per device (Mbps)</Label>
          <Input
            id="pol-down"
            inputMode="decimal"
            value={toMbps(value.downKbps)}
            placeholder="No limit"
            onChange={(e) => set("downKbps", fromMbps(e.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pol-up">Upload limit per device (Mbps)</Label>
          <Input
            id="pol-up"
            inputMode="decimal"
            value={toMbps(value.upKbps)}
            placeholder="No limit"
            onChange={(e) => set("upKbps", fromMbps(e.target.value))}
          />
        </div>
      </fieldset>

      {!canEdit && (
        <p className="text-xs text-stone-600">Changing the policy needs the “Configure villa Wi-Fi” permission.</p>
      )}
      <p className="text-xs text-stone-600">
        Speed and data limits apply on UniFi. Omada and MikroTik set them on the controller's own profile.
      </p>
    </section>
  );
}
