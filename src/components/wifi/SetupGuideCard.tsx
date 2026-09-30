import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eyebrow } from "@/components/common";
import { copy } from "@/components/wifi/ControllerCard";
import { useMockData } from "@/hooks/useData";
import { SETUP_GUIDE, SWEEP_SQL, VENDORS, walledGarden } from "@/lib/captiveWifi";
import { wifiController } from "@/services/wifi/controller";
import type { ControllerVendor, WifiSettings } from "@/services/wifi/types";

const TAB =
  "data-[state=active]:bg-ink data-[state=active]:text-sand data-[state=active]:shadow-soft rounded-lg px-3 py-1.5 text-stone-600 hover:text-ink";

const MANUAL = [
  { id: "wall", label: "Walled-garden entries added on the controller" },
  { id: "isolate", label: "Client isolation and a separate VLAN on every guest network" },
  { id: "sweep", label: "Expiry sweep scheduled (needed for MikroTik; a safety net for the others)" },
  { id: "phone", label: "One real phone signed in end to end, on a real stay" },
] as const;

const STORE = "captive-wifi-checklist";
const readTicks = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
};

/** What is left before guests can use it, from what the CRM can actually see. */
function useReadiness(settings: WifiSettings | null) {
  const { villas } = useMockData();
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => setTicks(readTicks()), []);
  const tick = (id: string) => {
    const next = { ...ticks, [id]: !ticks[id] };
    setTicks(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* private window: the tick simply does not persist */
    }
  };

  const real = settings && settings.kind !== "mock";
  const auto: { id: string; label: string; ok: boolean; hint?: string }[] = [
    { id: "kind", label: "A controller type is chosen", ok: Boolean(real), hint: "Controller tab" },
    { id: "url", label: "The controller address is set (https)", ok: Boolean(real && /^https:\/\//i.test(settings?.controllerUrl ?? "")), hint: "Controller tab" },
    { id: "edge", label: "The app uses the server-side controller (VITE_WIFI_CONTROLLER=edge)", ok: wifiController.kind === "edge", hint: "Environment + redeploy" },
    { id: "test", label: "Test connection passed", ok: Boolean(real && settings?.lastTestOk), hint: "Controller tab" },
    { id: "villas", label: "Every villa has a network name and VLAN", ok: villas.length > 0 && villas.every((v) => (v.wifiNetwork ?? "").trim() && v.wifiVlanId), hint: "Villa networks tab" },
    { id: "portal", label: "Guests sign in through the captive portal at every villa", ok: villas.length > 0 && villas.every((v) => v.captivePortalEnabled), hint: "Villa networks tab" },
  ];
  const manual = MANUAL.map((m) => ({ ...m, ok: Boolean(ticks[m.id]) }));
  const done = auto.filter((a) => a.ok).length + manual.filter((m) => m.ok).length;
  return { auto, manual, tick, done, total: auto.length + manual.length };
}

export function SetupGuideCard({ settings }: { settings: WifiSettings | null }) {
  const readiness = useReadiness(settings);
  const [guide, setGuide] = useState<Exclude<ControllerVendor, "mock">>(
    settings && settings.kind !== "mock" ? settings.kind : "unifi",
  );
  const supabaseUrl = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_SUPABASE_URL ?? "";
  const portal = settings?.portalUrl || (typeof window === "undefined" ? "" : window.location.origin);
  const garden = useMemo(() => walledGarden(portal, supabaseUrl), [portal, supabaseUrl]);
  const ready = readiness.done === readiness.total;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------- readiness */}
      <section className="space-y-4 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow className="text-gold-700">Ready for guests?</Eyebrow>
          <p className="text-sm font-medium tabular-nums text-ink">{ready ? "Ready · " : ""}
            {readiness.done} of {readiness.total} done
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-sand-200" role="presentation">
          <div className="h-full bg-gold" style={{ width: `${(readiness.done / readiness.total) * 100}%` }} />
        </div>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          {readiness.auto.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 text-sm">
              {a.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-confirmed" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-stone" aria-label="Not done" />
              )}
              <span className={a.ok ? "text-stone-600" : "text-ink"}>
                {a.label}
                {!a.ok && a.hint && <span className="text-stone-600"> — {a.hint}</span>}
              </span>
            </li>
          ))}
          {readiness.manual.map((m) => (
            <li key={m.id}>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={m.ok}
                  onChange={() => readiness.tick(m.id)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-clay)]"
                />
                <span className={m.ok ? "text-stone-600" : "text-ink"}>{m.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-stone-600">
          The first six are read from the CRM. The last four are yours to tick once done; they are kept in this browser only.
        </p>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
        <Eyebrow className="text-gold-700">How a guest gets online</Eyebrow>
        <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Join", "The guest joins the villa's network. It is open, but the controller lets nothing through yet."],
            ["Redirect", "Their phone tests the internet, is turned back, and opens the sign-in page carrying their device's MAC address."],
            ["Check the stay", "They sign in with their Guest ID. The CRM finds a live booking at that villa and decides how long they may stay on."],
            ["Authorise", "The CRM tells the controller to let that device through until checkout. When the time comes, or the booking is cancelled, access ends."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-lg bg-sand/60 p-4">
              <p className="font-display text-2xl text-gold-700">{i + 1}</p>
              <p className="mt-1 font-medium text-ink">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ steps */}
      <section className="space-y-4 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
        <Eyebrow className="text-gold-700">Set up your controller</Eyebrow>
        <Tabs value={guide} onValueChange={(v) => setGuide(v as typeof guide)} className="gap-4">
          <TabsList className="h-auto flex-wrap justify-start gap-1 p-1.5">
            {(Object.keys(SETUP_GUIDE) as (keyof typeof SETUP_GUIDE)[]).map((k) => (
              <TabsTrigger key={k} value={k} className={TAB}>{VENDORS[k].label}</TabsTrigger>
            ))}
          </TabsList>
          {(Object.keys(SETUP_GUIDE) as (keyof typeof SETUP_GUIDE)[]).map((k) => (
            <TabsContent key={k} value={k}>
              <p className="mb-3 text-xs text-stone-600">Uses: {VENDORS[k].portalApi}</p>
              <ol className="space-y-3">
                {SETUP_GUIDE[k].map((s, i) => (
                  <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-ink text-xs font-medium text-sand">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{s.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-stone-600">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>
          ))}
        </Tabs>
        <p className="rounded-lg bg-sand/70 p-3 text-xs leading-relaxed text-stone-600">
          The controller calls in the CRM follow each vendor's published portal interface but have not been run against your
          hardware from here. Use Test connection, then sign one real phone in before opening it to guests. Menu names
          shift between firmware versions.
        </p>
      </section>

      {/* ----------------------------------------------------- walled garden */}
      <section className="space-y-3 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow className="text-gold-700">Walled garden — allow before sign-in</Eyebrow>
          <Button variant="outline" size="sm" onClick={() => void copy(garden.map((g) => g.host).join("\n"), "Host list")}>
            <Copy aria-hidden />
            Copy all
          </Button>
        </div>
        <p className="text-sm text-stone-600">
          A phone that is not signed in can reach only these. Block one and the sign-in page fails to open —
          usually on one make of phone only.
        </p>
        <div className="relative overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {garden.map((g) => (
                <TableRow key={g.host}>
                  <TableCell className="font-mono text-xs">{g.host}</TableCell>
                  <TableCell className="text-sm text-stone-600">{g.why}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ------------------------------------------------------------ sweep */}
      <section className="space-y-3 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
        <Eyebrow className="text-gold-700">Keeping the network in step</Eyebrow>
        <p className="text-sm leading-relaxed text-stone-600">
          UniFi and Omada end a session on their own at the time the CRM gave them. But the CRM also ends access when
          a booking is cancelled or checked out early, and MikroTik has no built-in expiry at all. A scheduled sweep
          tells the controller about all of those. Press <strong className="text-ink">Sync with controller</strong> on
          the Devices tab to do it by hand, or schedule it:
        </p>
        <pre className="overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs leading-relaxed text-sand">{SWEEP_SQL}</pre>
        <Button variant="outline" size="sm" onClick={() => void copy(SWEEP_SQL, "SQL")}>
          <Copy aria-hidden />
          Copy SQL
        </Button>
        <p className="text-xs text-stone-600">
          Replace the two placeholders. The service-role key is a secret: paste it into the Supabase SQL editor only, never into the CRM or a chat.
        </p>
      </section>

      {/* ---------------------------------------------------------- guests */}
      <section className="rounded-xl bg-sand/70 p-6 ring-1 ring-ink/[0.06]">
        <Eyebrow className="text-gold-700">What guests and staff should know</Eyebrow>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink">
          <li>Modern phones use a private (randomised) Wi-Fi address per network. The CRM authorises the address the phone shows for that network, so if a guest forgets the network or turns the setting off, they sign in again.</li>
          <li>A guest who changes phone, or a new device on the same stay, signs in once more. Every device counts against the per-stay limit.</li>
          <li>If sign-in will not open on one phone, check the walled-garden list first, then ask the guest to turn off any VPN or private DNS.</li>
          <li>Keep a written record of who was online: the CRM stores each session with its device and time. Confirm with your ISP or a lawyer how long Indian rules require you to keep it.</li>
        </ul>
      </section>
    </div>
  );
}
