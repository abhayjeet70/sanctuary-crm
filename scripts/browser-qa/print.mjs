// Real-browser print check for Finances & reports: every tab must print real content,
// fit the page width, and keep its dark cards visible. Same setup as the other
// browser-qa scripts (app built and served on :4173, `npm i --no-save puppeteer-core`).
//
//   node scripts/browser-qa/print.mjs        -> also leaves PNG/PDF in $TEMP/qa-print for a look
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = `${process.env.TEMP ?? "."}/qa-print`;
mkdirSync(out, { recursive: true });
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x); };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await (await browser.createBrowserContext()).newPage();
await page.setViewport({ width: 1400, height: 1000 });
await page.goto("http://localhost:4173/login", { waitUntil: "networkidle0" });
await page.waitForSelector("#email");
await page.type("#email", "admin@gmail.com");
await page.type("#password", env.VITE_DEMO_PASSWORD);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), page.keyboard.press("Enter")]);
await page.goto("http://localhost:4173/admin/reports", { waitUntil: "networkidle0" });
await sleep(1500);

const names = await Promise.all((await page.$$("[role=tab]")).map((t) => t.evaluate((e) => e.innerText.trim())));
const PAGE_W = 688; // A4 minus 14 mm margins, at 96 dpi
for (let i = 0; i < names.length; i++) {
  await (await page.$$("[role=tab]"))[i].click();
  await sleep(1200);
  await page.emulateMediaType("print");
  await page.setViewport({ width: PAGE_W, height: 1000 });
  await sleep(500);

  const m = await page.evaluate(() => {
    const flow = document.querySelector("[data-print-flow]");
    const r = flow?.getBoundingClientRect();
    // Anything that pokes out past the right edge of the printable area gets cut off.
    const overflowing = [...(flow?.querySelectorAll("*") ?? [])].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 2 && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden").length;
    const dark = [...(flow?.querySelectorAll("*") ?? [])].filter((e) => { const c = getComputedStyle(e).backgroundColor; return c === "rgb(20, 39, 49)" && e.innerText.trim().length > 0; });
    return {
      text: flow?.innerText.trim().length ?? 0,
      top: Math.round(r?.top ?? -1),
      overflowing,
      darkCards: dark.length,
      darkTextVisible: dark.every((e) => getComputedStyle(e).visibility !== "hidden"),
      colourAdjust: flow ? getComputedStyle(flow).getPropertyValue("print-color-adjust") : "",
    };
  });
  const pdf = await page.pdf({ format: "A4", margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" } });
  const pages = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  const slug = names[i].toLowerCase().replace(/[^a-z]+/g, "-");
  writeFileSync(`${out}/${slug}.pdf`, pdf);
  await page.screenshot({ path: `${out}/${slug}.png`, fullPage: true });

  check(`${names[i]}: prints real content`, m.text > 400, `${m.text} chars`);
  check(`${names[i]}: no blank band above the title`, m.top >= 0 && m.top < 60, `starts ${m.top}px down`);
  check(`${names[i]}: nothing runs off the right edge`, m.overflowing === 0, `${m.overflowing} elements overflow`);
  check(`${names[i]}: dark cards keep their fill`, m.darkCards === 0 || m.colourAdjust === "exact", `print-color-adjust=${m.colourAdjust}`);
  check(`${names[i]}: a sensible page count (${pages})`, pages >= 1 && pages <= 6);

  await page.emulateMediaType("screen");
  await page.setViewport({ width: 1400, height: 1000 });
  await sleep(300);
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
