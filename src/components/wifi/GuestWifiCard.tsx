import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Check, Copy, HelpCircle, Laptop, QrCode, Smartphone, Tablet, Tv, Unplug, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/common";
import { useMockData } from "@/hooks/useData";
import { useGuestStay } from "@/hooks/useGuest";
import { useMyWifi } from "@/hooks/useWifi";
import { useSession } from "@/services/session";
import { wifiController } from "@/services/wifi/controller";
import { formatDateTime } from "@/lib/format";
import type { MyWifiAccess, WifiDeviceType } from "@/services/wifi/types";
import type { GuestRequest } from "@/types";

const STATE: Record<MyWifiAccess["state"], { label: string; dot: string; note: string }> = {
  ready: { label: "Ready to connect", dot: "bg-gold-400", note: "Authorise this device to start." },
  authorized: { label: "Access authorised", dot: "bg-status-confirmed", note: "This device is allowed on the network." },
  expired: { label: "Expired", dot: "bg-stone", note: "Access ended at check-out." },
  not_yet: { label: "Opens on arrival", dot: "bg-stone", note: "Wi-Fi opens on the day your stay begins." },
  unavailable: { label: "Unavailable", dot: "bg-status-cancelled", note: "Wi-Fi is not available for this stay right now." },
};

const ICON = { phone: Smartphone, tablet: Tablet, laptop: Laptop, tv: Tv, other: Wifi };

/** A sensible default name for the device in hand. The guest can change it. */
function guessDevice(): { name: string; type: WifiDeviceType } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return { name: "iPhone", type: "phone" };
  if (/iPad/.test(ua)) return { name: "iPad", type: "tablet" };
  if (/Android/.test(ua)) return { name: /Mobile/.test(ua) ? "Android phone" : "Android tablet", type: /Mobile/.test(ua) ? "phone" : "tablet" };
  if (/Macintosh/.test(ua)) return { name: "Mac", type: "laptop" };
  if (/Windows/.test(ua)) return { name: "Windows laptop", type: "laptop" };
  return { name: "My device", type: "other" };
}

/**
 * Guest Wi-Fi, on the guest's own villa page.
 *
 * Says what the CRM knows and no more: "access authorised" is a decision the
 * CRM made, not proof the phone is online — with the mock controller there is
 * no network to ask. The password is shown only where the network uses one;
 * behind a captive portal, the QR points at the portal instead.
 */
