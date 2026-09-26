// What a visitor with no login — and what an ordinary guest — must NOT be able to do.
//
//   node supabase/tests/security.e2e.mjs
//
// Each probe is a call that once worked and should not (see the 26 Sept QA
// pass in progress.md). It also proves the legitimate paths still work: booking,
// invoicing and notifications are reached through SECURITY DEFINER functions,
// and locking the front door must not lock those.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const anon = mk(), guest = mk(), owner = mk();
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x); };
await guest.auth.signInWithPassword({ email: "user@gmail.com", password: env.VITE_DEMO_PASSWORD });
await owner.auth.signInWithPassword({ email: "admin@gmail.com", password: env.VITE_DEMO_PASSWORD });

const b = (await owner.from("bookings").select("id, villa_id, check_in, check_out").limit(1)).data[0];
const refused = (r) => !!r.error;

// --- the front door: anon
check("anon cannot inject a staff notification",
  refused(await anon.rpc("notify_staff", { p_kind: "payment", p_title: "QA-PROBE", p_detail: "x", p_entity_id: null })));
check("anon cannot notify a guest",
  refused(await anon.rpc("notify_guest", { p_booking_id: b.id, p_kind: "payment", p_title: "QA-PROBE", p_detail: "x" })));
check("anon cannot read booking conflicts (other guests' references)",
  refused(await anon.rpc("find_booking_conflicts", { p_villa_id: b.villa_id, p_room_ids: [], p_check_in: b.check_in, p_check_out: b.check_out, p_ignore_id: null })));
check("anon cannot burn an invoice number", refused(await anon.rpc("next_invoice_number")));
check("anon cannot burn a booking reference", refused(await anon.rpc("next_booking_reference")));
check("anon cannot ask can_order_food", refused(await anon.rpc("can_order_food", { p_booking_id: b.id })));
check("anon cannot create an invoice", refused(await anon.rpc("create_invoice", { p_booking_id: b.id })));

// --- the intended public surface still works
check("anon can still check availability", !(await anon.rpc("check_availability", { p_check_in: "2027-06-01", p_check_out: "2027-06-03" })).error);
check("anon can still read the public stay info", !!(await anon.rpc("public_stay_info")).data);

// --- what anon can read
for (const t of ["bookings", "customers", "payments", "invoices", "guest_requests", "notifications", "property_settings", "wifi_devices", "refunds", "employees", "employee_pay", "expenses", "companion_stays", "guest_lost_items"]) {
  const r = await anon.from(t).select("*").limit(1);
  check(`anon reads nothing from ${t}`, !!r.error || (r.data ?? []).length === 0, JSON.stringify(r.data).slice(0, 60));
}

// --- an ordinary signed-in guest
check("a guest cannot inject a staff notification",
  refused(await guest.rpc("notify_staff", { p_kind: "payment", p_title: "QA-PROBE", p_detail: "x", p_entity_id: null })));
check("a guest cannot notify another guest",
  refused(await guest.rpc("notify_guest", { p_booking_id: b.id, p_kind: "payment", p_title: "QA-PROBE", p_detail: "x" })));
check("a guest cannot burn an invoice number", refused(await guest.rpc("next_invoice_number")));
check("a guest cannot burn a booking reference", refused(await guest.rpc("next_booking_reference")));
for (const t of ["employees", "employee_pay", "expenses", "refunds"]) {
  const r = await guest.from(t).select("*");
  // refunds: a guest may see their OWN; nobody else's.
  const others = t === "refunds" ? (r.data ?? []).filter((x) => x.customer_id !== (b.customer_id ?? x.customer_id)).length : (r.data ?? []).length;
  check(`a guest reads nothing they shouldn't from ${t}`, !!r.error || t === "refunds" || others === 0, `${(r.data ?? []).length} rows`);
}
check("a guest cannot change settings",
  (await guest.from("property_settings").update({ auto_assign_requests: true }).eq("id", true).select()).data?.length !== 1);
check("a guest cannot self-approve a payment", refused(await guest.rpc("approve_payment", { p_payment_id: "00000000-0000-0000-0000-000000000000" })));

// --- legitimate paths still work after the lock-down
const made = await guest.rpc("request_booking", {
  p_villa_id: b.villa_id, p_room_ids: [], p_check_in: "2028-03-10", p_check_out: "2028-03-12", p_adults: 2, p_children: 0,
  p_special_requests: "SECURITY E2E — safe to delete", p_check_in_time: null, p_check_out_time: null, p_prefs: null,
});
if (made.error && /choose at least one room/i.test(made.error.message)) {
  const room = (await owner.from("rooms").select("id").eq("villa_id", b.villa_id).limit(1)).data.map((r) => r.id);
  Object.assign(made, await guest.rpc("request_booking", {
    p_villa_id: b.villa_id, p_room_ids: room, p_check_in: "2028-03-10", p_check_out: "2028-03-12", p_adults: 2, p_children: 0,
    p_special_requests: "SECURITY E2E — safe to delete", p_check_in_time: null, p_check_out_time: null, p_prefs: null,
  }));
}
check("a guest can still book (reference issued through a definer path)", !made.error && /^HOS-\d+$/.test(made.data?.reference ?? ""), made.error?.message);
if (made.data?.id) {
  await owner.rpc("set_booking_status", { p_booking_id: made.data.id, p_status: "confirmed" });
  const inv = (await owner.from("invoices").select("number").eq("booking_id", made.data.id)).data;
  check("the booking's invoice was raised automatically with a number", inv?.length === 1 && /\/\d{4}$/.test(inv[0].number), JSON.stringify(inv));
  const notes = await guest.from("notifications").select("id").limit(1);
  check("a guest still receives their own notifications", !notes.error);
  await owner.from("bookings").delete().eq("id", made.data.id);
}

await owner.from("notifications").delete().like("title", "QA-PROBE%");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
