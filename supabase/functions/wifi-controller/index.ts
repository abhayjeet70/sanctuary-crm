/**
 * wifi-controller — where the CRM's Wi-Fi decisions meet the network.
 *
 * Every rule (is this a live stay, whose device is it, until when) is decided
 * by the database functions, called here with the CALLER's JWT so RLS and the
 * permission checks apply exactly as they do from the app. Only once the
 * database has said yes is the controller asked to carry it out.
 *
 * WHICH controller, and where it lives, is read from `wifi_settings` (set on
 * the Captive Wi-Fi page). Its LOGIN is never in the database or the browser:
 *
 *   supabase secrets set WIFI_CONTROLLER_USER=crm-portal WIFI_CONTROLLER_PASSWORD=...
 *
 * Adapters
 *   unifi     UniFi Network (UniFi OS console, or self-hosted Network app)
 *   omada     TP-Link Omada, External Portal Server API
 *   mikrotik  RouterOS 7 hotspot, REST API (bypass bindings)
 *   mock      records nothing beyond what the database already holds
 *
 * The vendor calls below are written from each vendor's published portal API
 * and have NOT been exercised against hardware from this repository. Run
 * "Test connection" on the Captive Wi-Fi page, then authorise one real phone,
 * before relying on it. Vendor firmware changes; adjust here if a call drifts.
 *
 * The controller must present a certificate the edge runtime trusts (a real
 * domain, or a Cloudflare Tunnel in front of it). A self-signed console will
 * fail the TLS handshake and the test will say so.
 *
 * Deploy:  npx supabase functions deploy wifi-controller
 * Enable:  VITE_WIFI_CONTROLLER=edge in the app's environment.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

/* ----------------------------------------------------------------- types */

interface Settings {
  kind: "mock" | "unifi" | "omada" | "mikrotik";
  controller_url: string;
  site: string;
  controller_id: string;
  down_kbps: number | null;
  up_kbps: number | null;
  data_cap_mb: number | null;
}

/** What the browser learned from the controller's redirect to the portal. */
interface PortalParams {
  apMac?: string;
  ssidName?: string;
  radioId?: string;
  gatewayMac?: string;
  vid?: string;
  site?: string;
}

interface Target {
  mac: string;
  expiresAt: string;
  portal?: PortalParams;
}

interface Result {
  ok: boolean;
  error?: string;
  detail?: string;
}

interface Controller {
  kind: string;
  /** Can we reach it and log in? Changes nothing on the network. */
  test(): Promise<Result>;
  authorize(t: Target): Promise<Result>;
  /** Drop access entirely. */
  revoke(t: { mac: string }): Promise<Result>;
  /** End the current session; the device may reconnect. */
  disconnect(t: { mac: string }): Promise<Result>;
}

const cleanMac = (mac: string) => mac.trim().toLowerCase().replace(/-/g, ":");
const minutesUntil = (iso: string) =>
  Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));

const secrets = () => ({
  user: Deno.env.get("WIFI_CONTROLLER_USER") ?? "",
  password: Deno.env.get("WIFI_CONTROLLER_PASSWORD") ?? "",
});

