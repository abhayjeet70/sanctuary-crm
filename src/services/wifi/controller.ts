import { supabase } from "@/services/supabase/client";
import type {
  ControllerKind,
  ControllerTestResult,
  MyWifiAccess,
  WifiController,
  WifiControllerResult,
  WifiDevice,
  WifiSession,
  WifiSettings,
} from "./types";

/* ------------------------------------------------------------- mappers */

type Row = Record<string, never>;

export const toWifiDevice = (row: unknown): WifiDevice => {
  const x = row as Row;
  return {
    id: x.id,
    bookingId: x.booking_id,
    villaId: x.villa_id,
    guestId: x.guest_id ?? undefined,
    userId: x.user_id ?? undefined,
    deviceName: x.device_name,
    deviceType: x.device_type,
    macAddress: x.mac_address ?? undefined,
    ipAddress: x.ip_address ?? undefined,
    status: x.status,
    firstSeenAt: x.first_seen_at,
    lastSeenAt: x.last_seen_at,
    accessStatus: x.access_status ?? undefined,
    expiresAt: x.expires_at ?? undefined,
    controller: x.controller ?? "mock",
  };
};

export const toWifiSession = (row: unknown): WifiSession => {
  const x = row as Row;
  return {
    id: x.id,
    deviceId: x.device_id,
    bookingId: x.booking_id,
    villaId: x.villa_id,
    connectedAt: x.connected_at,
    disconnectedAt: x.disconnected_at ?? undefined,
    lastSeenAt: x.last_seen_at,
    expiresAt: x.expires_at,
    status: x.status,
    controller: x.controller,
    controllerSessionId: x.controller_session_id ?? undefined,
  };
};

export const toMyAccess = (row: unknown): MyWifiAccess => {
  const x = (row ?? {}) as Row;
  return {
    state: x.state ?? "unavailable",
    reason: x.reason,
    bookingId: x.booking_id,
    bookingReference: x.booking_reference,
    villaId: x.villa_id,
    villaName: x.villa_name,
    ssid: x.ssid,
    captivePortal: x.captive_portal,
    controller: x.controller,
    opensAt: x.opens_at,
    expiresAt: x.expires_at,
  };
};

/* ---------------------------------------------------------- controllers */

/**
 * The development controller.
 *
 * It calls the database functions that decide and record access, and does
 * nothing else — there is no network behind it. Every row it produces carries
 * `controller = 'mock'`, and the UI says "Access authorised · Controller: Mock",
 * never "connected to the internet".
 */
export class MockWifiController implements WifiController {
  readonly kind: ControllerKind = "mock";

  async authorizeDevice(input: Parameters<WifiController["authorizeDevice"]>[0]): Promise<WifiControllerResult> {
    const { data, error } = await supabase.rpc("wifi_authorize", {
      p_device_name: input.deviceName,
      p_device_type: input.deviceType ?? "phone",
      p_mac: input.macAddress ?? null,
      p_ip: input.ipAddress ?? null,
    });
    if (error) return { ok: false, error: error.message, controller: this.kind };
    const r = data as { device_id: string; expires_at: string };
    return { ok: true, deviceId: r.device_id, expiresAt: r.expires_at, controller: this.kind };
  }

  async extendDevice(input: Parameters<WifiController["extendDevice"]>[0]): Promise<WifiControllerResult> {
    const { error } = await supabase.rpc("wifi_extend", {
      p_device_id: input.deviceId,
      p_until: new Date(input.until).toISOString(),
    });
    return error ? { ok: false, error: error.message, controller: this.kind } : { ok: true, controller: this.kind };
  }

  async revokeDevice(input: Parameters<WifiController["revokeDevice"]>[0]): Promise<WifiControllerResult> {
    const { error } = await supabase.rpc("wifi_revoke", {
      p_device_id: input.deviceId,
      p_reason: input.reason ?? "",
    });
    return error ? { ok: false, error: error.message, controller: this.kind } : { ok: true, controller: this.kind };
  }

  async disconnectDevice(input: Parameters<WifiController["disconnectDevice"]>[0]): Promise<WifiControllerResult> {
    const { error } = await supabase.rpc("wifi_disconnect", { p_device_id: input.deviceId });
    return error ? { ok: false, error: error.message, controller: this.kind } : { ok: true, controller: this.kind };
  }

  async getConnectedDevices(input: Parameters<WifiController["getConnectedDevices"]>[0]): Promise<WifiDevice[]> {
    let query = supabase.from("wifi_devices").select("*").eq("status", "active");
    if (input.villaId) query = query.eq("villa_id", input.villaId);
    const { data } = await query;
    return (data ?? []).map(toWifiDevice);
  }

