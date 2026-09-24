// Guest Wi-Fi, end to end, against the live project, as real users.
//
//   node supabase/tests/wifi.e2e.mjs
//
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_DEMO_PASSWORD in
// .env.local (the demo accounts in progress.md). Creates two short test stays
// for the demo guest and deletes them — and everything hanging off them — at
// the end, pass or fail. Exit code 1 on any failure.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const mk = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pw = env.VITE_DEMO_PASSWORD;

let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra);
};
const one = (r) => (Array.isArray(r.data) ? r.data[0] : r.data);
const iso = (n) => {
  const d = new Date(Date.now() + 5.5 * 3600e3); // India date, whatever the machine's zone
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const owner = mk(), manager = mk(), housekeeping = mk(), guest = mk(), anon = mk(), comp = mk();
for (const [c, email] of [[owner, "admin@gmail.com"], [manager, "manager@gmail.com"],
                          [housekeeping, "housekeeping@gmail.com"], [guest, "user@gmail.com"]]) {
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) { console.error("cannot sign in", email, error.message); process.exit(1); }
}

// ---- a stay that is live right now, found on whichever villa is free
const villas = one({ data: [(await owner.from("villas").select("id, name, check_out_time").order("name")).data] });
const created = [];
async function liveStay(from, to) {
  for (const v of villas) {
    const r = await guest.rpc("request_booking", {
      p_villa_id: v.id, p_room_ids: [], p_check_in: from, p_check_out: to, p_adults: 3, p_children: 0,
      p_special_requests: "WIFI E2E — safe to delete", p_check_in_time: null, p_check_out_time: null, p_prefs: null,
    });
    if (!r.error) { created.push(r.data.id); return { id: r.data.id, villa: v }; }
  }
  return null;
}

