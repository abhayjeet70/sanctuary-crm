/**
 * channel-sync — the CRM ↔ channel manager (Channex) bridge.
 *
 * Three kinds of caller, each authenticated differently:
 *
 *   the owner      (Settings → Channels)  JWT; must pass channel_get_settings(),
 *                  which the database refuses to anyone but the owner.
 *                  actions: test, register_webhook, sync_now, disconnect
 *   Channex        webhook; header x-channel-token must equal the vault token.
 *                  The body is NOT trusted: it only says "something changed",
 *                  and we pull the revisions from Channex with our own key.
 *   the database   pg_net trigger on booking_rooms; x-channel-token must equal
 *                  the internal vault token. action: push
 *
 * Unlike the other functions this one holds a service-role client. It has to:
 * the webhook and the trigger carry no user, and the secrets are readable by
 * service_role alone. It is used only after one of the checks above passes.
 *
 * Keys never leave this function: no response contains one, and every
 * response is Cache-Control: no-store.
 *
 * The Channex calls follow its published API (api/v1: properties, webhooks,
 * booking_revisions/feed + ack, availability). Test against the staging
 * environment before switching to production. If Channex changes a field,
 * adjust normalise() below.
 *
 * Deploy:  npx supabase functions deploy channel-sync --no-verify-jwt
 *          (JWTs are checked here, per caller, because Channex sends none.)
 */
import { callerClient, corsHeaders } from "../_shared/cors.ts";
import { safeEqual, toRanges, type DayAvailability } from "./ranges.ts";

const BASE = {
  staging: "https://staging.channex.io/api/v1",
  production: "https://app.channex.io/api/v1",
} as const;
const PUSH_DAYS = 365;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

interface Config {
  environment: keyof typeof BASE;
  property_id: string;
  sync_enabled: boolean;
  functions_url: string;
  webhook_id: string | null;
}

async function serviceClient() {
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}
type Admin = Awaited<ReturnType<typeof serviceClient>>;

async function secret(db: Admin, name: "api_key" | "webhook" | "internal") {
  const { data } = await db.rpc("channel_secret", { p_name: name });
  return (data as string | null) ?? "";
}

async function channex(cfg: Config, key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE[cfg.environment]}${path}`, {
    ...init,
    headers: { "user-api-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Channex echoes the request in some errors; keep only its message.
    const msg = body?.errors?.title ?? body?.errors?.details ?? res.statusText;
    throw new Error(`Channex ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return body;
}

/* ------------------------------------------------------------------ push */

async function push(db: Admin, cfg: Config, key: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.rpc("channel_availability", { p_from: today, p_days: PUSH_DAYS });
  if (error) throw new Error(error.message);
  const ranges = toRanges((data ?? []) as DayAvailability[]);
  if (!ranges.length) return 0;
  await channex(cfg, key, "/availability", {
    method: "POST",
    body: JSON.stringify({ values: ranges.map((r) => ({ property_id: cfg.property_id, ...r })) }),
  });
  return ranges.length;
}

/* ------------------------------------------------------------------ pull */

// deno-lint-ignore no-explicit-any
function normalise(rev: any) {
  const a = rev.attributes ?? {};
  const c = a.customer ?? {};
  // deno-lint-ignore no-explicit-any
  const rooms: any[] = a.rooms ?? [];
  return {
    revision_id: rev.id,
    channel_booking_id: a.booking_id,
    ota: a.ota_name ?? "",
    external_ref: a.ota_reservation_code ?? "",
    status: a.status, // new | modified | cancelled
    check_in: a.arrival_date,
    check_out: a.departure_date,
    adults: rooms.reduce((n, r) => n + (r.occupancy?.adults ?? 0), 0) || 1,
    children: rooms.reduce((n, r) => n + (r.occupancy?.children ?? 0), 0),
    room_type_ids: rooms.map((r) => r.room_type_id).filter(Boolean),
    amount: Number(a.amount ?? 0),
    guest_name: [c.name, c.surname].filter(Boolean).join(" "),
    guest_email: c.mail ?? "",
    guest_phone: c.phone ?? "",
    notes: a.notes ?? "",
  };
}

