// Admin-managed menu options and the choices guests make from them, live.
//
//   node supabase/tests/meal_options.e2e.mjs
//
// Creates a temporary dish/course and temporary stays, and removes them all.
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
const iso = (n) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const cleanup = { bookings: [], cats: [], waitlist: [] };
async function stay(offset) {
  const villas = (await owner.from("villas").select("id, mode")).data;
  for (const v of villas) {
    const rooms = v.mode === "split" ? (await owner.from("rooms").select("id").eq("villa_id", v.id).limit(1)).data.map((r) => r.id) : [];
    const r = await guest.rpc("request_booking", {
      p_villa_id: v.id, p_room_ids: rooms, p_check_in: iso(offset), p_check_out: iso(offset + 2), p_adults: 2, p_children: 0,
      p_special_requests: "MEAL E2E", p_check_in_time: null, p_check_out_time: null, p_prefs: null,
    });
    if (!r.error) { cleanup.bookings.push(r.data.id); return { id: r.data.id, villa: v.id, customer: r.data.customer_id }; }
  }
  throw new Error("no villa free for a test stay");
}
const choicesOf = async (bookingId) =>
  (await owner.from("stay_preferences").select("meal_choices").eq("booking_id", bookingId).maybeSingle()).data?.meal_choices;

try {
  // ---- who can see and change the menu
  const live = await anon.from("meal_categories").select("slug, label, max_choices");
  check("a visitor with no login can read the live menu", !live.error && live.data.length >= 4, live.error?.message);
  check("…including the per-course limits", live.data.find((c) => c.slug === "breakfast")?.max_choices === 2);
  const opts = await anon.from("meal_options").select("name");
  check("…and its dishes", !opts.error && opts.data.length >= 10);
  const gAdd = await guest.from("meal_categories").insert({ slug: "qa_guest", label: "Nope" });
  check("a guest cannot add a course", !!gAdd.error);
  const aAdd = await anon.from("meal_options").insert({ category_id: "00000000-0000-0000-0000-000000000000", name: "x" });
  check("a visitor cannot add a dish", !!aAdd.error);

  // ---- management edits, and a retired dish disappears from the guest's view
  const cat = await owner.from("meal_categories").insert({ slug: "qa_snacks", label: "QA Snacks", max_choices: 2, sort_order: 999 }).select("id").single();
  check("management adds a course", !cat.error, cat.error?.message);
  if (cat.data) cleanup.cats.push(cat.data.id);
  const dishes = await owner.from("meal_options").insert([
    { category_id: cat.data.id, name: "QA Pakora", sort_order: 1 },
    { category_id: cat.data.id, name: "QA Samosa", sort_order: 2 },
    { category_id: cat.data.id, name: "QA Chaat", sort_order: 3 },
  ]).select("id, name");
  check("…and dishes in it", !dishes.error && dishes.data.length === 3, dishes.error?.message);
  check("a visitor sees the new course", (await anon.from("meal_categories").select("slug").eq("slug", "qa_snacks")).data.length === 1);
  await owner.from("meal_options").update({ active: false }).eq("id", dishes.data.find((d) => d.name === "QA Chaat").id);
  const seen = (await anon.from("meal_options").select("name").eq("category_id", cat.data.id)).data.map((d) => d.name);
  check("a retired dish is hidden from guests", seen.length === 2 && !seen.includes("QA Chaat"), seen.join());
  const adminSees = (await owner.from("meal_options").select("name").eq("category_id", cat.data.id)).data.length;
  check("…but management still sees it", adminSees === 3);

  // ---- a guest's choices are stored, by name, and held to the course's limit
  const s1 = await stay(600);
  const good = await owner.rpc("save_stay_preferences", { p_booking_id: s1.id, p_waitlist_id: null,
    p_prefs: { dietary: "vegetarian", mealChoices: { breakfast: ["Upma", "Poha"], dessert: ["Kesari Kheer"], qa_snacks: ["QA Pakora"], nonsense: ["x"] } } });
  const stored = await choicesOf(s1.id);
  check("choices are saved by course, as names", !good.error && stored?.breakfast?.length === 2 && stored?.dessert?.[0] === "Kesari Kheer", JSON.stringify(stored) + good.error?.message);
  check("a course that does not exist is dropped, not stored", stored && !("nonsense" in stored));

  const s2 = await stay(610);
  const tooMany = await owner.rpc("save_stay_preferences", { p_booking_id: s2.id, p_waitlist_id: null,
    p_prefs: { mealChoices: { breakfast: ["Upma", "Poha", "Eggs, Toast, Butter & Jam"] } } });
  check("more than the course allows is refused by the database", !!tooMany.error && /at most 2/.test(tooMany.error.message), tooMany.error?.message);
  check("…and nothing half-saved", (await choicesOf(s2.id)) === undefined);

  // ---- a guest, through the real booking call
  const s3 = await (async () => {
    const villas = (await owner.from("villas").select("id, mode")).data;
    for (const v of villas) {
      const rooms = v.mode === "split" ? (await owner.from("rooms").select("id").eq("villa_id", v.id).limit(1)).data.map((r) => r.id) : [];
      const r = await guest.rpc("request_booking", {
        p_villa_id: v.id, p_room_ids: rooms, p_check_in: iso(620), p_check_out: iso(622), p_adults: 2, p_children: 0,
        p_special_requests: "MEAL E2E", p_check_in_time: null, p_check_out_time: null,
        p_prefs: { dietary: "none", meals: [], cuisines: [], allergies: "", dietaryNotes: "", foodNotes: "", occasions: [], specialRequests: "",
                   mealChoices: { lunch: ["Dal Makhani", "Rajma Curry"], beverages: ["Coffee"] } },
      });
      if (!r.error) { cleanup.bookings.push(r.data.id); return { id: r.data.id }; }
    }
  })();
  const viaGuest = await choicesOf(s3.id);
  check("a guest's own booking stores their choices", viaGuest?.lunch?.length === 2 && viaGuest?.beverages?.[0] === "Coffee", JSON.stringify(viaGuest));
  const guestReads = await guest.from("stay_preferences").select("meal_choices").eq("booking_id", s3.id).single();
  check("…and the guest can read them back", guestReads.data?.meal_choices?.lunch?.length === 2);

  // ---- renaming a dish later must not rewrite what was chosen
  await owner.from("meal_options").update({ name: "QA Renamed" }).eq("category_id", cat.data.id).eq("name", "QA Pakora");
  check("renaming a dish leaves earlier choices untouched", (await choicesOf(s1.id)).qa_snacks?.[0] === "QA Pakora");

  // ---- the waiting list carries choices onto the booking it becomes
  const villaW = (await owner.from("villas").select("id, mode").order("name")).data[0];
  const wl = await guest.rpc("join_waitlist", {
    p_villa_id: null, p_check_in: iso(700), p_check_out: iso(702), p_adults: 2, p_children: 0, p_source: "website", p_note: "MEAL E2E",
    p_room_ids: [], p_check_in_time: null, p_check_out_time: null,
    p_prefs: { dietary: "none", meals: [], cuisines: [], allergies: "", dietaryNotes: "", foodNotes: "", occasions: [], specialRequests: "",
               mealChoices: { dessert: ["Custard with Fruit"] } },
    p_customer_id: null,
  });
  const wlId = wl.data?.id ?? wl.data?.[0]?.id;
  if (wlId) cleanup.waitlist.push(wlId);
  check("a waiting-list entry keeps its choices", !wl.error && (await owner.from("stay_preferences").select("meal_choices").eq("waitlist_id", wlId).single()).data?.meal_choices?.dessert?.[0] === "Custard with Fruit", wl.error?.message);
  const s4 = await stay(700);
  const conv = await owner.rpc("convert_waitlist_entry", { p_waitlist_id: wlId, p_booking_id: s4.id });
  const carried = await choicesOf(s4.id);
  check("…and hands them to the booking it becomes", !conv.error && carried?.dessert?.[0] === "Custard with Fruit", conv.error?.message ?? JSON.stringify(carried));
} catch (e) {
  fails++;
  console.error("ERROR", e.message);
} finally {
  for (const id of cleanup.waitlist) await owner.from("waitlist").delete().eq("id", id);
  for (const id of cleanup.bookings) await owner.from("bookings").delete().eq("id", id);
  for (const id of cleanup.cats) await owner.from("meal_categories").delete().eq("id", id);
  const left = (await owner.from("meal_categories").select("id").like("slug", "qa_%")).data;
  check("cleanup: test course, dishes and stays removed", left.length === 0);
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
