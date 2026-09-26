// Villa staff and request auto-assignment, end to end, against the live project.
//
//   node supabase/tests/auto_assign.e2e.mjs
//
// Creates two short test stays, three test employees and a handful of test
// requests; parks the real housekeeping roster on leave while it runs; and
// puts everything back — including the auto-assign switch — pass or fail.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pw = env.VITE_DEMO_PASSWORD;
const owner = mk(), guest = mk(), manager = mk(), housekeeping = mk();

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const iso = (n) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

for (const [c, email] of [[owner, "admin@gmail.com"], [guest, "user@gmail.com"], [manager, "manager@gmail.com"], [housekeeping, "housekeeping@gmail.com"]]) {
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) { console.error("cannot sign in", email, error.message); process.exit(1); }
}

const cleanup = { bookings: [], employees: [], requests: [], parked: [], autoBefore: null };
let seq = 0;

async function stay() {
  const villas = (await owner.from("villas").select("id, name, mode").order("name")).data;
  let last = "";
  for (const v of villas) {
    // A split villa needs a room named; take its first.
    const room = v.mode === "split"
      ? (await owner.from("rooms").select("id").eq("villa_id", v.id).order("name").limit(1)).data?.map((x) => x.id) ?? []
      : [];
    const r = await guest.rpc("request_booking", {
      p_villa_id: v.id, p_room_ids: room, p_check_in: iso(400), p_check_out: iso(402), p_adults: 2, p_children: 0,
      p_special_requests: "AUTO-ASSIGN E2E — safe to delete", p_check_in_time: null, p_check_out_time: null, p_prefs: null,
    });
    if (r.error) last += ` [${v.name}: ${r.error.message}]`;
    if (!r.error) {
      cleanup.bookings.push(r.data.id);
      await owner.rpc("set_booking_status", { p_booking_id: r.data.id, p_status: "checked_in" });
      return { id: r.data.id, villa: v, customer: r.data.customer_id };
    }
  }
  throw new Error("no free villa for a test stay: " + last);
}

async function ask(s, text) {
  const ref = `REQ-A${Date.now() % 100000}${seq++}`;
  const r = await guest.from("guest_requests").insert({
    reference: ref, booking_id: s.id, customer_id: s.customer, villa_id: s.villa.id,
    category: "housekeeping", description: text, priority: "normal", status: "pending",
  }).select("id").single();
  if (r.error) throw new Error("request insert: " + r.error.message);
  cleanup.requests.push(r.data.id);
  return r.data.id;
}
const look = async (id) =>
  (await owner.from("guest_requests").select("status, assigned_employee, auto_assigned, assigned_user").eq("id", id).single()).data;

