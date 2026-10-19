import { supabase } from "@/services/supabase/client";

/**
 * The OTA channel connection (Channex), as the owner sees it.
 *
 * The API key is write-only from here: saveChannelKey() hands it to the
 * database, which puts it in Vault, and nothing in this file — or anywhere in
 * the app — can read it back. Callers must not keep it in state after saving.
 */

export interface ChannelUnit {
  roomTypeId: string;
  ratePlanId: string;
  villaId: string;
  /** Undefined: the channel unit is the whole villa. */
  roomId?: string;
}

export interface ChannelSettings {
  environment: "staging" | "production";
  propertyId: string;
  mapping: ChannelUnit[];
  syncEnabled: boolean;
  hasApiKey: boolean;
  apiKeyLast4?: string;
  keysUpdatedAt?: string;
  keysUpdatedBy?: string;
  webhookId?: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestMessage: string;
  lastSyncAt?: string;
  lastError: string;
  attention: number;
}

export type ChannelOutcome = "imported" | "updated" | "cancelled" | "ignored" | "conflict" | "unmapped" | "error";

export interface ChannelEvent {
  id: string;
  ota: string;
  externalRef: string;
  outcome: ChannelOutcome;
  message: string;
  bookingId?: string;
  checkIn?: string;
  checkOut?: string;
  guestName: string;
  resolved: boolean;
  at: string;
}

type Row = Record<string, never>;

/** Where the database sends "availability changed": this project's functions. */
export const functionsUrl = () => {
  const url = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_SUPABASE_URL ?? "";
  return url ? `${url.replace(/\/$/, "")}/functions/v1` : "";
};

const message = async (error: unknown, fallback: string) => {
  const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
  return (detail?.error as string) ?? (error as Error)?.message ?? fallback;
};

export async function fetchChannelSettings(): Promise<{ settings?: ChannelSettings; error?: string }> {
  const { data, error } = await supabase.rpc("channel_get_settings");
  if (error) return { error: error.message };
  const x = data as Row;
  return {
    settings: {
      environment: x.environment,
      propertyId: x.property_id,
      mapping: ((x.mapping ?? []) as Row[]).map((m) => ({
        roomTypeId: m.room_type_id,
        ratePlanId: m.rate_plan_id ?? "",
        villaId: m.villa_id,
        roomId: m.room_id ?? undefined,
      })),
      syncEnabled: x.sync_enabled,
      hasApiKey: x.has_api_key,
      apiKeyLast4: x.api_key_last4 ?? undefined,
      keysUpdatedAt: x.keys_updated_at ?? undefined,
      keysUpdatedBy: x.keys_updated_by ?? undefined,
      webhookId: x.webhook_id ?? undefined,
      lastTestAt: x.last_test_at ?? undefined,
      lastTestOk: x.last_test_ok ?? undefined,
      lastTestMessage: x.last_test_message ?? "",
      lastSyncAt: x.last_sync_at ?? undefined,
      lastError: x.last_error ?? "",
      attention: x.attention ?? 0,
    },
  };
}

export async function saveChannelSettings(s: ChannelSettings): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("channel_save_settings", {
    p_environment: s.environment,
    p_property_id: s.propertyId.trim(),
    p_mapping: s.mapping.map((m) => ({
      room_type_id: m.roomTypeId.trim(),
      rate_plan_id: m.ratePlanId.trim(),
      villa_id: m.villaId,
      room_id: m.roomId ?? null,
    })),
    p_sync_enabled: s.syncEnabled,
    p_functions_url: functionsUrl(),
  });
  return error ? { error: error.message } : {};
}

/** Write-only. One request, straight to the vault. */
export async function saveChannelKey(apiKey: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("channel_save_api_key", { p_api_key: apiKey });
  return error ? { error: error.message } : {};
}

export type ChannelAction = "test" | "register_webhook" | "sync_now" | "disconnect";

export async function runChannelAction(
  action: ChannelAction,
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke("channel-sync", { body: { action } });
  if (error) {
    return {
      ok: false,
      message: await message(
        error,
        "The channel-sync function did not answer. Deploy it: npx supabase functions deploy channel-sync --no-verify-jwt",
      ),
    };
  }
  const d = data as { ok?: boolean; message?: string; pulled?: Record<string, number>; pushed?: number };
  if (action === "sync_now") {
    const pulled = Object.entries(d.pulled ?? {}).map(([k, n]) => `${n} ${k}`).join(", ") || "no new bookings";
    return { ok: true, message: `Pulled ${pulled}; sent ${d.pushed ?? 0} availability ranges` };
  }
  return { ok: d.ok ?? true, message: d.message ?? "Done" };
}

export async function fetchChannelEvents(): Promise<{ events?: ChannelEvent[]; error?: string }> {
  const { data, error } = await supabase
    .from("channel_events")
    .select("id, ota, external_ref, outcome, message, booking_id, check_in, check_out, guest_name, resolved, at")
    .order("at", { ascending: false })
    .limit(50);
  if (error) return { error: error.message };
  return {
    events: (data as unknown as Row[]).map((x) => ({
      id: x.id,
      ota: x.ota,
      externalRef: x.external_ref,
      outcome: x.outcome,
      message: x.message,
      bookingId: x.booking_id ?? undefined,
      checkIn: x.check_in ?? undefined,
      checkOut: x.check_out ?? undefined,
      guestName: x.guest_name,
      resolved: x.resolved,
      at: x.at,
    })),
  };
}

export async function resolveChannelEvent(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("channel_events").update({ resolved: true }).eq("id", id);
  return error ? { error: error.message } : {};
}
