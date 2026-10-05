// Real-browser walk of the public booking window, with screenshots at laptop
// and phone sizes. Read-only: stops at the voucher step, never signs up.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/browser-qa/book.mjs [outDir]      BASE=<url> to point elsewhere
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = process.argv[2] ?? "qa-shots";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

const problems = [];
const wait = (page, fn, arg) => page.waitForFunction(fn, { timeout: 15000 }, arg);
const clickText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(t));
    if (!el) return false;
    el.click();
    return true;
  }, text);

for (const [label, viewport] of [
  ["laptop", { width: 1366, height: 768 }],
  ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.on("pageerror", (e) => problems.push(`${label}: JS exception ${e.message.slice(0, 160)}`));
  const shot = async (name) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${label}/${name}: page is ${overflow}px wider than the screen`);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    return height;
  };

  await page.goto(`${BASE}/book`, { waitUntil: "networkidle2" });
  await shot("1-dates");
  await clickText(page, "Check availability");
  await wait(page, () => document.body.innerText.includes("Choose your house"));
  await new Promise((r) => setTimeout(r, 1500)); // images
  const listHeight = await shot("2-villas");

  await clickText(page, "View all details");
  await wait(page, () => location.search.includes("villa="));
  await new Promise((r) => setTimeout(r, 1500));
  await shot("3-villa-page");
  const book = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Book|Choose rooms/.test(x.textContent));
    if (!b) return "none";
    const r = b.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight ? "visible" : "below the fold";
  });
  if (book !== "visible") problems.push(`${label}: villa page Book button ${book}`);

  // Back to the list via the browser, then pick a whole villa and continue.
  await page.goBack();
  await wait(page, () => !location.search.includes("villa="));
  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Select villa");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!picked) problems.push(`${label}: no whole villa free to select`);
  await new Promise((r) => setTimeout(r, 400));
  await clickText(page, "Continue");
  await wait(page, () => document.body.innerText.includes("About you"));
  await page.type("#pb-name", "QA Test Guest");
  await page.type("#pb-phone", "9999999999");
  await page.type("#pb-email", "qa.test@example.com");
  await shot("4-about");
  await clickText(page, "Continue");
  await wait(page, () => document.body.innerText.includes("Your voucher"));
  await new Promise((r) => setTimeout(r, 800));
  const voucherHeight = await shot("5-voucher");
  problems.push(
    `${label}: page heights — villa list ${listHeight}px, voucher step ${voucherHeight}px (screen ${viewport.height}px)`,
  );
  await ctx.close();
}

await browser.close();
console.log(problems.join("\n") || "no problems");