  async getSession(input: Parameters<WifiController["getSession"]>[0]): Promise<WifiSession | null> {
    const { data } = await supabase
      .from("wifi_sessions")
      .select("*")
      .eq("device_id", input.deviceId)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? toWifiSession(data) : null;
  }
}

/**
 * The same operations routed through the `wifi-controller` edge function —
 * where a real controller's credentials and network calls will live. Reads
 * still come straight from the database under RLS; only writes go through it.
 */
export class EdgeWifiController extends MockWifiController {
  override readonly kind: ControllerKind = "edge";

  private async invoke(action: string, body: Record<string, unknown>): Promise<WifiControllerResult> {
    const { data, error } = await supabase.functions.invoke("wifi-controller", {
      body: { action, ...body },
    });
    if (error) {
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { ok: false, error: detail?.error ?? error.message, controller: this.kind };
    }
    return { ok: true, controller: this.kind, ...(data as object) };
  }

  override authorizeDevice(input: Parameters<WifiController["authorizeDevice"]>[0]) {
    return this.invoke("authorize", { ...input });
  }
  override extendDevice(input: Parameters<WifiController["extendDevice"]>[0]) {
    return this.invoke("extend", { ...input, until: new Date(input.until).toISOString() });
  }
  override revokeDevice(input: Parameters<WifiController["revokeDevice"]>[0]) {
    return this.invoke("revoke", { ...input });
  }
  override disconnectDevice(input: Parameters<WifiController["disconnectDevice"]>[0]) {
    return this.invoke("disconnect", { ...input });
  }
}

/**
 * Which one the app uses. `VITE_WIFI_CONTROLLER=edge` once the edge function
 * is deployed; the mock otherwise. The choice is shown on screen, so nobody
 * reads a mock authorisation as a live network.
 */
export const wifiController: WifiController =
  ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_WIFI_CONTROLLER === "edge"
    ? new EdgeWifiController()
    : new MockWifiController();

/** The caller's own access, for the guest portal. */
export async function fetchMyWifiAccess(): Promise<MyWifiAccess> {
  const { data, error } = await supabase.rpc("wifi_my_access");
  if (error) return { state: "unavailable", reason: error.message };
  return toMyAccess(data);
}

/* --------------------------------------------------------------- settings */

const toSettings = (row: unknown): WifiSettings => {
  const x = row as Record<string, never>;
  return {
    kind: x.kind ?? "mock",
    controllerUrl: x.controller_url ?? "",
    site: x.site ?? "default",
    controllerId: x.controller_id ?? "",
    portalUrl: x.portal_url ?? "",
    graceMinutes: Number(x.grace_minutes ?? 0),
    earlyHours: Number(x.early_hours ?? 0),
    maxDevices: Number(x.max_devices ?? 8),
    downKbps: x.down_kbps ?? null,
    upKbps: x.up_kbps ?? null,
    dataCapMb: x.data_cap_mb ?? null,
    lastTestAt: x.last_test_at ?? undefined,
    lastTestOk: x.last_test_ok ?? undefined,
    lastTestMessage: x.last_test_message ?? "",
  };
};

/** Needs wifi.configure; the database refuses anyone else. */
export async function fetchWifiSettings(): Promise<{ settings?: WifiSettings; error?: string }> {
  const { data, error } = await supabase.rpc("wifi_get_settings");
  return error ? { error: error.message } : { settings: toSettings(data) };
}

export async function saveWifiSettings(s: WifiSettings): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("wifi_save_settings", {
    p_kind: s.kind,
    p_controller_url: s.controllerUrl,
    p_site: s.site,
    p_controller_id: s.controllerId,
    p_portal_url: s.portalUrl,
    p_grace_minutes: s.graceMinutes,
    p_early_hours: s.earlyHours,
    p_max_devices: s.maxDevices,
    p_down_kbps: s.downKbps,
    p_up_kbps: s.upKbps,
    p_data_cap_mb: s.dataCapMb,
  });
  return error ? { error: error.message } : {};
}

/** Log in to the controller and report. Changes nothing on the network. */
export async function testController(): Promise<ControllerTestResult> {
  const { data, error } = await supabase.functions.invoke("wifi-controller", { body: { action: "test" } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return {
      ok: false,
      message:
        detail?.error ??
        "The wifi-controller function did not answer. Deploy it first: npx supabase functions deploy wifi-controller",
    };
  }
  return data as ControllerTestResult;
}

/** Tell the controller about accesses the database ended on its own. */
export async function syncController(): Promise<{ released?: number; failed?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("wifi-controller", { body: { action: "sweep" } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return { error: detail?.error ?? error.message };
  }
  return data as { released: number; failed: number };
}
