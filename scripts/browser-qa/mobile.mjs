// Phone-width overflow check, in a real browser.
//
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save puppeteer-core
//   node scripts/browser-qa/mobile.mjs            # 390 and 360 px, everything
//   node scripts/browser-qa/mobile.mjs --shots    # also saves a screenshot of each failing screen
//
// For every screen it records two things that make a phone page feel broken:
//   1. the PAGE scrolls sideways (documentElement wider than the viewport), and
//   2. an element pokes out past the right edge and is not inside something that
//      is meant to scroll (a table wrapper with overflow-x, a tab strip…).
// It also reports controls too small to tap (under 32 px). Exits 1 on any overflow.
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = "http://localhost:4173";
const WIDTHS = [390, 360];
const shots = process.argv.includes("--shots");
const outDir = `${process.env.TEMP ?? "."}/qa-mobile`;
if (shots) mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });

/** Runs in the page: what is wider than the viewport, and is it allowed to be? */
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const scrolls = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
    }
    return false;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
  };
  const path = (el) => {
    const bits = [];
    for (let e = el; e && bits.length < 3 && e !== document.body; e = e.parentElement) {
      bits.push(e.tagName.toLowerCase() + (e.id ? `#${e.id}` : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).filter((c) => !c.includes(":") && !c.includes("[")).slice(0, 2).join(".") : ""));
    }
    return bits.join(" < ");
  };
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !scrolls(el) && !el.closest("[data-slot=toaster],[data-sonner-toaster]")) {
      // keep only the outermost offender of a nested run
      if (!offenders.some((o) => o.el.contains(el))) offenders.push({ el, right: Math.round(r.right), w: Math.round(r.width), path: path(el), text: (el.innerText || "").trim().slice(0, 40) });
    }
  }
  const tiny = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, [role=tab], [role=switch]")]
    .filter(visible)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => (r.height < 32 || r.width < 32) && !el.closest("[data-slot=table]") && !(el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) && !el.classList.contains("sr-only"))
    .map(({ el, r }) => `${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  return {
    vw,
    pageWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    offenders: offenders.map(({ el, ...o }) => o),
    tiny: [...new Set(tiny)].slice(0, 6),
  };
};

const results = [];
async function audit(page, label, width) {
  await sleep(500);
  const m = await page.evaluate(measure);
  const sideways = m.pageWidth > m.vw + 1;
  const bad = sideways || m.offenders.length > 0;
  results.push({ label, width, bad, sideways, ...m });
  if (bad && shots) await page.screenshot({ path: `${outDir}/${label.replace(/[^a-z0-9]+/gi, "-")}-${width}.png`, fullPage: false });
  return m;
}

async function newPage(width) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return page;
}
async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", env.VITE_DEMO_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), page.keyboard.press("Enter")]);
  await sleep(1200);
}
const click = (p, label, exact = false) => p.evaluate((l, exact) => {
  const el = [...document.querySelectorAll("button,a")].find((e) => { const t = (e.innerText || "").trim().toLowerCase(); return (exact ? t === l.toLowerCase() : t.includes(l.toLowerCase())) && !e.disabled; });
  if (!el) return false; el.click(); return true;
}, label, exact);
const waitText = (p, re) => p.waitForFunction((s) => new RegExp(s, "i").test(document.body.innerText), { timeout: 10000 }, re.source).then(() => true).catch(() => false);

const ADMIN = ["dashboard", "frontdesk", "bookings", "bookings/new", "payments", "villas", "customers", "calendar", "food", "requests", "housekeeping", "lost-found", "maintenance", "amenities", "wifi", "enquiries", "waitlist", "quotes", "followups", "feedback", "invoices", "cancellations", "reports", "employees", "expenses", "roles", "activity", "settings"];
const GUEST = ["dashboard", "book", "waitlist", "voucher", "lost-found", "booking", "payment", "invoice", "amenities", "food", "requests", "feedback", "people"];

for (const width of WIDTHS) {
  // ---- signed out: login, the captive portal, and every step of the booking popup
  {
    const page = await newPage(width);
    for (const path of ["/login", "/wifi", "/reset-password"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
      await audit(page, path, width);
    }
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await click(page, "Book a stay");
    await waitText(page, /step 1 of 5/);
    await audit(page, "popup step 1 dates", width);
    await click(page, "Check availability");
    await waitText(page, /step 2 of 5/);
    await sleep(600);
    await audit(page, "popup step 2 villas", width);
    await click(page, "Select villa");
    await click(page, "Choose rooms");
    await sleep(900);
    await page.evaluate(() => document.querySelector("input[type=checkbox]:not(:disabled)")?.click());
    await audit(page, "popup step 2 rooms chosen", width);
    await click(page, "Continue");
    await waitText(page, /step 3 of 5/);
    await audit(page, "popup step 3 about you", width);
    await page.type("#pb-name", "QA Guest");
    await page.type("#pb-phone", "9988029296");
    await page.type("#pb-email", "dollarsidestories@gmial.com");
    await click(page, "Continue");
    await sleep(400);
    await audit(page, "popup step 3 with email error", width);
    await page.focus("#pb-email");
    await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type("#pb-email", "qa.mobile@gmail.com");
    await click(page, "Continue");
    await waitText(page, /step 4 of 5/);
    await page.waitForSelector("button[aria-haspopup=listbox]", { timeout: 10000 }).catch(() => {});
    await sleep(500);
    await audit(page, "popup step 4 food (closed)", width);
    const triggers = await page.$$("button[aria-haspopup=listbox]");
    if (triggers[0]) {
      await triggers[0].click();
      await page.waitForSelector("[role=listbox] input[type=checkbox]").catch(() => {});
      const boxes = await page.$$("[role=listbox] input[type=checkbox]");
      if (boxes[0]) await boxes[0].click();
      if (boxes[1]) await boxes[1].click();
      await audit(page, "popup step 4 dropdown open", width);
      await page.keyboard.press("Escape");
      await sleep(300);
    }
    if (triggers[1]) {
      await triggers[1].click();
      await page.waitForSelector("[role=listbox] input[type=checkbox]").catch(() => {});
      for (const b of await page.$$("[role=listbox] input[type=checkbox]")) await b.click();
      await page.keyboard.press("Escape");
      await sleep(300);
    }
    await audit(page, "popup step 4 with many chips", width);
    await click(page, "Continue");
    await waitText(page, /step 5 of 5/);
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await audit(page, "popup step 5 voucher preview", width);
    await page.close();
  }
  // ---- guest portal
  {
    const page = await newPage(width);
    await signIn(page, "user@gmail.com");
    for (const r of GUEST) {
      await page.goto(`${BASE}/guest/${r}`, { waitUntil: "networkidle0" });
      await audit(page, `/guest/${r}`, width);
    }
    await page.goto(`${BASE}/guest/book`, { waitUntil: "networkidle0" });
    await page.waitForSelector("button[aria-haspopup=listbox]", { timeout: 10000 }).catch(() => {});
    const t = await page.$$("button[aria-haspopup=listbox]");
    if (t[0]) { await t[0].click(); await sleep(400); await audit(page, "/guest/book dropdown open", width); await page.keyboard.press("Escape"); }
    await page.close();
  }
  // ---- admin, on a phone: desktop-first, but urgent actions must work
  {
    const page = await newPage(width);
    await signIn(page, "admin@gmail.com");
    for (const r of ADMIN) {
      await page.goto(`${BASE}/admin/${r}`, { waitUntil: "networkidle0" });
      await audit(page, `/admin/${r}`, width);
    }
    // the tabs that hold the new work
    await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle0" });
    const tabs = await page.$$("[role=tab]");
    const names = await Promise.all(tabs.map((t) => t.evaluate((e) => e.innerText.trim())));
    for (let i = 0; i < tabs.length; i++) {
      await (await page.$$("[role=tab]"))[i].click();
      await audit(page, `/admin/settings › ${names[i]}`, width);
    }
    await page.goto(`${BASE}/admin/reports`, { waitUntil: "networkidle0" });
    const rt = await page.$$("[role=tab]");
    const rn = await Promise.all(rt.map((t) => t.evaluate((e) => e.innerText.trim())));
    for (let i = 0; i < rt.length; i++) {
      await (await page.$$("[role=tab]"))[i].click();
      await audit(page, `/admin/reports › ${rn[i]}`, width);
    }
    await page.close();
  }
}
await browser.close();

const bad = results.filter((r) => r.bad);
console.log(`${results.length} screen checks at ${WIDTHS.join(" / ")} px — ${bad.length} with overflow`);
for (const r of bad) {
  console.log(`\nOVERFLOW ${r.label} @${r.width}: page ${r.pageWidth}px in a ${r.vw}px viewport`);
  for (const o of r.offenders.slice(0, 4)) console.log(`   · ${o.path}  right=${o.right}px width=${o.w}px  "${o.text}"`);
}
const small = results.filter((r) => r.tiny.length);
console.log(`\n${small.length} screens have controls under 32px (first few):`);
for (const r of small.slice(0, 10)) console.log(`   ${r.label} @${r.width}: ${r.tiny.slice(0, 3).join("; ")}`);
process.exit(bad.length ? 1 : 0);
