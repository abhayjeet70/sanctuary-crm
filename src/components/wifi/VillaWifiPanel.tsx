import { useState } from "react";
import { toast } from "sonner";
import { Save, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow, StatCard, StatusBadge } from "@/components/common";
import { ControllerTag } from "@/components/wifi/WifiStatus";
import { WifiDevicesTable } from "@/components/wifi/WifiDevicesTable";
import { useWifiAdmin } from "@/hooks/useWifi";
import { useMockData } from "@/hooks/useData";
import { usePermission } from "@/services/session";
import { supabase } from "@/services/supabase/client";
import type { Villa } from "@/types";

/**
 * A villa's guest Wi-Fi: how it is set up, who is on it, and the controls.
 *
 * Lives on the villa page rather than in a separate app, because the network
 * belongs to the house. Nothing here claims a device is online — the numbers
 * are what the CRM has authorised, and the controller is named on the card.
 */
export function VillaWifiPanel({ villa }: { villa: Villa }) {
  const { today, refetch } = useMockData();
  const canView = usePermission("wifi.view");
  const canConfigure = usePermission("wifi.configure");
  const { devices, sessions, reload } = useWifiAdmin(villa.id);

  const initial = {
    enabled: villa.wifiEnabled ?? true,
    captive: villa.captivePortalEnabled ?? false,
    ssid: villa.wifiNetwork ?? "",
    networkId: villa.wifiNetworkId ?? "",
    notes: villa.wifiConfigurationNotes ?? "",
  };
  const [cfg, setCfg] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);

  const live = devices.filter((d) => d.accessStatus === "authorized");
  const soon = live.filter((d) => d.expiresAt && new Date(d.expiresAt).getTime() - Date.now() < 3 * 3600e3);

  const save = async () => {
    if (!cfg.ssid.trim()) return toast.error("Give the network a name");
    setSaving(true);
    const { error } = await supabase.rpc("wifi_configure_villa", {
      p_villa_id: villa.id,
      p_enabled: cfg.enabled,
      p_captive_portal: cfg.captive,
      p_ssid: cfg.ssid,
      p_network_id: cfg.networkId,
      p_notes: cfg.notes,
    });
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    toast.success("Wi-Fi settings saved");
    await refetch();
  };

  return (
    <section className="space-y-5 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-gold-700" aria-hidden />
          <Eyebrow className="text-gold-700">Guest Wi-Fi</Eyebrow>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={initial.enabled ? "Wi-Fi on" : "Wi-Fi off"}
            tone={initial.enabled ? "confirmed" : "cancelled"}
          />
          <StatusBadge
            label={initial.captive ? "Captive portal on" : "Captive portal off"}
            tone={initial.captive ? "confirmed" : "completed"}
          />
          <StatusBadge
            label={initial.networkId ? "Controller linked" : "No controller linked"}
            tone={initial.networkId ? "confirmed" : "pending"}
          />
          <ControllerTag kind="mock" />
        </div>
      </div>

      {/* ----------------------------------------------------- network */}
      <fieldset disabled={!canConfigure} className="space-y-4">
        <legend className="sr-only">Network settings</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wifi-ssid">Network name (SSID)</Label>
            <Input id="wifi-ssid" value={cfg.ssid} onChange={(e) => setCfg({ ...cfg, ssid: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wifi-net-id">Controller network ID</Label>
            <Input
              id="wifi-net-id"
              value={cfg.networkId}
              placeholder="Set when hardware is connected"
              onChange={(e) => setCfg({ ...cfg, networkId: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
              className="size-4 accent-[var(--color-clay)]"
            />
            Guest Wi-Fi on
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={cfg.captive}
              onChange={(e) => setCfg({ ...cfg, captive: e.target.checked })}
              className="size-4 accent-[var(--color-clay)]"
            />
            Guests sign in through the captive portal
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wifi-notes">Configuration notes (staff only)</Label>
          <Textarea
            id="wifi-notes"
            rows={2}
            value={cfg.notes}
            onChange={(e) => setCfg({ ...cfg, notes: e.target.value })}
            placeholder="Router in the pantry cupboard; AP on the verandah ceiling."
          />
        </div>
        {!canConfigure && (
          <p className="text-xs text-stone-600">
            Changing these needs the “Configure villa Wi-Fi” permission.
          </p>
        )}
        {canConfigure && dirty && (
          <Button onClick={() => void save()} disabled={saving}>
            <Save aria-hidden />
            {saving ? "Saving…" : "Save Wi-Fi settings"}
          </Button>
        )}
      </fieldset>

      {/* ----------------------------------------------------- usage */}
      {canView ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Guests with access" value={new Set(live.map((d) => d.userId)).size} />
            <StatCard label="Authorised devices" value={live.length} />
            <StatCard label="Open sessions" value={sessions.filter((s) => s.status === "active").length} />
            <StatCard
              label="Sessions today"
              value={sessions.filter((s) => s.connectedAt.slice(0, 10) === today).length}
              hint={soon.length ? `${soon.length} expiring within 3 hours` : undefined}
            />
          </div>
          <p className="text-xs text-stone-600">
            Figures are the CRM's authorisations. With the mock controller nothing reports live
            traffic or bandwidth, so none is shown.
          </p>
          <WifiDevicesTable devices={devices} sessions={sessions} onChanged={() => void reload()} />
        </>
      ) : (
        <p className="text-sm text-stone-600">
          Seeing connected devices needs the “See guest Wi-Fi” permission.
        </p>
      )}
    </section>
  );
}
