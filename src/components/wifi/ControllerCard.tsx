import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, KeyRound, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow, StatusBadge } from "@/components/common";
import { SECRET_COMMANDS, VENDORS } from "@/lib/captiveWifi";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { testController, wifiController } from "@/services/wifi/controller";
import type { ControllerTestResult, ControllerVendor, WifiSettings } from "@/services/wifi/types";

const KINDS: ControllerVendor[] = ["mock", "unifi", "omada", "mikrotik"];

export const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy — select it and copy by hand");
  }
};

/**
 * Which hardware runs the network, and where to reach it.
 *
 * The controller's LOGIN is not a field here on purpose. It would end up in
 * the database and the browser; it lives as an edge-function secret instead,
 * and this card shows the command to set it and whether the function can see it.
 */
export function ControllerCard({
  value,
  onChange,
  dirty,
  canEdit,
  onTested,
}: {
  value: WifiSettings;
  onChange: (next: WifiSettings) => void;
  dirty: boolean;
  canEdit: boolean;
  onTested: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ControllerTestResult | null>(null);
  const real = value.kind !== "mock";
  const set = <K extends keyof WifiSettings>(key: K, v: WifiSettings[K]) => onChange({ ...value, [key]: v });

  const test = async () => {
    setTesting(true);
    const r = await testController();
    setTesting(false);
    setResult(r);
    onTested();
  };

  const portalDefault = typeof window === "undefined" ? "" : `${window.location.origin}/wifi`;
  const usingEdge = wifiController.kind === "edge";

  return (
    <section className="space-y-5 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div>
        <Eyebrow className="text-gold-700">Controller</Eyebrow>
        <p className="mt-1 text-sm text-stone-600">
          The hardware that actually lets a phone onto the internet. The CRM decides who is
          allowed and until when; the controller makes the network obey.
        </p>
      </div>

      <fieldset disabled={!canEdit} className="space-y-5">
        <legend className="sr-only">Controller type</legend>
        <div role="radiogroup" aria-label="Controller type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {KINDS.map((k) => {
            const on = value.kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("kind", k)}
                className={cn(
                  "rounded-xl p-4 text-left ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay",
                  on ? "bg-ink text-sand ring-ink" : "bg-sand/60 text-ink ring-ink/10 hover:ring-gold/50",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{VENDORS[k].label}</span>
                  {on && <CheckCircle2 className="size-4 text-gold-400" aria-hidden />}
                </span>
                <span className={cn("mt-1 block text-xs leading-relaxed", on ? "text-sand/75" : "text-stone-600")}>
                  {VENDORS[k].blurb}
                </span>
              </button>
            );
          })}
        </div>

        {real && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cw-url">Controller address</Label>
              <Input
                id="cw-url"
                inputMode="url"
                value={value.controllerUrl}
                placeholder={
                  value.kind === "mikrotik" ? "https://router.example.com" : "https://controller.example.com:8043"
                }
                onChange={(e) => set("controllerUrl", e.target.value)}
              />
              <p className="text-xs text-stone-600">
                Must start with https:// and present a certificate a normal browser trusts. Use a
                real domain, or put a tunnel (e.g. Cloudflare Tunnel) in front of the controller.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cw-site">Site name</Label>
              <Input
                id="cw-site"
                value={value.site}
                placeholder={value.kind === "omada" ? "Default" : "default"}
                onChange={(e) => set("site", e.target.value)}
              />
            </div>
            {value.kind === "omada" && (
              <div className="space-y-1.5">
                <Label htmlFor="cw-cid">Controller ID (Omada 5.x)</Label>
                <Input
                  id="cw-cid"
                  value={value.controllerId}
                  placeholder="Leave empty on Omada 4.x"
                  onChange={(e) => set("controllerId", e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cw-portal">Sign-in page address (what the controller redirects guests to)</Label>
              <Input
                id="cw-portal"
                inputMode="url"
                value={value.portalUrl}
                placeholder={portalDefault}
                onChange={(e) => set("portalUrl", e.target.value)}
              />
              <p className="text-xs text-stone-600">
                Enter this in the controller's guest-portal setting. It must be public HTTPS.
              </p>
            </div>
          </div>
        )}
      </fieldset>

      {!canEdit && (
        <p className="text-xs text-stone-600">Changing the controller needs the “Configure villa Wi-Fi” permission.</p>
      )}

      {/* ---------------------------------------------------------- secrets */}
      {real && (
        <div className="space-y-3 rounded-lg bg-sand/70 p-4 ring-1 ring-ink/[0.06]">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <KeyRound className="size-4 text-gold-700" aria-hidden />
            The controller login is kept out of the CRM
          </p>
          <p className="text-xs leading-relaxed text-stone-600">
            Create a dedicated account on the controller for the CRM (see the setup guide), then store
            its login as a secret on the server. It never appears in the browser or the database.
          </p>
          <pre className="overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs leading-relaxed text-sand">
            {SECRET_COMMANDS}
          </pre>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(SECRET_COMMANDS, "Commands")}>
            <Copy aria-hidden />
            Copy commands
          </Button>
          {!usingEdge && (
            <p className="text-xs text-ink">
              This build is still using the mock controller in the browser. Set{" "}
              <code className="font-mono">VITE_WIFI_CONTROLLER=edge</code> in the app's environment
              (on Vercel too) and redeploy, or guests' phones will not reach the real controller.
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- test */}
      {real && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void test()} disabled={testing || dirty || !value.controllerUrl}>
              {testing ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
              Test connection
            </Button>
            {dirty && <span className="text-xs text-stone-600">Save your changes first — the test uses what is saved.</span>}
            {!dirty && value.lastTestAt && (
              <StatusBadge
                label={value.lastTestOk ? "Last test passed" : "Last test failed"}
                tone={value.lastTestOk ? "confirmed" : "cancelled"}
              />
            )}
          </div>
          {(result || value.lastTestAt) && !dirty && (
            <div
              role="status"
              className={cn(
                "flex items-start gap-3 rounded-lg p-3 text-sm ring-1",
                (result ? result.ok : value.lastTestOk)
                  ? "bg-status-confirmed-bg text-ink ring-status-confirmed/30"
                  : "bg-status-cancelled-bg text-ink ring-status-cancelled/30",
              )}
            >
              {(result ? result.ok : value.lastTestOk) ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-confirmed" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              )}
              <div className="min-w-0">
                <p>{result?.message ?? value.lastTestMessage}</p>
                {result?.secrets && (
                  <p className="mt-1 text-xs opacity-80">
                    Server secrets: username {result.secrets.user ? "set" : "MISSING"}, password{" "}
                    {result.secrets.password ? "set" : "MISSING"}
                  </p>
                )}
                {!result && value.lastTestAt && (
                  <p className="mt-1 text-xs opacity-80">Tested {formatDateTime(value.lastTestAt)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