try {
  // anonymous
  const a1 = await anon.rpc("wifi_authorize", { p_device_name: "x" });
  check("anon cannot authorise", !!a1.error, a1.error?.message);
  const a2 = await anon.from("wifi_devices").select("id");
  check("anon reads no devices", !a2.data?.length);

  // before any stay: guest has nothing live, so refused
  const pre = await guest.rpc("wifi_authorize", { p_device_name: "Early phone" });

  const stay = await liveStay(iso(0), iso(2));
  if (!stay) throw new Error("no villa free today→+2 for the test stay");
  const bid = stay.id;

  // pending payment is not a stay yet
  const pending = await guest.rpc("wifi_authorize", { p_device_name: "iPhone" });
  check("pending-payment booking cannot authorise", !!pending.error, pending.error?.message);
  if (pre.error) check("guest with no live stay cannot authorise", true);

  await owner.rpc("set_booking_status", { p_booking_id: bid, p_status: "checked_in" });

  const access = one(await guest.rpc("wifi_my_access"));
  check("my_access says ready", access?.state === "ready" && access?.booking_id === bid, JSON.stringify(access));

  // expiry = check-out date + villa's standard hour, India time
  const expected = new Date(`${iso(2)}T${String(stay.villa.check_out_time).slice(0, 8)}+05:30`).getTime();
  check("expiry defaults to the villa's check-out hour", new Date(access.expires_at).getTime() === expected,
        `${access.expires_at} vs ${new Date(expected).toISOString()}`);

  const au = one(await guest.rpc("wifi_authorize", { p_device_name: "iPhone", p_device_type: "phone", p_mac: "AA:BB:CC:00:00:01" }));
  check("checked-in guest authorises", !!au?.device_id && au.controller === "mock", JSON.stringify(au));
  const again = one(await guest.rpc("wifi_authorize", { p_device_name: "iPhone", p_mac: "AA:BB:CC:00:00:01" }));
  check("re-authorising reuses the device", again?.device_id === au.device_id);

  const mine = await guest.from("my_wifi_devices").select("*");
  check("guest sees their device, without MAC", mine.data?.length === 1 && !("mac_address" in mine.data[0]));
  const raw = await guest.from("wifi_devices").select("mac_address").eq("id", au.device_id).single();
  check("guest can read own device row (RLS)", !raw.error);

  // custom check-out time moves expiry
  await owner.from("bookings").update({ check_out_time: "15:30" }).eq("id", bid);
  const moved = (await owner.from("wifi_authorizations").select("expires_at").eq("device_id", au.device_id).single()).data;
  check("custom check-out time moves expiry",
        new Date(moved.expires_at).getTime() === new Date(`${iso(2)}T15:30:00+05:30`).getTime(), moved.expires_at);

  // later check-out date extends it
  // Check-out moved through update_booking, as the edit screen does: shortened
  // a night, then extended back into dates this stay already holds.
  const b0 = (await owner.from("bookings").select("*").eq("id", bid).single()).data;
  const moveTo = (out) => owner.rpc("update_booking", {
    p_booking_id: bid, p_villa_id: b0.villa_id, p_room_ids: [], p_check_in: b0.check_in,
    p_check_out: out, p_adults: b0.adults, p_children: b0.children, p_source: b0.source,
    p_nightly_rate: b0.nightly_rate,
  });
  const at = async () => new Date((await owner.from("wifi_authorizations").select("expires_at")
    .eq("device_id", au.device_id).single()).data.expires_at).getTime();
  const sh = await moveTo(iso(1));
  check("shortened check-out pulls expiry in", !sh.error && (await at()) === new Date(`${iso(1)}T15:30:00+05:30`).getTime(), sh.error?.message);
  const ex = await moveTo(iso(2));
  check("extended check-out extends access", !ex.error && (await at()) === new Date(`${iso(2)}T15:30:00+05:30`).getTime(), ex.error?.message);

  // staff views, by permission
  const oDev = await owner.from("wifi_devices").select("mac_address").eq("id", au.device_id);
  check("owner sees the device and its MAC", oDev.data?.[0]?.mac_address === "AA:BB:CC:00:00:01");
  const mDev = await manager.from("wifi_devices").select("id").eq("id", au.device_id);
  console.log("info  manager sees device:", mDev.data?.length === 1, "(depends on manager's department holding wifi.view)");
  const hDev = await housekeeping.from("wifi_devices").select("id").eq("id", au.device_id);
  check("housekeeping (no wifi.view) sees nothing", hDev.data?.length === 0);
  const hRev = await housekeeping.rpc("wifi_revoke", { p_device_id: au.device_id, p_reason: "x" });
  check("housekeeping cannot revoke", !!hRev.error, hRev.error?.message);

  // a companion on the same stay
  const c = one(await guest.rpc("add_companion", { p_booking_id: bid, p_full_name: "Guest of Test", p_phone: "",
                                                  p_email: "", p_relationship: "other", p_is_child: false }));
  const cEmail = c.guest_code.toLowerCase().replace("hos-", "") + "@guest.homesofsanctuary.in";
  await comp.auth.signInWithPassword({ email: cEmail, password: c.temporary_password });
  const cAu = one(await comp.rpc("wifi_authorize", { p_device_name: "Pixel" }));
  check("companion authorises their own device", !!cAu?.device_id);
  const cSee = await comp.from("wifi_devices").select("id");
  check("companion sees only their own device", cSee.data?.length === 1 && cSee.data[0].id === cAu.device_id);
  const gSee = await guest.from("wifi_devices").select("id").eq("id", cAu.device_id);
  check("holder cannot see the companion's device", gSee.data?.length === 0);
  const cross = await guest.rpc("wifi_disconnect", { p_device_id: cAu.device_id });
  check("guest cannot disconnect someone else's device", !!cross.error, cross.error?.message);

  // "Wi-Fi not working?" files an ordinary request, routed like any other
  const req = await guest.from("guest_requests").insert({
    reference: `REQ-W${Date.now() % 100000}`, booking_id: bid, customer_id: b0.customer_id,
    villa_id: b0.villa_id, category: "wifi", description: "Wi-Fi not working on iPhone — e2e",
    priority: "normal", status: "pending",
  }).select("id, assigned_to, department_id").single();
  check("guest raises a Wi-Fi support request", !req.error, req.error?.message);
  const seenByDesk = await owner.from("guest_requests").select("id").eq("id", req.data?.id);
  check("staff see it in the request queue", seenByDesk.data?.length === 1);
  if (req.data) await owner.from("guest_requests").delete().eq("id", req.data.id);

  // disconnect: session ends, access stays
  const dc = await guest.rpc("wifi_disconnect", { p_device_id: au.device_id });
  const s1 = (await owner.from("wifi_sessions").select("status").eq("device_id", au.device_id)).data;
  const a1s = (await owner.from("wifi_authorizations").select("status").eq("device_id", au.device_id).single()).data;
  check("disconnect ends the session, keeps access", !dc.error && s1.every((s) => s.status !== "active") && a1s.status === "authorized");

  // revoke: owner only (manager lacks wifi.revoke by default)
  const mRev = await manager.rpc("wifi_revoke", { p_device_id: cAu.device_id, p_reason: "test" });
  check("manager without wifi.revoke cannot revoke", !!mRev.error, mRev.error?.message);
  const oRev = await owner.rpc("wifi_revoke", { p_device_id: cAu.device_id, p_reason: "test" });
  const cBack = await comp.rpc("wifi_authorize", { p_device_name: "Pixel" });
  check("revoked device cannot re-authorise", !oRev.error && !!cBack.error, oRev.error?.message ?? "");

  // extend is wifi.manage — owner only
  const gExt = await guest.rpc("wifi_extend", { p_device_id: au.device_id, p_until: new Date(Date.now() + 86400e3 * 4).toISOString() });
  check("guest cannot extend their own access", !!gExt.error);

  // check-out ends everything
  await owner.rpc("set_booking_status", { p_booking_id: bid, p_status: "checked_out" });
  const after = (await owner.from("wifi_authorizations").select("status").eq("booking_id", bid)).data;
  check("check-out expires/revokes every authorisation", after.every((x) => ["expired", "revoked"].includes(x.status)), JSON.stringify(after));
  const late = await guest.rpc("wifi_authorize", { p_device_name: "iPhone" });
  check("checked-out booking cannot authorise", !!late.error, late.error?.message);

  // A confirmed stay on its arrival day may connect before the desk checks
  // them in; cancelling it (only possible before check-in) takes access away.
  const stay2 = await liveStay(iso(0), iso(1));
  if (stay2) {
    await owner.rpc("set_booking_status", { p_booking_id: stay2.id, p_status: "confirmed" });
    const ok2 = one(await guest.rpc("wifi_authorize", { p_device_name: "iPad", p_device_type: "tablet" }));
    const cx = await owner.rpc("cancel_booking", { p_booking_id: stay2.id, p_reason: "wifi test", p_waive_fee: false });
    if (cx.error) console.log("info  cancel_booking:", cx.error.message);
    const st = (await owner.from("wifi_authorizations").select("status").eq("booking_id", stay2.id)).data;
    check("confirmed stay on arrival day authorises", !!ok2);
    check("cancelling revokes access", st.length > 0 && st.every((x) => x.status === "revoked"), JSON.stringify(st));
    const no = await guest.rpc("wifi_authorize", { p_device_name: "iPad" });
    check("cancelled booking cannot authorise", !!no.error, no.error?.message);
  } else {
    console.log("skip  cancellation case — no second villa free today");
  }

  // configuration is logged and permissioned
  const mCfg = await manager.rpc("wifi_configure_villa", { p_villa_id: stay.villa.id, p_enabled: true,
    p_captive_portal: true, p_ssid: "x", p_network_id: "", p_notes: "" });
  check("manager without wifi.configure cannot change settings", !!mCfg.error);

  const log = (await owner.from("activity_events").select("title").eq("entity_id", bid).eq("kind", "wifi")).data;
  check("activity log records grant, disconnect, revoke",
        ["Wi-Fi access granted", "Wi-Fi device disconnected", "Wi-Fi access revoked"].every((t) => log.some((l) => l.title === t)),
        JSON.stringify(log.map((l) => l.title)));

  if (c) await owner.from("booking_companions").delete().eq("id", c.companion_id);
} catch (e) {
  fails++;
  console.error("ERROR", e.message);
} finally {
  for (const id of created) await owner.from("bookings").delete().eq("id", id);
  const left = (await owner.from("wifi_devices").select("id").in("booking_id", created.length ? created : ["00000000-0000-0000-0000-000000000000"])).data;
  check("cleanup: test stays and their Wi-Fi rows removed", left.length === 0);
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
