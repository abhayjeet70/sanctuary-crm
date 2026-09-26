// Real-browser QA (interact). Needs the app built and served, and a browser driver that
// is deliberately NOT a project dependency:
//
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save puppeteer-core
//   node scripts/browser-qa/interact.mjs
//
// Signs in with the demo accounts in progress.md. CHROME=<path> overrides the browser.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = "http://localhost:4173";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x); };
const errors = [];

// Anything these interactions touch is put back through the API at the end, whatever
// the UI did or did not manage: a test that leaves auto-assign switched on is a bug.
const api = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await api.auth.signInWithPassword({ email: "admin@gmail.com", password: env.VITE_DEMO_PASSWORD });
const autoBefore = (await api.from("property_settings").select("auto_assign_requests").single()).data.auto_assign_requests;
const flagsBefore = new Map((await api.from("rooms").select("id, status")).data.map((r) => [r.id, r.status]));

async function open(role) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return page;
}
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function clickText(page, label, sel = "button, a, [role=switch]", exact = false) {
  const ok = await page.evaluate((label, sel, exact) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.innerText && (exact ? e.innerText.trim().toLowerCase() === label.toLowerCase() : e.innerText.trim().toLowerCase().includes(label.toLowerCase())) && !e.disabled);
    if (!el) return false; el.click(); return true;
  }, label, sel, exact);
  return ok;
}
async function realTab(page, name) {
  const tabs = await page.$$("[role=tab]");
  for (const t of tabs) {
    const label = await t.evaluate((e) => e.innerText.trim());
    if (label.toLowerCase().startsWith(name.toLowerCase())) { await t.click(); await sleep(600); return true; }
  }
  return false;
}
async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", env.VITE_DEMO_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), page.keyboard.press("Enter")]);
  await sleep(1200);
}

