import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow, StatusBadge } from "@/components/common";
import { useMockData } from "@/hooks/useData";
import { supabase } from "@/services/supabase/client";
import type { Villa } from "@/types";

/**
 * One network per villa: its name, VLAN, controller network and access points.
 * Guests of one villa are never on another villa's network, and the VLAN is
 * what keeps their traffic apart from staff and CCTV.
 */
function VillaRow({ villa, canEdit }: { villa: Villa; canEdit: boolean }) {
  const { refetch } = useMockData();
  const initial = {
    enabled: villa.wifiEnabled ?? true,
    captive: villa.captivePortalEnabled ?? false,
    ssid: villa.wifiNetwork ?? "",
    networkId: villa.wifiNetworkId ?? "",
    vlan: villa.wifiVlanId ? String(villa.wifiVlanId) : "",
    aps: String(villa.wifiApCount ?? 0),
  };
  const [cfg, setCfg] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);
  const id = `vn-${villa.id}`;

  const save = async () => {
    if (!cfg.ssid.trim()) return toast.error("Give the network a name");
    const vlan = cfg.vlan.trim() === "" ? null : Number(cfg.vlan);
    if (vlan !== null && (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094)) {
      return toast.error("A VLAN is a whole number from 1 to 4094");
    }
    const aps = Number(cfg.aps);
    if (!Number.isInteger(aps) || aps < 0 || aps > 30) return toast.error("Access points: a whole number, 0 to 30");

    setSaving(true);
    const a = await supabase.rpc("wifi_configure_villa", {
      p_villa_id: villa.id,
      p_enabled: cfg.enabled,
      p_captive_portal: cfg.captive,
      p_ssid: cfg.ssid,
      p_network_id: cfg.networkId,
      p_notes: villa.wifiConfigurationNotes ?? "",
    });
    const b = a.error ? a : await supabase.rpc("wifi_configure_villa_network", {
      p_villa_id: villa.id,
      p_vlan_id: vlan,
      p_ap_count: aps,
    });
    setSaving(false);
    if (b.error) return toast.error("Could not save", { description: b.error.message });
    toast.success(`${villa.name} network saved`);
    await refetch();
  };

  return (
    <li className="space-y-4 rounded-xl bg-sand/50 p-4 ring-1 ring-ink/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-lg text-ink">{villa.name}</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={initial.enabled ? "Wi-Fi on" : "Wi-Fi off"} tone={initial.enabled ? "confirmed" : "cancelled"} />
          <StatusBadge label={initial.captive ? "Sign-in page on" : "Sign-in page off"} tone={initial.captive ? "confirmed" : "completed"} />
        </div>
      </div>

      <fieldset disabled={!canEdit} className="space-y-4">
        <legend className="sr-only">{villa.name} network</legend>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor={`${id}-ssid`}>Network name (SSID)</Label>
            <Input id={`${id}-ssid`} value={cfg.ssid} onChange={(e) => setCfg({ ...cfg, ssid: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-vlan`}>VLAN</Label>
            <Input
              id={`${id}-vlan`}
              inputMode="numeric"
              value={cfg.vlan}
              placeholder="e.g. 20"
              onChange={(e) => setCfg({ ...cfg, vlan: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-aps`}>Access points installed</Label>
            <Input
              id={`${id}-aps`}
              inputMode="numeric"
              value={cfg.aps}
              onChange={(e) => setCfg({ ...cfg, aps: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5 lg:col-span-4">
            <Label htmlFor={`${id}-net`}>Controller network ID</Label>
            <Input
              id={`${id}-net`}
              value={cfg.networkId}
              placeholder="Optional — the controller's own id for this network"
              onChange={(e) => setCfg({ ...cfg, networkId: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="size-4 accent-[var(--color-clay)]" />
            Guest Wi-Fi on
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={cfg.captive} onChange={(e) => setCfg({ ...cfg, captive: e.target.checked })} className="size-4 accent-[var(--color-clay)]" />
            Guests sign in through the captive portal
          </label>
        </div>
        {canEdit && dirty && (
          <Button onClick={() => void save()} disabled={saving}>
            <Save aria-hidden />
            {saving ? "Saving…" : `Save ${villa.name}`}
          </Button>
        )}
      </fieldset>
    </li>
  );
}

export function VillaNetworksCard({ canEdit }: { canEdit: boolean }) {
  const { villas } = useMockData();
  return (
    <section className="space-y-4 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div>
        <Eyebrow className="text-gold-700">Villa networks</Eyebrow>
        <p className="mt-1 text-sm text-stone-600">
          Each villa has its own guest network. Give each its own VLAN and keep client isolation on, so
          guests never see one another's devices or your staff network.
        </p>
      </div>
      <ul className="space-y-4">
        {villas.map((v) => (
          <VillaRow key={v.id} villa={v} canEdit={canEdit} />
        ))}
      </ul>
      {!canEdit && (
        <p className="text-xs text-stone-600">Changing a villa's network needs the “Configure villa Wi-Fi” permission.</p>
      )}
    </section>
  );
}
