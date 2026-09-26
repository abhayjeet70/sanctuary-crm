// Live end-to-end suite — run: node supabase/tests/cancellation.e2e.mjs
// Uses the demo accounts in progress.md; creates temporary rows and removes them.
// End-to-end check of cancellation + refunds against the live project, using the
// documented demo accounts. Creates ONE far-future booking and deletes it at the end.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const guest = mk(), admin = mk(), anon = mk();
const pw = env.VITE_DEMO_PASSWORD;
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const g = await guest.auth.signInWithPassword({ email: "user@gmail.com", password: pw });
const a = await admin.auth.signInWithPassword({ email: "admin@gmail.com", password: pw });
check("guest + admin sign in", !g.error && !a.error, g.error?.message ?? a.error?.message ?? "");

// anon must now be locked out of the signed-in functions.
const lock = await anon.rpc("cancellation_quote", { p_booking_id: "00000000-0000-0000-0000-000000000000" });
check("anon cannot call cancellation_quote", lock.error && /permission denied|not found/i.test(lock.error.message), lock.error?.message);

// a far-future booking as the guest
const one = (r) => (Array.isArray(r.data) ? r.data[0] : r.data);
// Villas get switched between whole and split by real use, so the test must not assume either.
const villas = (await guest.from("villas").select("id, name, mode")).data;
const roomsOf = async (v) => v.mode === "split"
  ? (await admin.from("rooms").select("id").eq("villa_id", v.id).order("name").limit(1)).data.map((r) => r.id)
  : [];
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const made = await guest.rpc("request_booking", {
  p_villa_id: villas[0].id, p_room_ids: await roomsOf(villas[0]), p_check_in: iso(300), p_check_out: iso(302),
  p_adults: 2, p_children: 0, p_special_requests: "E2E TEST — safe to delete",
  p_check_in_time: null, p_check_out_time: null, p_prefs: null,
});
check("guest request_booking", !made.error, made.error?.message);
const bid = made.data?.id;

try {
  // pretend ₹10,000 was paid, as staff
  const paid = await admin.from("bookings").update({ amount_paid: 10000, status: "confirmed" }).eq("id", bid);
  check("admin sets paid amount", !paid.error, paid.error?.message);

  let q = await guest.rpc("cancellation_quote", { p_booking_id: bid });
  let row = q.data?.[0];
  check("guest quote 300d out (default tiers -> 50%)", !q.error && row?.refund_percent === 50 && row?.refund_amount === 5000 && row?.retained === 5000 && row?.can_cancel, JSON.stringify(row ?? q.error));

  // per-villa policy: free until 30 days, as staff
  const setPol = await admin.from("villas").update({
    cancellation_policy: { free: true, freeDays: 30, tiers: [{ days: 10, refundPercent: 50 }], note: "" },
  }).eq("id", villas[0].id);
  check("admin sets a villa policy", !setPol.error, setPol.error?.message);
  q = await guest.rpc("cancellation_quote", { p_booking_id: bid });
  row = q.data?.[0];
  check("villa override applies (free -> 100%)", row?.refund_percent === 100 && row?.is_free && row?.refund_amount === 10000, JSON.stringify(row));
  await admin.from("villas").update({ cancellation_policy: null }).eq("id", villas[0].id);
  q = await guest.rpc("cancellation_quote", { p_booking_id: bid });
  check("clearing it falls back to the property policy", q.data?.[0]?.refund_percent === 50);

  // a different guest may not cancel it; the guest may not waive
  const waive = await guest.rpc("cancel_booking", { p_booking_id: bid, p_reason: "x", p_waive_fee: true });
  check("guest cannot waive the fee", !!waive.error, waive.error?.message);

  const cancel = await guest.rpc("cancel_booking", { p_booking_id: bid, p_reason: "E2E test", p_waive_fee: false });
  const ref = Array.isArray(cancel.data) ? cancel.data[0] : cancel.data;
  check("guest cancels", !cancel.error && ref?.refund_amount === 5000 && ref?.status === "pending", cancel.error?.message ?? JSON.stringify(ref));

  const st = await admin.from("bookings").select("status").eq("id", bid).single();
  check("booking is cancelled", st.data?.status === "cancelled", st.data?.status);

  const own = await guest.from("refunds").select("*").eq("booking_id", bid);
  check("guest can read their own refund", own.data?.length === 1);
  const again = await guest.rpc("cancel_booking", { p_booking_id: bid, p_reason: "", p_waive_fee: false });
  check("cannot cancel twice", !!again.error, again.error?.message);

  const guestProcess = await guest.rpc("process_refund", { p_refund_id: ref.id, p_method: "UPI" });
  check("guest cannot mark a refund paid", !!guestProcess.error, guestProcess.error?.message);

  const done = await admin.rpc("process_refund", { p_refund_id: ref.id, p_method: "UPI", p_reference: "E2E123", p_note: "" });
  const dref = Array.isArray(done.data) ? done.data[0] : done.data;
  check("staff records the refund", !done.error && dref?.status === "processed", done.error?.message);

  const seen = await guest.from("refunds").select("status, method").eq("booking_id", bid).single();
  check("guest sees it as processed", seen.data?.status === "processed" && seen.data?.method === "UPI");
  // ---- a FULL refund must be reflected on the booking itself (QA 26 Sept: it stayed "partial")
  {
    const villa2 = (await admin.from("villas").select("id, mode").order("name")).data;
    let b2 = null;
    for (const v of villa2) {
      const rooms = v.mode === "split" ? (await admin.from("rooms").select("id").eq("villa_id", v.id).limit(1)).data.map((r) => r.id) : [];
      const m = await guest.rpc("request_booking", { p_villa_id: v.id, p_room_ids: rooms, p_check_in: iso(500), p_check_out: iso(502),
        p_adults: 2, p_children: 0, p_special_requests: "E2E full refund", p_check_in_time: null, p_check_out_time: null, p_prefs: null });
      if (!m.error) { b2 = m.data.id; break; }
    }
    try {
      const pay = await admin.from("payments").insert({ booking_id: b2, amount: 10000, method: "upi", reference: "E2E", status: "uploaded" }).select("id").single();
      await admin.rpc("approve_payment", { p_payment_id: pay.data.id });
      await admin.rpc("set_booking_status", { p_booking_id: b2, p_status: "confirmed" });
      const c2 = one(await admin.rpc("cancel_booking", { p_booking_id: b2, p_reason: "e2e", p_waive_fee: true }));
      await admin.rpc("process_refund", { p_refund_id: c2.id, p_method: "UPI", p_reference: "E2E", p_note: "" });
      const after = (await admin.from("bookings").select("status, payment_status").eq("id", b2).single()).data;
      const pays = (await admin.from("payments").select("status").eq("booking_id", b2)).data;
      check("a processed FULL refund marks the booking refunded", after.payment_status === "refunded" && pays.every((p) => p.status === "refunded"), JSON.stringify({ after, pays }));
    } finally {
      if (b2) await admin.from("bookings").delete().eq("id", b2);
    }
  }
} finally {
  const del = await admin.from("bookings").delete().eq("id", bid);
  check("cleanup: test booking deleted", !del.error, del.error?.message);
  const left = await admin.from("refunds").select("id").eq("booking_id", bid);
  check("cleanup: refund gone with it", left.data?.length === 0);
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