/* ---------------------------------------------------- 1. the booking popup */
{
  const page = await open();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await clickText(page, "Book a stay"); await sleep(600);
  check("popup opens on step 1 of 5", /Step 1 of 5/i.test(await text(page)));
  await clickText(page, "Check availability"); await sleep(2500);
  let t = await text(page);
  check("step 2 shows villa cards with price and cancellation line", /Step 2 of 5/i.test(t) && /taxes & fees/.test(t) && /(refund|cancellation)/i.test(t), t.slice(0, 200));
  await clickText(page, "Select villa"); await sleep(700);
  if (!/Selected/.test(await text(page))) { await clickText(page, "Choose rooms"); await sleep(1000); await page.evaluate(() => document.querySelector('input[type=checkbox]:not(:disabled)')?.click()); await sleep(400); }
  await clickText(page, "Continue"); await sleep(600);
  t = await text(page);
  check("step 3 (about you) reached", /Step 3 of 5/i.test(t), t.slice(0, 160));

  await page.type("#pb-name", "QA Guest");
  await page.type("#pb-phone", "9988029296");
  await page.type("#pb-email", "dollarsidestories@gmial.com");
  await clickText(page, "Continue"); await sleep(500);
  t = await text(page);
  check("a typo'd email (gmial.com) blocks Continue", /Step 3 of 5/i.test(t), "moved on");
  check("…and says what to fix", /Did you mean dollarsidestories@gmail\.com/.test(t), t.slice(0, 260));
  const invalid = await page.evaluate(() => document.querySelector("#pb-email")?.getAttribute("aria-invalid"));
  check("…and the field is marked invalid (not colour alone)", invalid === "true");

  await page.focus("#pb-email");
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type("#pb-email", "sam@gmail");
  await clickText(page, "Continue"); await sleep(400);
  check("an incomplete domain is refused", /Step 3 of 5/i.test(await text(page)) && /incomplete|valid/i.test(await text(page)));

  // Clear the field the way a person would (select all, delete). Setting .value from
  // script and triple-clicking sometimes left the old text behind, and the new address
  // was then typed onto the end of it.
  await page.focus("#pb-email");
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type("#pb-email", "qa.guest+test@gmail.com");
  await clickText(page, "Continue");
  // Wait for the step to change rather than guessing how long a render takes.
  await page.waitForFunction(() => /step 4 of 5/i.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
  check("a proper address moves on to step 4", /Step 4 of 5/i.test(await text(page)), await page.evaluate(() => `email field="${document.querySelector("#pb-email")?.value}" error="${document.querySelector("#pb-email-error")?.innerText ?? ""}" step=${(document.body.innerText.match(/step \d of 5/i) ?? [""])[0]}`));
  check("food step shows the admin's dining menu", /Dining & menu/i.test(await text(page)) && /BREAKFAST/i.test(await text(page)));
  await clickText(page, "Continue");
  await page.waitForFunction(() => /step 5 of 5/i.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
  t = await text(page);
  check("step 5 shows the voucher marked Pending payment", /Step 5 of 5/i.test(t) && /Pending payment/i.test(t) && /BOOKING CONFIRMATION VOUCHER/i.test(t), t.slice(0, 200));
  check("…and the sign-in-and-pay button", /Sign in & continue to payment/i.test(t));
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); await sleep(300);
  check("…and the cancellation policy is shown (under Terms & policies)", /Cancellation & refunds/i.test(await text(page)) && /refund/i.test(await text(page)));
  await page.close();
}

/* --------------------------------------------------------- 2. admin actions */
{
  const page = await open();
  await signIn(page, "admin@gmail.com");

  // housekeeping: Send to clean / Cancel on an occupied or available room
  await page.goto(`${BASE}/admin/housekeeping`, { waitUntil: "networkidle0" }); await sleep(800);
  const queuedCount = () => page.evaluate(() => (document.body.innerText.match(/Cleaning queued/gi) ?? []).length);
  const startQueued = await queuedCount();
  const clicked = await clickText(page, "Send to clean");
  // Wait for the page to show the change rather than sleeping and hoping.
  await page.waitForFunction((n) => (document.body.innerText.match(/Cleaning queued/gi) ?? []).length > n || /Cleaning\s*$/m.test(""), { timeout: 10000 }, startQueued).catch(() => {});
  check("Send to clean does something visible", clicked && (await queuedCount()) > startQueued, "no change");
  if (clicked && (await queuedCount()) > startQueued) {
    // The tag shows a beat before the button turns into "Cancel" — wait for the button.
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.trim().toLowerCase() === "cancel" && !b.disabled), { timeout: 10000 }).catch(() => {});
    const undo = await clickText(page, "Cancel", "button", true);
    await page.waitForFunction((n) => (document.body.innerText.match(/Cleaning queued/gi) ?? []).length <= n, { timeout: 10000 }, startQueued).catch(() => {});
    check("…and Cancel puts it back", undo && (await queuedCount()) <= startQueued);
  }

  // requests: the auto-assign switch, restored afterwards
  await page.goto(`${BASE}/admin/requests`, { waitUntil: "networkidle0" }); await sleep(800);
  await page.waitForFunction(() => { const s = document.querySelector("[role=switch]"); return s && !s.disabled; }, { timeout: 15000 });
  const inDb = async () => (await api.from("property_settings").select("auto_assign_requests").single()).data.auto_assign_requests;
  const until = async (want) => { for (let i = 0; i < 30; i++) { if ((await inDb()) === want) return true; await sleep(300); } return false; };
  await page.evaluate(() => document.querySelector("[role=switch]").click());
  check("the auto-assign switch changes the setting in the database", await until(!autoBefore));
  await page.waitForFunction(() => { const s = document.querySelector("[role=switch]"); return s && !s.disabled; }, { timeout: 15000 });
  const shown = await page.evaluate(() => document.querySelector("[role=switch]").getAttribute("aria-checked") === "true");
  check("…and the switch shows the new state", shown === !autoBefore, `shows ${shown}`);
  await page.evaluate(() => document.querySelector("[role=switch]").click());
  check("…and clicking again restores it", await until(autoBefore));

  // employees: villa filter + the form's villa field
  await page.goto(`${BASE}/admin/employees`, { waitUntil: "networkidle0" }); await sleep(600);
  check("employees page has the villa filter", (await page.$("#employee-villa")) !== null);
  await clickText(page, "Add employee"); await sleep(500) || 0;
  check("the add-employee form asks which villa", /Villa/.test(await text(page)) && (await page.$("#emp-villa")) !== null);
  await page.keyboard.press("Escape");

  // settings → invoice: signature rules
  writeFileSync(new URL("./tiny.png", import.meta.url), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle0" }); await sleep(600);
  await realTab(page, "Invoice");
  check("the signature section lists the format/size/dimension rules", /Signature image/.test(await text(page)) && /1 MB/.test(await text(page)) && /300 × 100/.test(await text(page)));
  const input = await page.$("#signature-file");
  check("the owner sees the upload control", input !== null);
  if (input) {
    await input.uploadFile(new URL("./tiny.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")); await sleep(1200);
    const t2 = await text(page);
    check("a 1×1 image is refused as too small, in words", /too small/i.test(t2) && /can't be used/i.test(t2), t2.slice(t2.indexOf("Signature"), t2.indexOf("Signature") + 300));
  }

  // settings: lost & found retention fields
  await realTab(page, "Property");
  check("lost & found retention days are editable in Settings", (await page.$("#lf-days")) !== null);

  // a villa page carries staff, wi-fi and cancellation policy
  await page.goto(`${BASE}/admin/villas`, { waitUntil: "networkidle0" }); await sleep(600);
  const href = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).find((h) => /^\/admin\/villas\/[^/]+$/.test(h || "")));
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle0" }); await sleep(900);
  const vt = await text(page);
  check("a villa page shows Staff, Guest Wi-Fi and Cancellation policy", /staff at/i.test(vt) && /guest wi-fi/i.test(vt) && /Cancellation policy/i.test(vt));
  await page.close();
}

/* --------------------------------------------------------------- 3. guest */
{
  const page = await open();
  await signIn(page, "user@gmail.com");
  await page.goto(`${BASE}/guest/amenities`, { waitUntil: "networkidle0" }); await sleep(1500);
  const gt = await text(page);
  check("guest Wi-Fi card: names the controller, never claims 'online'", /Controller: Mock/.test(gt) && !/you are online|internet connected/i.test(gt), gt.slice(0, 200));
  await page.goto(`${BASE}/guest/booking`, { waitUntil: "networkidle0" }); await sleep(1000);
  const bt = await text(page);
  check("guest booking page shows the cancellation entry point", /cancel this stay|cancellation & refund|change of plans/i.test(bt), bt.slice(0, 120));
  await page.close();
}

await api.rpc("set_auto_assign", { p_on: autoBefore });
for (const r of (await api.from("rooms").select("id, status")).data) {
  const was = flagsBefore.get(r.id);
  if (was && r.status !== was) await api.rpc("set_room_status", { p_room_id: r.id, p_status: was });
}
console.log(errors.length ? `JS exceptions: ${[...new Set(errors)].join(" | ")}` : "no JS exceptions during the interactions");
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
