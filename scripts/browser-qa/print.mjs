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
// A4 minus 14 mm margins, at 96 dpi: portrait, and landscape (wider than lg).
for (const [orient, PAGE_W] of [["portrait", 688], ["landscape", 1100]])
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
      widthShare: (r?.width ?? 0) / window.innerWidth,
      height: r?.height ?? 0,
      top: Math.round(r?.top ?? -1),
      overflowing,
      darkCards: dark.length,
      darkTextVisible: dark.every((e) => getComputedStyle(e).visibility !== "hidden"),
      colourAdjust: flow ? getComputedStyle(flow).getPropertyValue("print-color-adjust") : "",
    };
  });
  const pdf = await page.pdf({ format: "A4", landscape: orient === "landscape", margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" } });
  const pages = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  const slug = `${names[i].toLowerCase().replace(/[^a-z]+/g, "-")}-${orient}`;
  writeFileSync(`${out}/${slug}.pdf`, pdf);
  await page.screenshot({ path: `${out}/${slug}.png`, fullPage: true });

  check(`${names[i]} (${orient}): prints real content`, m.text > 400, `${m.text} chars`);
  check(`${names[i]} (${orient}): uses the page width`, m.widthShare > 0.9, `only ${Math.round(m.widthShare * 100)}% of the width`);
  check(`${names[i]} (${orient}): no blank band above the title`, m.top >= 0 && m.top < 60, `starts ${m.top}px down`);
  check(`${names[i]} (${orient}): nothing runs off the right edge`, m.overflowing === 0, `${m.overflowing} elements overflow`);
  check(`${names[i]} (${orient}): dark cards keep their fill`, m.darkCards === 0 || m.colourAdjust === "exact", `print-color-adjust=${m.colourAdjust}`);
  // Printable height at 96 dpi: A4 minus 14 mm margins, by orientation.
  const sheet = orient === "landscape" ? 688 : 1017;
  const needed = Math.max(1, Math.ceil(m.height / sheet));
  check(`${names[i]} (${orient}): no blank pages (${pages} for ~${needed} of content)`, pages <= needed + 1);
  check(`${names[i]} (${orient}): a sensible page count (${pages})`, pages >= 1 && pages <= 6);

  await page.emulateMediaType("screen");
  await page.setViewport({ width: 1400, height: 1000 });
  await sleep(300);
}
// ---- an invoice printed from the Invoices page (it opens in a dialog)
await page.goto("http://localhost:4173/admin/invoices", { waitUntil: "networkidle0" });
await sleep(1200);
const opened = await page.evaluate(() => {
  const b = document.querySelector('button[aria-label^="View "]');
  if (!b) return false;
  b.click();
  return true;
});
await sleep(1000);
if (!opened) check("Invoice dialog: opens", false, "no View button");
else {
  for (const [orient, w] of [["portrait", 688], ["landscape", 1100]]) {
    await page.emulateMediaType("print");
    await page.setViewport({ width: w, height: 1000 });
    await sleep(400);
    const inv = await page.evaluate(() => {
      const root = document.querySelector("[data-print-root]");
      const r = root?.getBoundingClientRect();
      return { text: root?.innerText ?? "", visibleHeight: r?.height ?? 0, scrollHeight: root?.scrollHeight ?? 0, left: Math.round(r?.left ?? -1) };
    });
    const pdf = await page.pdf({ format: "A4", landscape: orient === "landscape", margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" } });
    const pages = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    writeFileSync(`${out}/invoice-${orient}.pdf`, pdf);
    await page.screenshot({ path: `${out}/invoice-${orient}.png`, fullPage: true });
    check(`Invoice (${orient}): line items and total print`, /total/i.test(inv.text) && inv.text.length > 300, `${inv.text.length} chars`);
    check(`Invoice (${orient}): starts at the left edge`, inv.left >= 0 && inv.left < 20, `left ${inv.left}px`);
    check(`Invoice (${orient}): one or two pages, not repeats (${pages})`, pages >= 1 && pages <= 2);
  }
  await page.emulateMediaType("screen");
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
