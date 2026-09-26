// Real-browser QA (crawl). Needs the app built and served, and a browser driver that
// is deliberately NOT a project dependency:
//
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save puppeteer-core
//   node scripts/browser-qa/crawl.mjs
//
// Signs in with the demo accounts in progress.md. CHROME=<path> overrides the browser.
// Real-browser crawl: sign in as each role, visit every screen, record what breaks.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = "http://localhost:4173";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new", args: ["--no-sandbox", "--disable-gpu"],
});

const ROLES = {
  admin: {
    email: "admin@gmail.com",
    routes: ["dashboard", "frontdesk", "bookings", "bookings/new", "payments", "villas", "customers", "calendar", "food", "requests",
      "housekeeping", "lost-found", "maintenance", "amenities", "wifi", "enquiries", "waitlist", "quotes", "followups", "feedback",
      "invoices", "cancellations", "reports", "employees", "expenses", "roles", "activity", "settings"],
  },
  guest: {
    email: "user@gmail.com",
    routes: ["dashboard", "book", "waitlist", "voucher", "lost-found", "booking", "payment", "invoice", "amenities", "food", "requests", "feedback", "people"],
  },
};

const problems = [];
async function newPage(label) {
  // A private context per role: a shared one keeps the previous role signed in.
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  let current = "(start)";
  page.on("pageerror", (e) => problems.push({ label, route: current, kind: "JS exception", msg: e.message.slice(0, 200) }));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|Failed to load resource: the server responded with a status of (401|400)|net::ERR_ABORTED|fonts\.g/.test(t) && !/rules of hooks|Rendered/.test(t)) return;
    problems.push({ label, route: current, kind: "console.error", msg: t.slice(0, 220) });
  });
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.includes("supabase.co") || r.status() < 400) return;
    // 404 on a storage object / RPC is a real finding; 401 before sign-in is expected.
    if (r.status() === 401) return;
    let body = "";
    try { body = (await r.text()).slice(0, 140); } catch {}
    problems.push({ label, route: current, kind: `HTTP ${r.status()}`, msg: `${r.request().method()} ${u.replace(/https:\/\/[^/]+/, "").slice(0, 90)} ${body}` });
  });
  return { page, setRoute: (r) => (current = r) };
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  // Demo panel is only rendered when VITE_DEMO_PASSWORD is set; use the form.
  const ok = await page.waitForSelector("#email", { timeout: 15000 }).then(() => true).catch(() => false);
  if (!ok) {
    console.log("LOGIN FORM MISSING. url:", page.url());
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\s+/g, " "));
    console.log(problems.slice(0, 6));
    process.exit(2);
  }
  await page.type("#email", email);
  await page.type("#password", env.VITE_DEMO_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {}),
    page.keyboard.press("Enter"),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
}

const report = [];
for (const [role, cfg] of Object.entries(ROLES)) {
  const { page, setRoute } = await newPage(role);
  await login(page, cfg.email);
  const landed = new URL(page.url()).pathname;
  report.push(`${role}: signed in, landed on ${landed}`);
  for (const r of cfg.routes) {
    const path = `/${role}/${r}`;
    setRoute(path);
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 25000 });
    } catch (e) {
      problems.push({ label: role, route: path, kind: "navigation", msg: e.message.slice(0, 120) });
      continue;
    }
    await new Promise((res) => setTimeout(res, 700));
    const text = await page.evaluate(() => document.body.innerText);
    const final = new URL(page.url()).pathname;
    if (final !== path) report.push(`  ${path} redirected to ${final}`);
    if (/something went wrong|unexpected error|application error/i.test(text)) {
      problems.push({ label: role, route: path, kind: "error screen", msg: text.slice(0, 160).replace(/\s+/g, " ") });
    }
    if (text.trim().length < 80) problems.push({ label: role, route: path, kind: "near-empty page", msg: text.trim().slice(0, 80) });
    if (/\bundefined\b|\[object Object\]|NaN\b/.test(text)) {
      const m = text.match(/.{0,40}(\bundefined\b|\[object Object\]|NaN\b).{0,30}/);
      problems.push({ label: role, route: path, kind: "leaked value", msg: (m?.[0] ?? "").replace(/\s+/g, " ") });
    }
  }
  await page.close();
}
await browser.close();

console.log(report.join("\n"));
const seen = new Set();
const unique = problems.filter((p) => { const k = `${p.label}|${p.route}|${p.kind}|${p.msg}`; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`\n${unique.length} problem(s) found`);
for (const p of unique) console.log(`- [${p.label}] ${p.route}  ${p.kind}: ${p.msg}`);