export function GuestWifiCard({ password }: { password?: string }) {
  const { session } = useSession();
  const { createRequest } = useMockData();
  const { view } = useGuestStay();
  const { access, devices, reload } = useMyWifi();

  const [name, setName] = useState(guessDevice().name);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  const captive = Boolean(access?.captivePortal);
  const payload = captive
    ? `${window.location.origin}/wifi`
    : access?.ssid && password
      ? `WIFI:T:WPA;S:${access.ssid.replace(/([\\;,:"])/g, "\\$1")};P:${password.replace(/([\\;,:"])/g, "\\$1")};;`
      : null;

  useEffect(() => {
    if (!payload) return setQr(null);
    void QRCode.toDataURL(payload, { margin: 1, width: 260, color: { dark: "#142731", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [payload]);

  if (!access) return null;
  const state = STATE[access.state];

  const authorize = async () => {
    if (!name.trim()) return toast.error("Give this device a name");
    setBusy(true);
    const r = await wifiController.authorizeDevice({ deviceName: name.trim(), deviceType: guessDevice().type });
    setBusy(false);
    if (!r.ok) return toast.error("Could not authorise", { description: r.error });
    toast.success("Access authorised", {
      description: `Until ${r.expiresAt ? formatDateTime(r.expiresAt) : "check-out"} · Controller: Mock`,
    });
    void reload();
  };

  const disconnect = async (id: string) => {
    const r = await wifiController.disconnectDevice({ deviceId: id });
    if (!r.ok) return toast.error("Could not disconnect", { description: r.error });
    toast.success("Device disconnected — you can reconnect any time before check-out");
    void reload();
  };

  const reportProblem = async () => {
    if (!view) return;
    const active = devices.find((d) => d.accessStatus === "authorized");
    const request: GuestRequest = {
      id: `q-${Date.now()}`,
      reference: `REQ-${String(Date.now()).slice(-4)}`,
      bookingId: view.booking.id,
      customerId: view.booking.customerId,
      companionId: session?.companionId,
      villaId: view.booking.villaId,
      category: "wifi",
      description: `Wi-Fi not working${active ? ` on ${active.deviceName}` : ""} — ${access.villaName ?? "villa"} (${access.ssid ?? "network"}).`,
      priority: "normal",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const { error } = await createRequest(request);
    if (error) return;
    setHelp(false);
    toast.success("We are on it", { description: "The team has your Wi-Fi request and will come to you." });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the password is shown on screen");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-ink text-sand shadow-lift ring-1 ring-gold/30">
      <div className="relative p-6 sm:p-8">
        <div aria-hidden className="absolute -top-16 -right-16 size-52 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wifi className="size-4 text-gold-400" aria-hidden />
              <Eyebrow className="text-gold-400">Wi-Fi · {access.villaName ?? view?.villa?.name}</Eyebrow>
            </div>
            <span className="rounded-md bg-sand/10 px-2 py-0.5 text-[0.6875rem] text-sand/70">Controller: Mock</span>
          </div>

          <dl className="grid gap-6 sm:grid-cols-3">
            <div>
              <dt className="label-caps text-sand/50">Network</dt>
              <dd className="text-gold-gradient mt-2 font-display text-3xl">{access.ssid ?? "—"}</dd>
            </div>
            <div>
              <dt className="label-caps text-sand/50">Status</dt>
              <dd className="mt-2 flex items-center gap-2 text-lg text-white">
                <span aria-hidden className={`size-2.5 rounded-full ${state.dot}`} />
                {state.label}
              </dd>
              <dd className="mt-1 text-xs text-sand/60">{state.note}</dd>
            </div>
            <div>
              <dt className="label-caps text-sand/50">
                {access.state === "not_yet" ? "Opens" : access.state === "expired" ? "Ended" : "Access until"}
              </dt>
              <dd className="mt-2 text-lg text-white">
                {access.state === "not_yet" && access.opensAt
                  ? formatDateTime(access.opensAt)
                  : access.expiresAt
                    ? formatDateTime(access.expiresAt)
                    : "—"}
              </dd>
            </div>
          </dl>

          {!captive && password && (
            <div>
              <p className="label-caps text-sand/50">Password</p>
              <p className="mt-2 flex flex-wrap items-center gap-3">
                <span className="font-mono text-2xl tracking-wide text-sand">{password}</span>
                <Button variant="ghost" size="sm" className="text-gold-200 hover:bg-gold/15 hover:text-white" onClick={() => void copy()}>
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </p>
            </div>
          )}

          {/* ------------------------------------------------- authorise */}
          {access.state === "ready" && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-sand/[0.06] p-4 ring-1 ring-gold/20">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="wifi-device" className="text-sand/80">This device</Label>
                <Input
                  id="wifi-device"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-sand/20 bg-sand/10 text-sand"
                />
              </div>
              <Button onClick={() => void authorize()} disabled={busy}
                className="bg-gold/20 text-gold-200 ring-1 ring-gold/40 hover:bg-gold/30 hover:text-white">
                {busy ? "Authorising…" : "Authorise this device"}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {qr && (
              <Button variant="ghost" className="text-gold-200 ring-1 ring-gold/30 hover:bg-gold/15 hover:text-white" onClick={() => setShowQr(true)}>
                <QrCode aria-hidden />
                Show QR
              </Button>
            )}
            <Button variant="ghost" className="text-gold-200 ring-1 ring-gold/30 hover:bg-gold/15 hover:text-white" onClick={() => setHelp(true)}>
              <HelpCircle aria-hidden />
              Connection help
            </Button>
            {captive && (
              <Button asChild variant="ghost" className="text-gold-200 ring-1 ring-gold/30 hover:bg-gold/15 hover:text-white">
                <Link to="/wifi">Open the Wi-Fi portal</Link>
              </Button>
            )}
          </div>

          {/* ------------------------------------------------- my devices */}
          {devices.length > 0 && (
            <div>
              <hr className="rule-gold mb-4" />
              <p className="label-caps text-sand/50">My devices</p>
              <ul className="mt-3 divide-y divide-sand/10">
                {devices.map((d) => {
                  const Icon = ICON[d.deviceType] ?? Wifi;
                  const on = d.accessStatus === "authorized" && d.status === "active";
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Icon className="size-4 text-gold-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-white">{d.deviceName}</span>
                        <span className="block text-xs text-sand/60">
                          {on ? "Access authorised" : d.accessStatus === "revoked" ? "Access removed — ask the desk" : d.status === "disconnected" ? "Disconnected" : "Expired"}
                          {" · since "}
                          {formatDateTime(d.firstSeenAt)}
                        </span>
                      </span>
                      {on && (
                        <Button variant="ghost" size="sm" className="text-sand/70 hover:bg-sand/10 hover:text-sand" onClick={() => void disconnect(d.id)}>
                          <Unplug aria-hidden />
                          Disconnect
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- QR */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{captive ? "Scan to open the Wi-Fi portal" : `Scan to join ${access.ssid}`}</DialogTitle>
            <DialogDescription>
              {captive
                ? "Join the network, then scan — the portal signs you in with your stay."
                : "Point your camera at the code. Most phones join straight away."}
            </DialogDescription>
          </DialogHeader>
          {qr && <img src={qr} alt="Wi-Fi QR code" className="mx-auto size-64 rounded-lg ring-1 ring-ink/10" />}
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------- help */}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Getting online</DialogTitle>
            <DialogDescription>A few things that fix most problems.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>Join <strong>{access.ssid}</strong> in your phone's Wi-Fi settings.</li>
            {captive ? (
              <li>A sign-in page should open. If it doesn't, open any website, or scan the QR.</li>
            ) : (
              <li>Enter the password shown on this page.</li>
            )}
            <li>Turn Wi-Fi off and on again, and forget the network if it was saved before.</li>
            <li>The signal is strongest indoors and on the verandah.</li>
          </ol>
          <div className="rounded-xl bg-sand-200/60 p-4">
            <p className="text-sm font-medium text-ink">Still not working?</p>
            <p className="mt-1 text-sm text-stone-600">We'll send someone to you.</p>
            <Button className="mt-3" onClick={() => void reportProblem()}>
              Wi-Fi not working? Tell the team
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