/** Pull every unacknowledged revision, import it, acknowledge it. */
async function pull(db: Admin, cfg: Config, key: string) {
  const feed = await channex(cfg, key, `/booking_revisions/feed?filter[property_id]=${cfg.property_id}`);
  const counts: Record<string, number> = {};
  for (const rev of feed.data ?? []) {
    const { data, error } = await db.rpc("channel_ingest_booking", { p: normalise(rev) });
    const outcome = error ? "error" : (data as { outcome: string }).outcome;
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    // Errors stay unacknowledged so Channex sends them again; conflicts are
    // acknowledged because they wait on the owner, not on a retry.
    if (!error && outcome !== "error") {
      await channex(cfg, key, `/booking_revisions/${rev.id}/ack`, { method: "POST" });
    }
  }
  return counts;
}

/* --------------------------------------------------------------- handler */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Use POST" }, 405);

  const db = await serviceClient();
  const { data: cfgRow } = await db.rpc("channel_config");
  const cfg = cfgRow as Config;
  const token = req.headers.get("x-channel-token");

  try {
    /* ---- machine callers: Channex webhook, database trigger */
    if (token !== null) {
      const body = await req.json().catch(() => ({}));
      const isPush = body?.action === "push";
      const expected = await secret(db, isPush ? "internal" : "webhook");
      if (!expected || !safeEqual(token, expected)) return reply({ error: "Unauthorised" }, 401);
      if (!cfg.sync_enabled) return reply({ ok: true, skipped: "sync is off" });
      const key = await secret(db, "api_key");
      if (!key) return reply({ error: "No API key" }, 409);

      const result = isPush ? { pushed: await push(db, cfg, key) } : { pulled: await pull(db, cfg, key) };
      await db.rpc("channel_record", { p_kind: "sync", p_ok: true, p_message: "" });
      return reply({ ok: true, ...result });
    }

    /* ---- the owner */
    const caller = await callerClient(req);
    if (!caller) return reply({ error: "Sign in first" }, 401);
    const { error: notOwner } = await caller.rpc("channel_get_settings");
    if (notOwner) return reply({ error: "Only the owner can manage the channel connection" }, 403);

    const { action } = await req.json().catch(() => ({}));
    const key = await secret(db, "api_key");

    if (action === "disconnect") {
      if (key && cfg.webhook_id) {
        await channex(cfg, key, `/webhooks/${cfg.webhook_id}`, { method: "DELETE" }).catch(() => null);
      }
      const { error } = await caller.rpc("channel_disconnect");
      return error ? reply({ error: error.message }, 400) : reply({ ok: true });
    }

    if (!key) return reply({ error: "Save the API key first" }, 409);
    if (!cfg.property_id) return reply({ error: "Save the Channex property ID first" }, 409);

    if (action === "test") {
      try {
        const p = await channex(cfg, key, `/properties/${cfg.property_id}`);
        const title = p?.data?.attributes?.title ?? "property";
        const message = `Connected to "${title}" (${cfg.environment})`;
        await db.rpc("channel_record", { p_kind: "test", p_ok: true, p_message: message });
        return reply({ ok: true, message });
      } catch (e) {
        const message = (e as Error).message;
        await db.rpc("channel_record", { p_kind: "test", p_ok: false, p_message: message });
        return reply({ ok: false, message });
      }
    }

    if (action === "register_webhook") {
      if (!cfg.functions_url) return reply({ error: "Save the settings first" }, 409);
      if (cfg.webhook_id) {
        await channex(cfg, key, `/webhooks/${cfg.webhook_id}`, { method: "DELETE" }).catch(() => null);
      }
      const hook = await channex(cfg, key, "/webhooks", {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            property_id: cfg.property_id,
            callback_url: `${cfg.functions_url}/channel-sync`,
            event_mask: "booking",
            headers: { "x-channel-token": await secret(db, "webhook") },
            request_params: {},
            is_active: true,
            send_data: false,
          },
        }),
      });
      const id = hook?.data?.id as string | undefined;
      await db.rpc("channel_record", {
        p_kind: "test", p_ok: true, p_message: "Webhook registered", p_webhook_id: id ?? null,
      });
      return reply({ ok: true, message: "Webhook registered" });
    }

    if (action === "sync_now") {
      const pulled = await pull(db, cfg, key);
      const pushed = await push(db, cfg, key);
      await db.rpc("channel_record", { p_kind: "sync", p_ok: true, p_message: "" });
      return reply({ ok: true, pulled, pushed });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (e) {
    const message = (e as Error).message;
    await db.rpc("channel_record", { p_kind: "sync", p_ok: false, p_message: message });
    return reply({ error: message }, 502);
  }
});
