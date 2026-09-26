// Real-browser check of the admin-managed menu choices, end to end:
// guest multi-select dropdowns (with the per-course limit) -> voucher preview,
// and an admin adding / hiding / deleting a course that guests then see.
//
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save puppeteer-core
//   node scripts/browser-qa/menu.mjs
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = "http://localhost:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x); };

const api = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await api.auth.signInWithPassword({ email: "admin@gmail.com", password: env.VITE_DEMO_PASSWORD });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const errors = [];
async function open() {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 1400, height: 1100 });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const click = (p, label, exact = false) => p.evaluate((l, exact) => {
  const el = [...document.querySelectorAll("button,a")].find((e) => { const t = (e.innerText || "").trim().toLowerCase(); return (exact ? t === l.toLowerCase() : t.includes(l.toLowerCase())) && !e.disabled; });
  if (!el) return false; el.click(); return true;
}, label, exact);
const waitText = (p, re) => p.waitForFunction((s) => new RegExp(s, "i").test(document.body.innerText), { timeout: 10000 }, re.source).then(() => true).catch(() => false);

/** Open the booking popup and get to the food step. */
async function toFoodStep(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await click(page, "Book a stay");
  await waitText(page, /step 1 of 5/);
  await click(page, "Check availability");
  await waitText(page, /step 2 of 5/);
  await sleep(500);
  await click(page, "Select villa");
  if (!(await click(page, "Choose rooms"))) await sleep(0);
  await sleep(900);
  await page.evaluate(() => document.querySelector("input[type=checkbox]:not(:disabled)")?.click());
  await sleep(300);
  await click(page, "Continue");
  await waitText(page, /step 3 of 5/);
  await page.type("#pb-name", "QA Guest");
  await page.type("#pb-phone", "9988029296");
  await page.type("#pb-email", "qa.menu@gmail.com");
  await click(page, "Continue");
  return waitText(page, /step 4 of 5/);
}
const triggers = (p) => p.$$("button[aria-haspopup=listbox]");
const labelOf = (b) => b.evaluate((e) => e.closest("div")?.querySelector("label")?.innerText.trim().replace(/\s+/g, " ") ?? "");

