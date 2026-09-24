/**
 * wifi-controller — where the CRM's Wi-Fi decisions meet the network.
 *
 * Every rule (is this a live stay, whose device is it, until when) is decided
 * by the database functions, called here with the CALLER's JWT so RLS and the
 * permission checks apply exactly as they do from the app. Only once the
 * database has said yes is the controller asked to carry it out.
 *
 * The controller is a mock today: it records nothing beyond what the database
 * already holds and touches no network. A real controller (UniFi, Omada,
 * Mikrotik…) replaces `mockController` below; its credentials live in this
 * function's secrets, never in the browser.
 *
 * Deploy:  npx supabase functions deploy wifi-controller
 * Enable:  VITE_WIFI_CONTROLLER=edge in the app's environment.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

interface ControllerResult {
  ok: boolean;
  controllerSessionId?: string;
  error?: string;
}

interface Controller {
  kind: string;
  authorize(device: { deviceId: string; mac?: string; ip?: string; expiresAt: string }): Promise<ControllerResult>;
  disconnect(device: { deviceId: string; mac?: string }): Promise<ControllerResult>;
  revoke(device: { deviceId: string; mac?: string }): Promise<ControllerResult>;
}

/** Says yes and changes nothing. Honest about it: kind is "mock". */
const mockController: Controller = {
  kind: "mock",
  authorize: async () => ({ ok: true }),
  disconnect: async () => ({ ok: true }),
  revoke: async () => ({ ok: true }),
};

const controller = mockController;

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
  };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }

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
      const done = await controller.authorize({
        deviceId: r.device_id, mac: body.macAddress, ip: body.ipAddress, expiresAt: r.expires_at,
      });
      if (!done.ok) {
        // The network refused what the CRM allowed. Undo the CRM's record so
        // the two never disagree, and say so.
        await supabase.rpc("wifi_disconnect", { p_device_id: r.device_id });
        return fail(done.error ?? "The Wi-Fi controller refused the device", 502);
      }
      return json({ deviceId: r.device_id, expiresAt: r.expires_at, controller: controller.kind });
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
      const done = await controller[body.action]({ deviceId: body.deviceId, mac: device?.mac_address ?? undefined });
      if (!done.ok) return fail(done.error ?? "The Wi-Fi controller did not confirm", 502);
      return json({ controller: controller.kind });
    }

    default:
      return fail("action must be authorize, disconnect or revoke");
  }
});