try {
  const dept = (await owner.from("departments").select("id").eq("slug", "housekeeping").single()).data.id;
  cleanup.autoBefore = (await owner.from("property_settings").select("auto_assign_requests").single()).data.auto_assign_requests;

  // Real housekeeping staff would compete with the test ones: park them.
  const real = (await owner.from("employees").select("id, status").eq("department_id", dept).eq("status", "active")).data;
  for (const e of real) { await owner.from("employees").update({ status: "on_leave" }).eq("id", e.id); cleanup.parked.push(e.id); }

  const A = await stay();
  const B = await stay();
  check("two stays on two different villas", A.villa.id !== B.villa.id);

  const mkEmp = async (name, villa) => {
    const r = await owner.from("employees").insert({ employee_code: "", full_name: name, department_id: dept, villa_id: villa, designation: "Test" }).select("id, villa_id").single();
    if (r.error) throw new Error(r.error.message);
    cleanup.employees.push(r.data.id);
    return r.data;
  };
  const empA = await mkEmp("ZZ Test Attendant A", A.villa.id);
  const empB = await mkEmp("ZZ Test Attendant B", B.villa.id);
  const floater = await mkEmp("ZZ Test Floater", null);
  check("an employee is stored against a villa; a floater has none", empA.villa_id === A.villa.id && floater.villa_id === null);

  // ---- permissions
  const hkSet = await housekeeping.rpc("set_auto_assign", { p_on: true });
  check("housekeeping staff cannot switch auto-assign", !!hkSet.error, hkSet.error?.message);
  const gSet = await guest.rpc("set_auto_assign", { p_on: true });
  check("a guest cannot switch auto-assign", !!gSet.error);

  // ---- auto OFF: requests wait for a human
  await owner.rpc("set_auto_assign", { p_on: false });
  const r0 = await ask(A, "off-mode request");
  check("with auto-assign off, a request stays pending", (await look(r0)).status === "pending");

  // ---- manual assignment, with the villa rule
  const wrong = await owner.rpc("assign_request_to_employee", { p_request_id: r0, p_employee_id: empB.id });
  check("cannot hand a request to staff at another villa", !!wrong.error, wrong.error?.message);
  const ok = await owner.rpc("assign_request_to_employee", { p_request_id: r0, p_employee_id: empA.id });
  const l0 = await look(r0);
  check("manual assignment to the villa's own staff", !ok.error && l0.assigned_employee === empA.id && l0.status === "assigned" && l0.auto_assigned === false, ok.error?.message);
  await owner.rpc("assign_request_to_employee", { p_request_id: r0, p_employee_id: null });
  check("assignment can be taken back", (await look(r0)).status === "pending");
  await owner.from("guest_requests").update({ status: "rejected", resolution_note: "test" }).eq("id", r0);

  // ---- auto ON
  await owner.rpc("set_auto_assign", { p_on: true });
  const r1 = await ask(A, "first request at A");
  const l1 = await look(r1);
  check("auto: the villa's own free attendant gets it", l1.assigned_employee === empA.id && l1.status === "assigned" && l1.auto_assigned === true, JSON.stringify(l1));

  const r2 = await ask(A, "second request at A");
  const l2 = await look(r2);
  check("auto: villa staff busy, so the floater covers", l2.assigned_employee === floater.id, JSON.stringify(l2));

  const r3 = await ask(A, "third request at A");
  check("auto: nobody free, so it waits", (await look(r3)).status === "pending");

  const rB = await ask(B, "request at B");
  check("auto: another villa's request goes to that villa's staff", (await look(rB)).assigned_employee === empB.id);

  // ---- somebody finishes: the waiting job comes to them
  await owner.from("guest_requests").update({ status: "in_progress" }).eq("id", r1);
  await owner.from("guest_requests").update({ status: "completed", resolution_note: "done" }).eq("id", r1);
  const l3 = await look(r3);
  check("finishing a job hands the attendant the waiting one", l3.assigned_employee === empA.id && l3.status === "assigned", JSON.stringify(l3));

  // ---- turning it on clears the backlog
  await owner.rpc("set_auto_assign", { p_on: false });
  const rBack = await ask(B, "backlog request at B");
  await owner.from("guest_requests").update({ status: "completed", resolution_note: "x" }).eq("id", rB);
  check("with auto off again, the new request waits", (await look(rBack)).status === "pending");
  const swept = await owner.rpc("set_auto_assign", { p_on: true });
  check("switching on assigns the backlog at once", !swept.error && swept.data >= 1 && (await look(rBack)).assigned_employee === empB.id, JSON.stringify(swept));

  // ---- not everybody is eligible
  await owner.from("employees").update({ status: "on_leave" }).eq("id", empB.id);
  await owner.from("guest_requests").update({ status: "completed", resolution_note: "x" }).eq("id", rBack);
  const rLeave = await ask(B, "B is on leave");
  const lLeave = await look(rLeave);
  check("staff on leave are never picked", lLeave.assigned_employee !== empB.id, JSON.stringify(lLeave));

  // ---- housekeeping: the room buttons
  const room = (await owner.from("rooms").select("id, status").eq("villa_id", A.villa.id).limit(1).single()).data;
  const cl = await owner.rpc("set_room_status", { p_room_id: room.id, p_status: "cleaning" });
  const roomAfter = (await owner.from("rooms").select("status").eq("id", room.id).single()).data;
  check("Send to clean writes the room's operational status", !cl.error && roomAfter.status === "cleaning", cl.error?.message);
  await owner.rpc("set_room_status", { p_room_id: room.id, p_status: "available" });
  check("Mark clean puts it back", (await owner.from("rooms").select("status").eq("id", room.id).single()).data.status === "available");
} catch (e) {
  fails++;
  console.error("ERROR", e.message);
} finally {
  // Restore in dependency order, and the switch to how it was.
  await owner.rpc("set_auto_assign", { p_on: false });
  for (const id of cleanup.requests) await owner.from("guest_requests").delete().eq("id", id);
  for (const id of cleanup.employees) await owner.from("employees").delete().eq("id", id);
  for (const id of cleanup.bookings) await owner.from("bookings").delete().eq("id", id);
  for (const id of cleanup.parked) await owner.from("employees").update({ status: "active" }).eq("id", id);
  if (cleanup.autoBefore) await owner.rpc("set_auto_assign", { p_on: true });
  const left = (await owner.from("employees").select("id").like("full_name", "ZZ Test%")).data;
  check("cleanup: test employees, requests and stays removed", left.length === 0);
  const settings = (await owner.from("property_settings").select("auto_assign_requests").single()).data;
  check("cleanup: auto-assign switch restored", settings.auto_assign_requests === Boolean(cleanup.autoBefore));
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