/** fetch with a deadline, so a dead controller is an error, not a hang. */
async function request(url: string, init: RequestInit = {}, ms = 10000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) throw new Error("The controller did not answer within 10 seconds");
    if (/certificate|tls|ssl|unknown ?issuer/i.test(msg)) {
      throw new Error("The controller's TLS certificate is not trusted — use a real domain or a tunnel");
    }
    throw new Error(`Could not reach the controller: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ mock */

const mock: Controller = {
  kind: "mock",
  test: async () => ({ ok: true, detail: "Mock controller — nothing to reach" }),
  authorize: async () => ({ ok: true }),
  revoke: async () => ({ ok: true }),
  disconnect: async () => ({ ok: true }),
};

/* ----------------------------------------------------------------- UniFi */

/**
 * UniFi Network. Logs in as a LOCAL admin (a dedicated "crm-portal" account,
 * not your owner login) and uses the guest manager command:
 *   POST .../api/s/{site}/cmd/stamgr  {cmd:"authorize-guest", mac, minutes, up, down, bytes}
 * On a UniFi OS console the Network app sits behind /proxy/network; on a
 * self-hosted Network app it does not. Both are tried.
 */
function unifi(s: Settings): Controller {
  const base = s.controller_url;
  const site = s.site || "default";

  async function session() {
    const { user, password } = secrets();
    if (!user || !password) throw new Error("WIFI_CONTROLLER_USER / WIFI_CONTROLLER_PASSWORD are not set");
    const attempts = [
      { login: "/api/auth/login", prefix: "/proxy/network" }, // UniFi OS
      { login: "/api/login", prefix: "" }, // self-hosted Network application
    ];
    let last = "";
    for (const a of attempts) {
      const res = await request(base + a.login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password, remember: false }),
      });
      if (res.status === 404) { last = "login endpoint not found"; continue; }
      if (res.status === 401 || res.status === 403) throw new Error("UniFi refused the CRM's login");
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const cookie = res.headers.get("set-cookie") ?? "";
      const csrf = res.headers.get("x-csrf-token") ?? res.headers.get("x-updated-csrf-token") ?? "";
      await res.body?.cancel();
      return { prefix: a.prefix, headers: { Cookie: cookie.split(/,(?=\s*\w+=)/).map((c) => c.split(";")[0]).join("; "), "X-CSRF-Token": csrf, "Content-Type": "application/json" } };
    }
    throw new Error(`Could not log in to UniFi (${last})`);
  }

  async function stamgr(cmd: Record<string, unknown>): Promise<Result> {
    try {
      const sess = await session();
      const res = await request(`${base}${sess.prefix}/api/s/${encodeURIComponent(site)}/cmd/stamgr`, {
        method: "POST", headers: sess.headers, body: JSON.stringify(cmd),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.meta?.rc === "error") {
        return { ok: false, error: `UniFi: ${body?.meta?.msg ?? `HTTP ${res.status}`}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  return {
    kind: "unifi",
    async test() {
      try {
        const sess = await session();
        const res = await request(`${base}${sess.prefix}/api/self/sites`, { headers: sess.headers });
        if (!res.ok) return { ok: false, error: `Logged in, but listing sites failed (HTTP ${res.status})` };
        const body = await res.json();
        const names: string[] = (body?.data ?? []).map((x: { name: string }) => x.name);
        if (!names.includes(site)) {
          return { ok: false, error: `Logged in, but no site called "${site}". Sites: ${names.join(", ") || "none"}` };
        }
        return { ok: true, detail: `Logged in · site "${site}" found` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    authorize: (t) =>
      stamgr({
        cmd: "authorize-guest",
        mac: cleanMac(t.mac),
        minutes: minutesUntil(t.expiresAt),
        ...(s.up_kbps ? { up: s.up_kbps } : {}),
        ...(s.down_kbps ? { down: s.down_kbps } : {}),
        ...(s.data_cap_mb ? { bytes: s.data_cap_mb } : {}),
      }),
    revoke: (t) => stamgr({ cmd: "unauthorize-guest", mac: cleanMac(t.mac) }),
    disconnect: (t) => stamgr({ cmd: "kick-sta", mac: cleanMac(t.mac) }),
  };
}

/* ----------------------------------------------------------------- Omada */

/**
 * TP-Link Omada, External Portal Server API (controller 4.x; 5.x prefixes the
 * controller id, set in Captive Wi-Fi). The CRM logs in as a HOTSPOT OPERATOR
 * — a limited account made under Settings → Hotspot Manager, not an admin —
 * then posts the client's authorisation with an absolute expiry in
 * microseconds.
 */
function omada(s: Settings): Controller {
  const base = s.controller_url + (s.controller_id ? `/${s.controller_id}` : "");
  const site = s.site || "Default";

  async function token(): Promise<string> {
    const { user, password } = secrets();
    if (!user || !password) throw new Error("WIFI_CONTROLLER_USER / WIFI_CONTROLLER_PASSWORD are not set");
    const res = await request(`${base}/api/v2/hotspot/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: user, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.errorCode !== 0 || !body?.result?.token) {
      throw new Error(`Omada refused the hotspot operator login${body?.msg ? `: ${body.msg}` : ""}`);
    }
    return body.result.token as string;
  }

  async function auth(t: Target, expiresAt: string): Promise<Result> {
    try {
      const tok = await token();
      const p = t.portal ?? {};
      // Wireless clients are authorised against their AP and SSID; clients
      // behind the gateway against the gateway and VLAN. Whichever the
      // redirect gave us decides which body is right.
      const common = { clientMac: cleanMac(t.mac).toUpperCase().replace(/:/g, "-"), time: new Date(expiresAt).getTime() * 1000, authType: 4, site: p.site || site };
      const body = p.gatewayMac
        ? { ...common, gatewayMac: p.gatewayMac, vid: Number(p.vid ?? 0) }
        : { ...common, apMac: p.apMac, ssidName: p.ssidName, radioId: Number(p.radioId ?? 0) };
      if (!p.gatewayMac && (!p.apMac || !p.ssidName)) {
        return { ok: false, error: "Omada needs the AP and SSID from the portal redirect — open the portal from the guest network, not directly" };
      }
      const res = await request(`${base}/api/v2/hotspot/extPortal/auth?token=${encodeURIComponent(tok)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      return res.ok && out?.errorCode === 0 ? { ok: true } : { ok: false, error: `Omada: ${out?.msg ?? `HTTP ${res.status}`}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  return {
    kind: "omada",
    async test() {
      try { await token(); return { ok: true, detail: "Hotspot operator login accepted" }; }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    },
    authorize: (t) => auth(t, t.expiresAt),
    // Omada's portal API documents authorising, not revoking. Authorising with
    // an expiry already in the past is the closest equivalent — an assumption
    // to confirm on your controller; if it does not cut access, remove the
    // client from Clients → Block in the Omada UI.
    revoke: (t) => auth({ mac: t.mac, expiresAt: new Date(Date.now() - 60000).toISOString() }, new Date(Date.now() - 60000).toISOString()),
    disconnect: (t) => auth({ mac: t.mac, expiresAt: new Date(Date.now() - 60000).toISOString() }, new Date(Date.now() - 60000).toISOString()),
  };
}

/* -------------------------------------------------------------- MikroTik */

/**
 * RouterOS 7 hotspot over the REST API. A "bypassed" ip-binding lets a MAC
 * through the hotspot without a login, which is exactly "the CRM vouched for
 * this device". MikroTik binds no expiry to it, so the sweep action removes
 * expired bindings — run it on a schedule (see the Captive Wi-Fi page).
 */
function mikrotik(s: Settings): Controller {
  const base = s.controller_url;
  const headers = () => {
    const { user, password } = secrets();
    if (!user || !password) throw new Error("WIFI_CONTROLLER_USER / WIFI_CONTROLLER_PASSWORD are not set");
    return { Authorization: "Basic " + btoa(`${user}:${password}`), "Content-Type": "application/json" };
  };

  async function find(path: string, mac: string): Promise<string[]> {
    const res = await request(`${base}/rest/ip/hotspot/${path}?mac-address=${encodeURIComponent(cleanMac(mac).toUpperCase())}`, { headers: headers() });
    if (!res.ok) throw new Error(`RouterOS: HTTP ${res.status}`);
    return ((await res.json()) as { ".id": string }[]).map((r) => r[".id"]);
  }

  async function removeBinding(mac: string) {
    for (const id of await find("ip-binding", mac)) {
      await request(`${base}/rest/ip/hotspot/ip-binding/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
    }
  }

  async function kick(mac: string) {
    for (const id of await find("active", mac)) {
      await request(`${base}/rest/ip/hotspot/active/remove`, { method: "POST", headers: headers(), body: JSON.stringify({ ".id": id }) });
    }
  }

  return {
    kind: "mikrotik",
    async test() {
      try {
        const res = await request(`${base}/rest/system/identity`, { headers: headers() });
        if (res.status === 401) return { ok: false, error: "RouterOS refused the CRM's login" };
        if (!res.ok) return { ok: false, error: `RouterOS: HTTP ${res.status}` };
        const body = await res.json();
        return { ok: true, detail: `Logged in to "${body?.name ?? "router"}"` };
      } catch (e) { return { ok: false, error: (e as Error).message }; }
    },
    async authorize(t) {
      try {
        await removeBinding(t.mac); // re-authorising must not stack duplicates
        const res = await request(`${base}/rest/ip/hotspot/ip-binding`, {
          method: "PUT", headers: headers(),
          body: JSON.stringify({ "mac-address": cleanMac(t.mac).toUpperCase(), type: "bypassed", server: "all", comment: `crm until ${t.expiresAt}` }),
        });
        return res.ok ? { ok: true } : { ok: false, error: `RouterOS: HTTP ${res.status}` };
      } catch (e) { return { ok: false, error: (e as Error).message }; }
    },
    async revoke(t) {
      try { await removeBinding(t.mac); await kick(t.mac); return { ok: true }; }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    },
    async disconnect(t) {
      try { await kick(t.mac); return { ok: true }; }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    },
  };
}

/* --------------------------------------------------------------- plumbing */

function build(s: Settings): Controller {
  if (s.kind !== "mock" && !s.controller_url) {
    return { ...mock, kind: s.kind, test: async () => ({ ok: false, error: "No controller address is set" }),
      authorize: async () => ({ ok: false, error: "No controller address is set" }),
      revoke: async () => ({ ok: false, error: "No controller address is set" }),
      disconnect: async () => ({ ok: false, error: "No controller address is set" }) };
  }
  switch (s.kind) {
    case "unifi": return unifi(s);
    case "omada": return omada(s);
    case "mikrotik": return mikrotik(s);
    default: return mock;
  }
}

/** Settings are read with the service role: a guest authorising a phone has no
 *  right to read the controller's address, but the function needs it. */
async function loadSettings(): Promise<Settings> {
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data } = await admin.from("wifi_settings").select("*").maybeSingle();
  return (data as Settings) ?? { kind: "mock", controller_url: "", site: "default", controller_id: "", down_kbps: null, up_kbps: null, data_cap_mb: null };
}

async function serviceClient() {
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let body: {
    action?: string;
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    macAddress?: string;
    ipAddress?: string;
    reason?: string;
    until?: string;
    portal?: PortalParams;
  };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }

  const settings = await loadSettings();
  const controller = build(settings);

  switch (body.action) {
    case "authorize": {
      if (!body.deviceName?.trim()) return fail("deviceName is required");
      // The booking is never taken from the request: wifi_authorize derives it
      // from the caller.
      const { data, error } = await supabase.rpc("wifi_authorize", {
        p_device_name: body.deviceName,
        p_device_type: body.deviceType ?? "phone",
        p_mac: body.macAddress ?? null,
        p_ip: body.ipAddress ?? null,
      });
      if (error) return fail(error.message, 403);
      const r = data as { device_id: string; expires_at: string };

      // A real network can only authorise a device it can name. Without the
      // MAC from the controller's redirect the CRM has recorded a decision the
      // network cannot act on — say so rather than pretend.
      if (controller.kind !== "mock" && !body.macAddress) {
        await supabase.rpc("wifi_disconnect", { p_device_id: r.device_id });
        return fail("Open this page from the Wi-Fi network so it can see your device, then try again", 400);
      }

      const done = await controller.authorize({ mac: body.macAddress ?? "", expiresAt: r.expires_at, portal: body.portal });
      if (!done.ok) {
        // The network refused what the CRM allowed. Undo the CRM's record so
        // the two never disagree, and say so.
        await supabase.rpc("wifi_disconnect", { p_device_id: r.device_id });
        return fail(done.error ?? "The Wi-Fi controller refused the device", 502);
      }
      return json({ deviceId: r.device_id, expiresAt: r.expires_at, controller: controller.kind });
    }

    case "extend": {
      if (!body.deviceId || !body.until) return fail("deviceId and until are required");
      const { error } = await supabase.rpc("wifi_extend", { p_device_id: body.deviceId, p_until: body.until });
      if (error) return fail(error.message, 403);
      const { data: device } = await supabase.from("wifi_devices").select("mac_address").eq("id", body.deviceId).maybeSingle();
      if (device?.mac_address && controller.kind !== "mock") {
        const done = await controller.authorize({ mac: device.mac_address, expiresAt: body.until, portal: body.portal });
        if (!done.ok) return fail(`Extended in the CRM, but the controller said: ${done.error}`, 502);
      }
      return json({ controller: controller.kind });
    }

    case "disconnect":
    case "revoke": {
      if (!body.deviceId) return fail("deviceId is required");
      const { data: device } = await supabase
        .from("wifi_devices").select("mac_address").eq("id", body.deviceId).maybeSingle();
      const fn = body.action === "revoke" ? "wifi_revoke" : "wifi_disconnect";
      const args = body.action === "revoke"
        ? { p_device_id: body.deviceId, p_reason: body.reason ?? "" }
        : { p_device_id: body.deviceId };
      const { error } = await supabase.rpc(fn, args);
      if (error) return fail(error.message, 403);
      if (!device?.mac_address && controller.kind !== "mock") {
        return json({ controller: controller.kind, note: "No MAC on file, so the controller was not told" });
      }
      const done = await controller[body.action]({ mac: device?.mac_address ?? "" });
      if (!done.ok) return fail(done.error ?? "The Wi-Fi controller did not confirm", 502);
      return json({ controller: controller.kind });
    }

    case "test": {
      const { data: allowed } = await supabase.rpc("wifi_can", { p_permission: "wifi.configure" });
      if (!allowed) return fail("Testing the controller needs the Configure Wi-Fi permission", 403);
      const { user, password } = secrets();
      const result = await controller.test();
      const message = result.ok ? result.detail ?? "Connected" : result.error ?? "Failed";
      await supabase.rpc("wifi_record_test", { p_ok: result.ok, p_message: message });
      return json({
        ok: result.ok, message, controller: controller.kind,
        // Whether the secrets exist — never their values.
        secrets: { user: Boolean(user), password: Boolean(password) },
      });
    }

    case "sweep": {
      // Tell the controller about everything the database ended on its own:
      // expiries, cancelled bookings, checked-out stays.
      // The scheduled job calls this with the service-role key; a person needs
      // the permission. Comparing the whole header keeps a guest's JWT out.
      const scheduled = req.headers.get("Authorization") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
      if (!scheduled) {
        const { data: allowed } = await supabase.rpc("wifi_can", { p_permission: "wifi.manage" });
        if (!allowed) return fail("Syncing with the controller needs the Extend Wi-Fi permission", 403);
      }
      if (controller.kind === "mock") return json({ released: 0, failed: 0, controller: "mock" });

      const admin = await serviceClient();
      await admin.rpc("wifi_expire_due");
      const { data: rows } = await admin
        .from("wifi_authorizations")
        .select("id, wifi_devices!inner(mac_address)")
        .in("status", ["expired", "revoked"])
        .is("controller_released_at", null)
        .neq("controller", "mock")
        .not("wifi_devices.mac_address", "is", null)
        .limit(200);

      let released = 0;
      let failed = 0;
      for (const row of (rows ?? []) as unknown as { id: string; wifi_devices: { mac_address: string } }[]) {
        const done = await controller.revoke({ mac: row.wifi_devices.mac_address });
        if (done.ok) {
          released++;
          await admin.from("wifi_authorizations").update({ controller_released_at: new Date().toISOString() }).eq("id", row.id);
        } else {
          failed++;
        }
      }
      return json({ released, failed, controller: controller.kind });
    }

    default:
      return fail("action must be authorize, extend, disconnect, revoke, test or sweep");
  }
});
