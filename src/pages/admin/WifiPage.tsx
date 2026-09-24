import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Users, Wifi, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatCard } from "@/components/common";
import { ControllerTag } from "@/components/wifi/WifiStatus";
import { WifiDevicesTable } from "@/components/wifi/WifiDevicesTable";
import { useWifiAdmin } from "@/hooks/useWifi";
import { useMockData } from "@/hooks/useData";

const ALL = "all";

/**
 * Guest Wi-Fi across the property. Every figure is an authorisation the CRM
 * has recorded — the controller is a mock, so nothing here is traffic.
 */
export default function WifiPage() {
  const { villas, customers, today } = useMockData();
  const { devices, sessions, reload, loading } = useWifiAdmin();

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Guest Wi-Fi"
        description="Who the CRM has let on, where, and until when."
        actions={<ControllerTag kind="mock" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
      </section>

      {!loading && (
        <WifiDevicesTable devices={shown} sessions={sessions} onChanged={() => void reload()} showVilla />
      )}

      <p className="text-xs text-stone-600">
        Network settings are on each villa's page — <Link to="/admin/villas" className="underline">Villas</Link>.
        Staff see this page only when their department holds “See guest Wi-Fi”.
      </p>
    </div>
  );
}
