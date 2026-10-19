import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Circle, KeyRound, Loader2, PlugZap, RefreshCw, ShieldCheck, Unplug, Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow, LoadingState, PasswordInput } from "@/components/common";
import { useVillas } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  fetchChannelEvents, fetchChannelSettings, resolveChannelEvent, runChannelAction, saveChannelKey,
  saveChannelSettings, type ChannelAction, type ChannelEvent, type ChannelSettings, type ChannelUnit,
} from "@/services/channels";

const CARD = "space-y-4 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]";

/**
 * Settings → Channels. Connect the CRM to a channel manager so OTA bookings
 * arrive on their own and CRM availability goes back out.
 *
 * The API key field is write-only. What is typed is sent once to the vault and
 * the field is emptied; nothing here can show it again, only its last four.
 */
export function ChannelsSettings() {
  const { session } = useSession();
  const villas = useVillas();
  const [saved, setSaved] = useState<ChannelSettings | null>(null);
  const [draft, setDraft] = useState<ChannelSettings | null>(null);
  const [events, setEvents] = useState<ChannelEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<ChannelAction | "save" | "key" | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    const [{ settings, error }, ev] = await Promise.all([fetchChannelSettings(), fetchChannelEvents()]);
    if (error || !settings) return setLoadError(error ?? "Could not load");
    setSaved(settings);
    setDraft(settings);
    setEvents(ev.events ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (session?.role !== "admin") {
    return <p className="text-sm text-stone-600">Only the owner can manage the channel connection.</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-ink ring-1 ring-danger/30">
        {loadError}. Has the channel-sync migration been applied? (npx supabase db push)
      </p>
    );
  }
  if (!draft || !saved) return <LoadingState label="Loading channel settings" />;

  const set = <K extends keyof ChannelSettings>(k: K, v: ChannelSettings[K]) => setDraft({ ...draft, [k]: v });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const unitFor = (villaId: string, roomId?: string) =>
    draft.mapping.find((m) => m.villaId === villaId && m.roomId === roomId);
  const setUnit = (villaId: string, roomId: string | undefined, patch: Partial<ChannelUnit>) => {
    const rest = draft.mapping.filter((m) => !(m.villaId === villaId && m.roomId === roomId));
    const next = { roomTypeId: "", ratePlanId: "", ...unitFor(villaId, roomId), ...patch, villaId, roomId };
    set("mapping", next.roomTypeId.trim() || next.ratePlanId.trim() ? [...rest, next] : rest);
  };

  const save = async (patch: Partial<ChannelSettings> = {}) => {
    setBusy("save");
    const { error } = await saveChannelSettings({ ...draft, ...patch });
    setBusy(null);
    if (error) return toast.error("Not saved", { description: error });
    toast.success("Channel settings saved");
    await load();
  };

  const saveKey = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("key");
    const { error } = await saveChannelKey(apiKey);
    setBusy(null);
    if (error) return toast.error("Key not saved", { description: error });
    setApiKey(""); // gone from memory the moment the vault has it
    toast.success("Key stored in the encrypted vault", { description: "It cannot be viewed again, only replaced." });
    await load();
  };

  const act = async (action: ChannelAction) => {
    setBusy(action);
    const r = await runChannelAction(action);
    setBusy(null);
    (r.ok ? toast.success : toast.error)(r.message);
    await load();
  };

  const mapped = saved.mapping.length > 0;
  const steps = [
    Boolean(saved.propertyId),
    saved.hasApiKey,
    mapped,
    Boolean(saved.lastTestOk && saved.webhookId),
    saved.syncEnabled,
  ];
  const attention = events.filter((e) => !e.resolved && ["conflict", "unmapped", "error"].includes(e.outcome));

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ status */}
      <section className={cn(CARD, "flex flex-wrap items-center justify-between gap-4")}>
        <div className="space-y-1">
          <Eyebrow className="text-gold-700">OTA channel sync</Eyebrow>
          <p className="flex items-center gap-2 font-medium text-ink">
            {saved.syncEnabled ? (
              <><CheckCircle2 aria-hidden className="size-4 text-forest" /> Live: bookings and availability are syncing</>
            ) : (
              <><Circle aria-hidden className="size-4 text-stone" /> Not syncing yet: {steps.filter(Boolean).length} of 5 steps done</>
            )}
          </p>
          <p className="text-xs text-stone-600">
            {saved.lastSyncAt ? `Last sync ${formatDateTime(saved.lastSyncAt)}` : "Never synced"}
            {saved.lastError && <span className="text-danger-700"> · Last error: {saved.lastError}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => act("sync_now")} disabled={!saved.syncEnabled || busy !== null}>
            {busy === "sync_now" ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
            Sync now
          </Button>
          {saved.hasApiKey && (
            <Button variant="outline" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}>
              <Unplug aria-hidden /> Disconnect
            </Button>
          )}
        </div>
      </section>

      {attention.length > 0 && (
        <section className={cn(CARD, "ring-clay/30")} aria-labelledby="ch-attention">
          <h3 id="ch-attention" className="flex items-center gap-2 font-medium text-ink">
            <AlertTriangle aria-hidden className="size-4 text-clay" /> Needs attention ({attention.length})
          </h3>
          <ul className="divide-y divide-ink/[0.06]">
            {attention.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">
                    {e.ota} #{e.externalRef} · {e.guestName}
                    {e.checkIn && e.checkOut && ` · ${formatShortDate(e.checkIn)} to ${formatShortDate(e.checkOut)}`}
                  </p>
                  <p className="text-stone-600">
                    <span className="uppercase tracking-wider text-xs text-clay">{e.outcome}</span> · {e.message}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const { error } = await resolveChannelEvent(e.id);
                    if (error) toast.error(error);
                    else await load();
                  }}
                >
                  Mark resolved
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------- steps */}
      <Step n={1} done={steps[0]} title="Channel manager account">
        <p className="text-sm text-stone-600">
          The CRM connects to <strong>Channex</strong>, which carries bookings to and from Goibibo/MakeMyTrip,
          Booking.com, Airbnb, Agoda and Expedia. Start on <em>Staging</em> (sandbox) and switch to
          <em> Production</em> once a test booking has come through.
        </p>
        <div role="radiogroup" aria-label="Environment" className="flex gap-2">
          {(["staging", "production"] as const).map((env) => (
            <button
              key={env}
              type="button"
              role="radio"
              aria-checked={draft.environment === env}
              onClick={() => set("environment", env)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm capitalize ring-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay",
                draft.environment === env ? "bg-ink text-sand ring-ink" : "bg-sand/60 text-ink ring-ink/10",
              )}
            >
              {env === "staging" ? "Staging (sandbox)" : "Production"}
            </button>
          ))}
        </div>
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="ch-property">Channex property ID</Label>
          <Input
            id="ch-property"
            value={draft.propertyId}
            placeholder="e.g. 716305c4-561a-4561-a187-7f5b8aeb5920"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => set("propertyId", e.target.value)}
          />
          <p className="text-xs text-stone-600">Channex → Properties → your property → the ID in the address bar.</p>
        </div>
      </Step>

      <Step n={2} done={steps[1]} title="API key (stored encrypted, write-only)">
        {saved.hasApiKey && (
          <p className="flex items-center gap-2 text-sm text-ink">
            <ShieldCheck aria-hidden className="size-4 text-forest" />
            Key set · ending <span className="font-mono">••••{saved.apiKeyLast4}</span>
            {saved.keysUpdatedAt && (
              <span className="text-stone-600">· {formatDateTime(saved.keysUpdatedAt)} by {saved.keysUpdatedBy}</span>
            )}
          </p>
        )}
        <form onSubmit={saveKey} className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end" autoComplete="off">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="ch-key">{saved.hasApiKey ? "Replace key" : "Channex API key"}</Label>
            <PasswordInput
              id="ch-key"
              name="channex-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              placeholder="Paste from Channex → Profile → API keys"
            />
          </div>
          <Button type="submit" disabled={apiKey.trim().length < 20 || busy !== null}>
            {busy === "key" ? <Loader2 aria-hidden className="animate-spin" /> : <KeyRound aria-hidden />}
            Save key
          </Button>
        </form>
        <p className="text-xs leading-relaxed text-stone-600">
          Sent once over HTTPS to the encrypted Supabase Vault. It is never saved in this browser and never shown
          again, and only the server uses it. Never share OTA passwords: the CRM does not need them.
        </p>
      </Step>

      <Step n={3} done={steps[2]} title="Map villas and rooms to Channex room types">
        <p className="text-sm text-stone-600">
          A villa in <strong>Whole villa</strong> mode is one Channex room type. A villa <strong>Split into
          rooms</strong> maps each bedroom. Leave a row empty if that unit is not sold online.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-600">
              <tr><th className="py-2 pr-3 font-medium">Unit</th><th className="py-2 pr-3 font-medium">Room type ID</th><th className="py-2 font-medium">Rate plan ID</th></tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.06]">
              {villas.flatMap((v) =>
                (v.mode === "whole" ? [undefined] : v.rooms.map((r) => r.id)).map((roomId) => {
                  const unit = unitFor(v.id, roomId);
                  const label = roomId ? `${v.name} · ${v.rooms.find((r) => r.id === roomId)?.name}` : `${v.name} · Whole villa`;
                  const key = `${v.id}-${roomId ?? "whole"}`;
                  return (
                    <tr key={key}>
                      <td className="py-2 pr-3 text-ink">{label}</td>
                      <td className="py-2 pr-3">
                        <Input aria-label={`${label} room type ID`} value={unit?.roomTypeId ?? ""} autoComplete="off" spellCheck={false}
                          onChange={(e) => setUnit(v.id, roomId, { roomTypeId: e.target.value })} />
                      </td>
                      <td className="py-2">
                        <Input aria-label={`${label} rate plan ID`} value={unit?.ratePlanId ?? ""} autoComplete="off" spellCheck={false}
                          onChange={(e) => setUnit(v.id, roomId, { ratePlanId: e.target.value })} />
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-600">
          Changed a villa's mode? Update the mapping here and in Channex at the same time, or bookings for the
          old unit will arrive as "unmapped".
        </p>
        <Button onClick={() => save()} disabled={!dirty || busy !== null}>
          {busy === "save" && <Loader2 aria-hidden className="animate-spin" />} Save property & mapping
        </Button>
      </Step>

      <Step n={4} done={steps[3]} title="Test the connection and register the webhook">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => act("test")} disabled={!saved.hasApiKey || !saved.propertyId || dirty || busy !== null}>
            {busy === "test" ? <Loader2 aria-hidden className="animate-spin" /> : <PlugZap aria-hidden />} Test connection
          </Button>
          <Button variant="outline" onClick={() => act("register_webhook")} disabled={!saved.lastTestOk || dirty || busy !== null}>
            {busy === "register_webhook" ? <Loader2 aria-hidden className="animate-spin" /> : <Webhook aria-hidden />}
            {saved.webhookId ? "Re-register webhook" : "Register webhook"}
          </Button>
        </div>
        {saved.lastTestMessage && (
          <p role="status" className={cn("text-sm", saved.lastTestOk ? "text-forest" : "text-danger-700")}>
            {saved.lastTestOk ? "✓ " : "✕ "}{saved.lastTestMessage}
            {saved.lastTestAt && <span className="text-stone-600"> · {formatDateTime(saved.lastTestAt)}</span>}
          </p>
        )}
        <p className="text-xs text-stone-600">
          The webhook is created in Channex by the server with a secret header, so new bookings reach the CRM in
          seconds. You don't need to copy anything. {dirty && "Save your changes first."}
        </p>
      </Step>

      <Step n={5} done={steps[4]} title="Turn on sync">
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-ink"
            checked={draft.syncEnabled}
            disabled={!steps[3] || busy !== null}
            onChange={(e) => save({ syncEnabled: e.target.checked })}
          />
          Sync bookings and availability with Channex
        </label>
        <p className="text-xs text-stone-600">
          Whenever a stay is booked, moved or cancelled in the CRM, the OTAs see the change within a minute. OTA
          bookings appear in <Link to="/admin/bookings" className="text-clay underline">Bookings</Link> with their
          channel and reservation code.
        </p>
      </Step>

      <SetupGuide />

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect the channel manager?</DialogTitle>
            <DialogDescription>
              The API key is deleted from the vault, the Channex webhook is removed and syncing stops. Bookings
              already imported stay in the CRM. OTAs keep the last availability they received, so close dates
              in Channex if you are stopping online sales.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>Keep connected</Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={async () => {
                await act("disconnect");
                setConfirmDisconnect(false);
              }}
            >
              {busy === "disconnect" && <Loader2 aria-hidden className="animate-spin" />} Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <section className={CARD} aria-labelledby={`ch-step-${n}`}>
      <h3 id={`ch-step-${n}`} className="flex items-center gap-3 font-medium text-ink">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs",
            done ? "bg-forest text-white" : "bg-sand text-ink ring-1 ring-ink/10",
          )}
        >
          {done ? <CheckCircle2 aria-label="Done" className="size-4" /> : n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

const GUIDE: { q: string; a: ReactNode }[] = [
  {
    q: "1. Create the Channex account",
    a: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Sign up at staging.channex.io (sandbox) first. Production is app.channex.io.</li>
        <li>Properties → Create property: name "Homes of Sanctuary", currency INR, time zone Asia/Kolkata.</li>
        <li>
          Room types: one per villa that is sold whole (Villa Maaya, Villa Praana, Villa Nirvaana, 1 unit each), or
          one per bedroom for a villa sold room by room. Match what the CRM's villa mode says.
        </li>
        <li>Rate plans: at least one per room type (e.g. "Best available, room only").</li>
      </ol>
    ),
  },
  {
    q: "2. Connect each OTA inside Channex (you do this, in your own accounts)",
    a: (
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Goibibo / MakeMyTrip:</strong> in Channex add the "MakeMyTrip/Goibibo" channel, then ask your MMT market manager (or InGo-MMT extranet → Channel Manager) to map the property to Channex. Keep your Hotel Code handy.</li>
        <li><strong>Booking.com:</strong> Extranet → Account → Connectivity provider → search "Channex" → accept. Enter your Hotel ID in Channex.</li>
        <li><strong>Airbnb:</strong> in Channex add the Airbnb channel and sign in through Airbnb's own consent screen. Then pick the listings.</li>
        <li><strong>Agoda / Expedia:</strong> enable Channex as the connectivity partner in each extranet, then add the channel in Channex.</li>
        <li>In every channel, map the OTA rooms to the Channex room types from step 1.</li>
      </ul>
    ),
  },
  {
    q: "3. Get the API key and property ID",
    a: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Channex → your profile (top right) → API keys → Create. Name it "Sanctuary CRM".</li>
        <li>Copy it straight into step 2 above. Don't email it or paste it into chat.</li>
        <li>Property ID: open the property in Channex and copy the long ID from the address bar.</li>
        <li>Room type and rate plan IDs: Channex → Room types / Rate plans → open each → copy its ID into the mapping table.</li>
      </ol>
    ),
  },
  {
    q: "4. Test end to end before going live",
    a: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Test connection → you should see the property's name.</li>
        <li>Register webhook → turn on sync.</li>
        <li>In Channex staging, create a test booking. Within seconds it appears in Bookings with a channel badge.</li>
        <li>Block or book dates in the CRM. In Channex → Inventory, those dates show 0 availability.</li>
        <li>Cancel the test booking in Channex. It's cancelled in the CRM too.</li>
        <li>Switch the environment to Production, enter the production key and repeat steps 1–2.</li>
      </ol>
    ),
  },
  {
    q: "Troubleshooting",
    a: (
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>"Unmapped":</strong> the OTA sold a room type with no row in the mapping. Add it, then enter that booking by hand.</li>
        <li><strong>"Conflict":</strong> the dates were already held in the CRM, usually a phone booking that reached the OTA late. Move or cancel one of the stays, then cancel the OTA reservation in its extranet if needed.</li>
        <li><strong>Test fails with 401:</strong> wrong key, or a staging key used with Production (or the other way round).</li>
        <li><strong>Nothing arrives:</strong> re-register the webhook, then press Sync now. It pulls anything missed.</li>
        <li><strong>Key leaked or a staff member left:</strong> delete the key in Channex, create a new one and paste it here. The old one stops working at once.</li>
      </ul>
    ),
  },
  {
    q: "Security: what we store and what we never ask for",
    a: (
      <ul className="list-disc space-y-1 pl-5">
        <li>The API key is encrypted in Supabase Vault. Only the server can read it, never this page or any staff screen.</li>
        <li>Only the owner account can see or change these settings. Every change is written to the Activity log, without the key.</li>
        <li>Incoming webhooks must carry a secret token created by the server, and their content is re-fetched from Channex rather than trusted.</li>
        <li>We never need your Goibibo, Booking.com or Airbnb passwords. Those connections are approved inside each OTA.</li>
        <li>Guest data from OTAs is limited to what a booking needs: name, email, phone and stay details.</li>
      </ul>
    ),
  },
  {
    q: "No channel manager? The iCal fallback (Airbnb / Booking.com only)",
    a: (
      <p>
        Airbnb and Booking.com can exchange calendar (.ics) links. These carry blocked dates only, with no guest
        names or prices, and they refresh every few hours, so double bookings are still possible. Goibibo/MMT doesn't
        support iCal. Use this only as a stopgap until the Channex connection is live.
      </p>
    ),
  },
];

function SetupGuide() {
  return (
    <section className={CARD} aria-labelledby="ch-guide">
      <h3 id="ch-guide" className="font-medium text-ink">Setup guide</h3>
      <div className="divide-y divide-ink/[0.06]">
        {GUIDE.map((g) => (
          <details key={g.q} className="group py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:hidden focus-visible:outline-2 focus-visible:outline-clay">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
              {g.q}
            </summary>
            <div className="mt-2 pl-5 text-sm leading-relaxed text-stone-600">{g.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
