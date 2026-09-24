import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import {
  fetchMyWifiAccess,
  toWifiDevice,
  toWifiSession,
} from "@/services/wifi/controller";
import type { MyWifiAccess, WifiDevice, WifiSession } from "@/services/wifi/types";

/**
 * Wi-Fi rows for staff. RLS returns nothing to anyone without wifi.view, so
 * this needs no role check of its own — an empty list is the answer.
 */
export function useWifiAdmin(villaId?: string) {
  const [devices, setDevices] = useState<WifiDevice[]>([]);
  const [sessions, setSessions] = useState<WifiSession[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    // Anything past its expiry is marked so before it is read.
    await supabase.rpc("wifi_expire_due");
    let d = supabase
      .from("wifi_devices")
      .select("*, wifi_authorizations(status, expires_at, controller, revoked_reason, extended)")
      .order("last_seen_at", { ascending: false });
    let s = supabase.from("wifi_sessions").select("*").order("connected_at", { ascending: false }).limit(500);
    if (villaId) {
      d = d.eq("villa_id", villaId);
      s = s.eq("villa_id", villaId);
    }
    const [dr, sr] = await Promise.all([d, s]);
    setDevices(
      (dr.data ?? []).map((row) => {
        const auth = (row as { wifi_authorizations?: Record<string, never> | Record<string, never>[] })
          .wifi_authorizations;
        const a = Array.isArray(auth) ? auth[0] : auth;
        return {
          ...toWifiDevice(row),
          accessStatus: a?.status,
          expiresAt: a?.expires_at,
          controller: a?.controller ?? "mock",
        };
      }),
    );
    setSessions((sr.data ?? []).map(toWifiSession));
    setLoading(false);
  }, [villaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { devices, sessions, loading, reload };
}

/** The signed-in guest's own access and devices. */
export function useMyWifi() {
  const [access, setAccess] = useState<MyWifiAccess | null>(null);
  const [devices, setDevices] = useState<WifiDevice[]>([]);

  const reload = useCallback(async () => {
    const [a, d] = await Promise.all([
      fetchMyWifiAccess(),
      supabase.from("my_wifi_devices").select("*").order("last_seen_at", { ascending: false }),
    ]);
    setAccess(a);
    setDevices((d.data ?? []).map(toWifiDevice));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { access, devices, reload };
}
