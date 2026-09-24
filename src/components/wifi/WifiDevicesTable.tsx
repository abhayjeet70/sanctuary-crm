import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Clock, Eye, Laptop, Smartphone, Tablet, Tv, Unplug, UserX, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common";
import { AccessBadge, ControllerTag, DeviceBadge } from "@/components/wifi/WifiStatus";
import { useBookings, useMockData } from "@/hooks/useData";
import { usePermission } from "@/services/session";
import { supabase } from "@/services/supabase/client";
import { wifiController } from "@/services/wifi/controller";
import { formatDateTime } from "@/lib/format";
import type { WifiDevice, WifiSession } from "@/services/wifi/types";

const ICON = { phone: Smartphone, tablet: Tablet, laptop: Laptop, tv: Tv, other: Wifi };

/**
 * Every device the CRM has let on, with who, what and until when.
 *
 * Actions appear only for staff whose department grants them — offering a
 * button the database will refuse teaches people to distrust the others.
 */
export function WifiDevicesTable({
  devices,
  sessions,
  onChanged,
  showVilla = false,
}: {
  devices: WifiDevice[];
  sessions: WifiSession[];
  onChanged: () => void;
  showVilla?: boolean;
}) {
  const { customers, companions, villas } = useMockData();
  const bookings = useBookings();
  const canDisconnect = usePermission("wifi.disconnect");
  const canRevoke = usePermission("wifi.revoke");
  const canExtend = usePermission("wifi.manage");

  const [viewing, setViewing] = useState<WifiDevice | null>(null);
  const [confirm, setConfirm] = useState<{ device: WifiDevice; action: "disconnect" | "revoke" } | null>(null);
  const [reason, setReason] = useState("");
  const [extending, setExtending] = useState<WifiDevice | null>(null);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const who = (d: WifiDevice) =>
    companions.find((c) => c.profileId && c.profileId === d.userId)?.fullName ??
    customers.find((c) => c.id === d.guestId)?.name ??
    "Guest";
  const bookingRef = (d: WifiDevice) => bookings.find((b) => b.id === d.bookingId)?.reference;
  const openSession = (d: WifiDevice) => sessions.find((s) => s.deviceId === d.id && s.status === "active");

  const act = async () => {
    if (!confirm) return;
    setBusy(true);
    const r =
      confirm.action === "revoke"
        ? await wifiController.revokeDevice({ deviceId: confirm.device.id, reason })
        : await wifiController.disconnectDevice({ deviceId: confirm.device.id });
    setBusy(false);
    if (!r.ok) return toast.error("Could not do that", { description: r.error });
    toast.success(confirm.action === "revoke" ? "Access revoked" : "Device disconnected", {
      description: "Recorded in the CRM · Controller: Mock — no network was changed.",
    });
    setConfirm(null);
    setReason("");
    onChanged();
  };

  const restore = async (d: WifiDevice) => {
    const { error } = await supabase.rpc("wifi_restore", { p_device_id: d.id });
    if (error) return toast.error("Could not restore", { description: error.message });
    toast.success(`${d.deviceName} may connect again`);
    onChanged();
  };

  const extend = async () => {
    if (!extending || !until) return;
    setBusy(true);
    const { error } = await supabase.rpc("wifi_extend", {
      p_device_id: extending.id,
      p_until: new Date(until).toISOString(),
    });
    setBusy(false);
    if (error) return toast.error("Could not extend", { description: error.message });
    toast.success("Access extended");
    setExtending(null);
    onChanged();
  };

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<Wifi className="size-5" />}
        title="No devices yet"
        description="Devices appear here once a guest signs in on the Wi-Fi portal during their stay."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Device</TableHead>
              {showVilla && <TableHead>Villa</TableHead>}
              <TableHead>Connected since</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Access until</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => {
              const Icon = ICON[d.deviceType] ?? Wifi;
              const s = openSession(d);
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{who(d)}</p>
                    <Link to={`/admin/bookings/${d.bookingId}`} className="text-xs text-stone-600 hover:underline">
                      {bookingRef(d)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-stone-600" aria-hidden />
                      {d.deviceName}
                    </span>
                    <span className="text-xs text-stone-600 capitalize">{d.deviceType}</span>
                  </TableCell>
                  {showVilla && <TableCell>{villas.find((v) => v.id === d.villaId)?.name}</TableCell>}
                  <TableCell className="text-sm">{s ? formatDateTime(s.connectedAt) : "—"}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(d.lastSeenAt)}</TableCell>
                  <TableCell className="text-sm">{d.expiresAt ? formatDateTime(d.expiresAt) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <AccessBadge status={d.accessStatus} />
                      <DeviceBadge status={d.status} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(d)}>
                        <Eye aria-hidden />
                        View
                      </Button>
                      {canDisconnect && d.status === "active" && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirm({ device: d, action: "disconnect" })}>
                          <Unplug aria-hidden />
                          Disconnect
                        </Button>
                      )}
                      {canRevoke && d.accessStatus !== "revoked" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger-bg hover:text-danger-700"
                          onClick={() => setConfirm({ device: d, action: "revoke" })}
                        >
                          <UserX aria-hidden />
                          Revoke access
                        </Button>
                      )}
                      {canRevoke && d.accessStatus === "revoked" && (
                        <Button variant="ghost" size="sm" onClick={() => void restore(d)}>
                          Restore
                        </Button>
                      )}
                      {canExtend && d.accessStatus === "authorized" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExtending(d);
                            setUntil("");
                          }}
                        >
                          <Clock aria-hidden />
                          Extend
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ------------------------------------------------------------ view */}
      <Dialog open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.deviceName}</DialogTitle>
            <DialogDescription>
              {viewing && who(viewing)} · {viewing && bookingRef(viewing)}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
                <Fact k="MAC address" v={viewing.macAddress ?? "Not reported"} mono />
                <Fact k="IP address" v={viewing.ipAddress ?? "Not reported"} mono />
                <Fact k="Villa" v={villas.find((v) => v.id === viewing.villaId)?.name ?? "—"} />
                <Fact k="Type" v={viewing.deviceType} />
                <Fact k="First seen" v={formatDateTime(viewing.firstSeenAt)} />
                <Fact k="Access until" v={viewing.expiresAt ? formatDateTime(viewing.expiresAt) : "—"} />
              </dl>
              <ControllerTag kind={viewing.controller} />
              <div>
                <p className="label-caps mb-1.5">Sessions</p>
                <ul className="space-y-1 text-xs text-stone-600">
                  {sessions
                    .filter((s) => s.deviceId === viewing.id)
                    .map((s) => (
                      <li key={s.id}>
                        {formatDateTime(s.connectedAt)} → {s.disconnectedAt ? formatDateTime(s.disconnectedAt) : "open"} · {s.status}
                        {s.controllerSessionId && <span className="font-mono"> · {s.controllerSessionId.slice(0, 13)}</span>}
                      </li>
                    ))}
                </ul>
              </div>
              <p className="text-xs text-stone-600">
                These are the CRM's records. With the mock controller nothing reports real
                traffic, so there is no live "online" state to show.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------- disconnect / revoke */}
      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === "revoke" ? "Revoke access for" : "Disconnect"} {confirm?.device.deviceName}?
            </DialogTitle>
            <DialogDescription>
              {confirm?.action === "revoke"
                ? "The device loses access and cannot reconnect until someone restores it. The guest is told."
                : "The session ends. The guest keeps access and can reconnect from the portal."}
            </DialogDescription>
          </DialogHeader>
          {confirm?.action === "revoke" && (
            <div className="space-y-1.5">
              <Label htmlFor="wifi-reason">Reason (kept in the activity log)</Label>
              <Textarea id="wifi-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void act()}>
              {confirm?.action === "revoke" ? "Revoke access" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------- extend */}
      <Dialog open={Boolean(extending)} onOpenChange={(o) => !o && setExtending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend access for {extending?.deviceName}</DialogTitle>
            <DialogDescription>
              Beyond check-out, up to seven days from now. Normally access follows the booking —
              extend the booking instead if the stay itself is longer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="wifi-until">Until</Label>
            <Input id="wifi-until" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtending(null)}>
              Cancel
            </Button>
            <Button disabled={!until || busy} onClick={() => void extend()}>
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="label-caps">{k}</dt>
      <dd className={mono ? "font-mono text-ink" : "text-ink capitalize"}>{v}</dd>
    </div>
  );
}
