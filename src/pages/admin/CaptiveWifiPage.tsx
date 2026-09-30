import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2, RefreshCw, Save, Users, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Eyebrow, PageHeader, StatCard } from "@/components/common";
import { ControllerTag } from "@/components/wifi/WifiStatus";
import { WifiDevicesTable } from "@/components/wifi/WifiDevicesTable";
import { ControllerCard } from "@/components/wifi/ControllerCard";
import { PolicyCard } from "@/components/wifi/PolicyCard";
import { VillaNetworksCard } from "@/components/wifi/VillaNetworksCard";
import { HardwareCard } from "@/components/wifi/HardwareCard";
import { SetupGuideCard } from "@/components/wifi/SetupGuideCard";
import { useWifiAdmin, useWifiSettings } from "@/hooks/useWifi";
import { useMockData } from "@/hooks/useData";
import { usePermission } from "@/services/session";
import { saveWifiSettings, syncController } from "@/services/wifi/controller";
import { formatDateTime } from "@/lib/format";
import type { WifiSettings } from "@/services/wifi/types";

const ALL = "all";

const TAB =
  "data-[state=active]:bg-ink data-[state=active]:text-sand data-[state=active]:shadow-soft rounded-lg px-3 py-1.5 text-stone-600 hover:text-ink";

/**
 * Captive Wi-Fi across the property: who is on, the controller behind it, the
 * rules, each villa's network, the hardware to buy and how to set it up.
 *
 * Every device figure is an authorisation the CRM has recorded. Whether the
 * network really obeys depends on the controller, which the page names.
 */