let createdCourse = null;
try {
  /* ---------------------------------------------------- 1. the guest's view */
  const guest = await open();
  check("the popup reaches the food step", await toFoodStep(guest));

  // The menu is fetched when the step opens; wait for it rather than racing it.
  await guest.waitForSelector("button[aria-haspopup=listbox]", { timeout: 10000 }).catch(() => {});
  const drops = await triggers(guest);
  const labels = await Promise.all(drops.map(labelOf));
  check("one dropdown per course, from the database", drops.length >= 4, labels.join(" | "));
  check("courses show their limit", labels.some((l) => /Breakfast.*choose up to 2/i.test(l)) && labels.some((l) => /Lunch.*choose any/i.test(l)), labels.join(" | "));

  const bi = labels.findIndex((l) => /^Breakfast/i.test(l));
  await drops[bi].click();
  await guest.waitForSelector("[role=listbox] input[type=checkbox]");
  const boxes = await guest.$$("[role=listbox] input[type=checkbox]");
  check("the Breakfast list offers the admin's dishes", boxes.length >= 5, `${boxes.length} dishes`);
  await boxes[0].click(); await boxes[1].click();
  await sleep(300);
  const third = await guest.$$eval("[role=listbox] input[type=checkbox]", (els) => els.map((e) => ({ on: e.checked, off: e.disabled })));
  check("two ticked → the rest are disabled at the limit of 2", third.filter((x) => x.on).length === 2 && third.filter((x) => !x.on).every((x) => x.off), JSON.stringify(third));
  check("…and it says how many are chosen", /2 of 2 chosen/.test(await text(guest)));
  await guest.keyboard.press("Escape"); await sleep(300);
  check("chosen dishes show as removable chips", (await guest.$$('button[aria-label^="Remove "]')).length >= 2);

  // a second, unlimited course takes as many as you like
  const li = labels.findIndex((l) => /^Lunch/i.test(l));
  await (await triggers(guest))[li].click();
  await guest.waitForSelector("[role=listbox] input[type=checkbox]");
  const lunchBoxes = await guest.$$("[role=listbox] input[type=checkbox]");
  for (const b of lunchBoxes) await b.click();
  await sleep(300);
  check("an unlimited course lets you tick everything", (await guest.$$eval("[role=listbox] input[type=checkbox]", (e) => e.every((x) => x.checked && !x.disabled))));
  await guest.keyboard.press("Escape"); await sleep(300);

  await click(guest, "Continue");
  await waitText(guest, /step 5 of 5/);
  await guest.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  const voucher = await text(guest);
  check("the voucher preview lists the breakfast picks", /Breakfast: Dosa with Sambhar/.test(voucher), voucher.slice(voucher.search(/we have noted/i), voucher.search(/we have noted/i) + 200));
  check("…and the lunch picks", /Lunch: Tadka Dal, Methi Dal, Dal Makhani, Rajma Curry/.test(voucher));
  await guest.close();

  /* ----------------------------------------------------- 2. the admin's side */
  const admin = await open();
  await admin.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await admin.waitForSelector("#email");
  await admin.type("#email", "admin@gmail.com"); await admin.type("#password", env.VITE_DEMO_PASSWORD);
  await Promise.all([admin.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), admin.keyboard.press("Enter")]);
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle0" });
  const tabs = await admin.$$("[role=tab]");
  for (const t of tabs) if (/guest menu choices/i.test(await t.evaluate((e) => e.innerText))) { await t.click(); break; }
  check("Settings has a Guest menu choices tab", await waitText(admin, /What guests can pick when they book/));
  check("the seeded courses are editable there", (await admin.$$('input[id^="label-"]')).length >= 4);

  await admin.type("#new-course", "QA Brunch");
  await click(admin, "Add", true);
  await waitText(admin, /QA Brunch|Course name/);
  await sleep(1200);
  createdCourse = (await api.from("meal_categories").select("id").ilike("label", "QA Brunch")).data?.[0]?.id;
  check("adding a course creates it", !!createdCourse);
  if (createdCourse) {
    await admin.type(`#dish-${createdCourse}`, "QA Waffles");
    await admin.keyboard.press("Enter");
    await sleep(1500);
    const dishes = (await api.from("meal_options").select("name").eq("category_id", createdCourse)).data?.map((d) => d.name);
    check("adding a dish saves it", dishes?.includes("QA Waffles"), JSON.stringify(dishes));

    // …and a guest now sees it
    const g2 = await open();
    await toFoodStep(g2);
    await g2.waitForSelector("button[aria-haspopup=listbox]", { timeout: 10000 }).catch(() => {});
    const l2 = await Promise.all((await triggers(g2)).map(labelOf));
    check("the new course appears on the guest form at once", l2.some((l) => /QA Brunch/.test(l)), l2.join(" | "));
    await g2.close();

    // switch it off → hidden from guests
    await admin.evaluate((id) => document.querySelector(`#label-${id}`)?.closest("section")?.querySelector('input[type=checkbox]')?.click(), createdCourse);
    await sleep(1500);
    check("switching a course off hides it from guests", (await api.from("meal_categories").select("active").eq("id", createdCourse).single()).data.active === false);
    const g3 = await open();
    await toFoodStep(g3);
    await g3.waitForSelector("button[aria-haspopup=listbox]", { timeout: 10000 }).catch(() => {});
    const l3 = await Promise.all((await triggers(g3)).map(labelOf));
    check("…and the guest form no longer shows it", !l3.some((l) => /QA Brunch/.test(l)), l3.join(" | "));
    await g3.close();

    // delete needs a confirmation
    await admin.click(`button[aria-label="Remove QA Brunch"]`);
    check("removing a course asks for confirmation", await waitText(admin, /Remove the QA Brunch course\?/));
    await click(admin, "Keep it");
    await sleep(500);
    check("…and 'Keep it' keeps it", !!(await api.from("meal_categories").select("id").eq("id", createdCourse).maybeSingle()).data);
    await admin.click(`button[aria-label="Remove QA Brunch"]`);
    await waitText(admin, /Remove the QA Brunch course\?/);
    await click(admin, "Remove", true);
    await sleep(1500);
    check("confirming removes it", !(await api.from("meal_categories").select("id").eq("id", createdCourse).maybeSingle()).data);
    createdCourse = null;
  }
  await admin.close();
} finally {
  // Whatever happened above, leave the menu as it was found.
  if (createdCourse) await api.from("meal_categories").delete().eq("id", createdCourse);
  await api.from("meal_categories").delete().like("slug", "qa_%");
  const stray = (await api.from("meal_categories").select("id").ilike("label", "QA %")).data ?? [];
  for (const c of stray) await api.from("meal_categories").delete().eq("id", c.id);
}
console.log(errors.length ? `JS exceptions: ${[...new Set(errors)].join(" | ")}` : "no JS exceptions");
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