export default function CaptiveWifiPage() {
  const canConfigure = usePermission("wifi.configure");
  const canManage = usePermission("wifi.manage");
  const { villas, customers, today, activity } = useMockData();
  const { devices, sessions, reload, loading } = useWifiAdmin();
  const remote = useWifiSettings(canConfigure);

  // The draft is shared by the Controller and Policy tabs so one Save covers both.
  const [draft, setDraft] = useState<WifiSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("devices");
  useEffect(() => {
    if (remote.settings) setDraft(remote.settings);
  }, [remote.settings]);

  const dirty = useMemo(
    () => Boolean(draft && remote.settings && JSON.stringify(draft) !== JSON.stringify(remote.settings)),
    [draft, remote.settings],
  );

  const [villa, setVilla] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [guest, setGuest] = useState("");
  const [date, setDate] = useState("");

  const shown = useMemo(
    () =>
      devices.filter((d) => {
        if (villa !== ALL && d.villaId !== villa) return false;
        if (status !== ALL && (d.accessStatus ?? "none") !== status) return false;
        if (date && !sessions.some((s) => s.deviceId === d.id && s.connectedAt.slice(0, 10) === date)) return false;
        if (guest.trim()) {
          const name = customers.find((c) => c.id === d.guestId)?.name ?? "";
          const q = guest.trim().toLowerCase();
          if (!name.toLowerCase().includes(q) && !d.deviceName.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [devices, sessions, customers, villa, status, guest, date],
  );

  const live = devices.filter((d) => d.accessStatus === "authorized");
  const soon = live.filter((d) => d.expiresAt && new Date(d.expiresAt).getTime() - Date.now() < 3 * 3600e3);
  const off = villas.filter((v) => v.wifiEnabled === false);
  const kind = remote.settings?.kind ?? "mock";
  const wifiEvents = activity.filter((e) => e.kind === "wifi").slice(0, 40);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const r = await saveWifiSettings(draft);
    setSaving(false);
    if (r.error) return toast.error("Could not save", { description: r.error });
    toast.success("Captive Wi-Fi settings saved");
    await remote.reload();
  };

  const sync = async () => {
    setSyncing(true);
    const r = await syncController();
    setSyncing(false);
    if (r.error) return toast.error("Could not sync", { description: r.error });
    toast.success(`Controller in step — ${r.released ?? 0} released${r.failed ? `, ${r.failed} failed` : ""}`);
    void reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Captive Wi-Fi"
        description="Who the CRM has let on, where and until when — and the network behind it."
        actions={<ControllerTag kind={kind} />}
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1.5">
          <TabsTrigger value="devices" className={TAB}>Devices</TabsTrigger>
          {canConfigure && <TabsTrigger value="controller" className={TAB}>Controller</TabsTrigger>}
          {canConfigure && <TabsTrigger value="policy" className={TAB}>Access policy</TabsTrigger>}
          <TabsTrigger value="villas" className={TAB}>Villa networks</TabsTrigger>
          <TabsTrigger value="hardware" className={TAB}>Hardware</TabsTrigger>
          <TabsTrigger value="guide" className={TAB}>Setup guide</TabsTrigger>
          <TabsTrigger value="activity" className={TAB}>Activity</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------- devices */}
        <TabsContent value="devices" className="space-y-6">
          {kind === "mock" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-status-pending-bg p-4 text-sm text-ink ring-1 ring-status-pending/30">
              <p className="min-w-0 flex-1">
                <strong>Mock controller.</strong> Access is recorded here, but no real network is being controlled.
                Connect your hardware to make it real.
              </p>
              <Button variant="outline" size="sm" onClick={() => setTab("guide")}>
                Open the setup guide
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Authorised devices" value={live.length} icon={<Wifi className="size-4" />} />
            <StatCard label="Guests with access" value={new Set(live.map((d) => d.userId)).size} icon={<Users className="size-4" />} />
            <StatCard label="Sessions today" value={sessions.filter((s) => s.connectedAt.slice(0, 10) === today).length} />
            <StatCard label="Expiring within 3 hours" value={soon.length} tone={soon.length ? "warn" : "default"} icon={<Clock className="size-4" />} />
            <StatCard
              label="Networks switched off"
              value={off.length}
              hint={off.map((v) => v.name).join(", ") || "All on"}
              icon={<WifiOff className="size-4" />}
            />
          </div>

          <section className="flex flex-wrap items-end gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]">
            <div className="space-y-1.5">
              <Label htmlFor="wf-villa">Villa</Label>
              <Select value={villa} onValueChange={setVilla}>
                <SelectTrigger id="wf-villa" className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All villas</SelectItem>
                  {villas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-status">Access</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="wf-status" className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any</SelectItem>
                  <SelectItem value="authorized">Authorised</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-guest">Guest or device</Label>
              <Input id="wf-guest" value={guest} onChange={(e) => setGuest(e.target.value)} className="w-52" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-date">Connected on</Label>
              <Input id="wf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => void reload()}>
                <RefreshCw aria-hidden />
                Refresh
              </Button>
              {canManage && kind !== "mock" && (
                <Button variant="outline" onClick={() => void sync()} disabled={syncing}>
                  {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                  Sync with controller
                </Button>
              )}
            </div>
          </section>

          {!loading && (
            <WifiDevicesTable devices={shown} sessions={sessions} onChanged={() => void reload()} showVilla />
          )}
        </TabsContent>

        {/* ---------------------------------------------- controller/policy */}
        {canConfigure && (
          <TabsContent value="controller">
            {draft ? (
              <ControllerCard
                value={draft}
                onChange={setDraft}
                dirty={dirty}
                canEdit={canConfigure}
                onTested={() => void remote.reload()}
              />
            ) : (
              <SettingsUnavailable error={remote.error} loading={remote.loading} />
            )}
          </TabsContent>
        )}

        {canConfigure && (
          <TabsContent value="policy">
            {draft ? (
              <PolicyCard
                value={draft}
                onChange={setDraft}
                canEdit={canConfigure}
                checkOutTime={villas[0]?.checkOutTime}
              />
            ) : (
              <SettingsUnavailable error={remote.error} loading={remote.loading} />
            )}
          </TabsContent>
        )}

        <TabsContent value="villas">
          <VillaNetworksCard canEdit={canConfigure} />
        </TabsContent>

        <TabsContent value="hardware">
          <HardwareCard configured={kind} />
        </TabsContent>

        <TabsContent value="guide">
          <SetupGuideCard settings={remote.settings} />
        </TabsContent>

        <TabsContent value="activity">
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
            <Eyebrow className="text-gold-700">Wi-Fi activity</Eyebrow>
            {wifiEvents.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<Wifi className="size-5" />}
                title="Nothing yet"
                description="Devices registering, access granted, extended or revoked, and setting changes all appear here."
              />
            ) : (
              <ul className="mt-4 divide-y divide-ink/8">
                {wifiEvents.map((e) => (
                  <li key={e.id} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                    <p className="text-xs text-stone-600">{formatDateTime(e.at)}</p>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{e.title}</p>
                      {e.detail && <p className="text-sm text-stone-600">{e.detail}</p>}
                      <p className="text-xs text-stone-600">{e.actor}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------- save bar */}
      {dirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink p-4 text-sand shadow-deep ring-1 ring-gold/30"
        >
          <p className="text-sm">You have unsaved Wi-Fi settings.</p>
          <div className="flex gap-2">
            <Button variant="ghost" className="text-sand hover:bg-sand/15 hover:text-sand" onClick={() => setDraft(remote.settings)}>
              Discard
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="bg-clay text-white hover:bg-clay-600">
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Save settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsUnavailable({ error, loading }: { error: string | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-stone-600">Loading settings…</p>;
  return (
    <EmptyState
      icon={<WifiOff className="size-5" />}
      title="Settings are not available yet"
      description={
        error?.includes("wifi_get_settings")
          ? "The database is missing the Captive Wi-Fi update. Apply the latest migration (20260930120000_captive_wifi), then reload."
          : (error ?? "Could not load the settings.")
      }
    />
  );
}
