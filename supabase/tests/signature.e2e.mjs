// The invoice signature: who may upload it, who may see it, what the bucket refuses.
//
//   node supabase/tests/signature.e2e.mjs
//
// Restores the setting and removes every file it uploads.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pw = env.VITE_DEMO_PASSWORD;
const owner = mk(), manager = mk(), guest = mk(), anon = mk();
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : x); };
for (const [c, e] of [[owner, "admin@gmail.com"], [manager, "manager@gmail.com"], [guest, "user@gmail.com"]]) {
  const { error } = await c.auth.signInWithPassword({ email: e, password: pw });
  if (error) { console.error("sign-in", e, error.message); process.exit(1); }
}

// A real 1×1 PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const bucket = "invoice-signature";
const made = [];
const before = (await owner.from("property_settings").select("signature_path").single()).data.signature_path;

try {
  const up = await owner.storage.from(bucket).upload(`signature/e2e-${Date.now()}.png`, PNG, { contentType: "image/png" });
  if (!up.error) made.push(up.data.path);
  check("owner uploads a signature", !up.error, up.error?.message);

  const mUp = await manager.storage.from(bucket).upload(`signature/e2e-m-${Date.now()}.png`, PNG, { contentType: "image/png" });
  if (!mUp.error) made.push(mUp.data.path);
  check("manager cannot upload one", !!mUp.error, "uploaded");

  const gUp = await guest.storage.from(bucket).upload(`signature/e2e-g-${Date.now()}.png`, PNG, { contentType: "image/png" });
  if (!gUp.error) made.push(gUp.data.path);
  check("guest cannot upload one", !!gUp.error, "uploaded");

  const gif = await owner.storage.from(bucket).upload(`signature/e2e-${Date.now()}.gif`, new Uint8Array([71, 73, 70, 56, 57, 97]), { contentType: "image/gif" });
  if (!gif.error) made.push(gif.data.path);
  check("the bucket refuses a GIF even from the owner", !!gif.error, "accepted");

  const big = await owner.storage.from(bucket).upload(`signature/e2e-big-${Date.now()}.png`, new Uint8Array(1024 * 1024 + 10), { contentType: "image/png" });
  if (!big.error) made.push(big.data.path);
  check("the bucket refuses a file over 1 MB", !!big.error, "accepted");

  if (up.data) {
    const gSigned = await guest.storage.from(bucket).createSignedUrl(up.data.path, 60);
    check("a signed-in guest can see it (for their invoice)", !gSigned.error && !!gSigned.data?.signedUrl, gSigned.error?.message);
    const aSigned = await anon.storage.from(bucket).createSignedUrl(up.data.path, 60);
    check("an anonymous visitor cannot", !!aSigned.error || !aSigned.data?.signedUrl);
    const pub = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${up.data.path}`);
    check("it is not reachable by a public URL", pub.status >= 400, String(pub.status));

    const mSet = await manager.from("property_settings").update({ signature_path: up.data.path }).eq("id", true);
    const after = (await owner.from("property_settings").select("signature_path").single()).data.signature_path;
    check("manager cannot point the setting at it", after === before, `${mSet.error?.message ?? "no error"} / now ${after}`);
    const oSet = await owner.from("property_settings").update({ signature_path: up.data.path }).eq("id", true);
    check("owner can set it", !oSet.error && (await owner.from("property_settings").select("signature_path").single()).data.signature_path === up.data.path, oSet.error?.message);
  }
} catch (e) {
  fails++;
  console.error("ERROR", e.message);
} finally {
  await owner.from("property_settings").update({ signature_path: before }).eq("id", true);
  if (made.length) await owner.storage.from(bucket).remove(made);
  const left = (await owner.storage.from(bucket).list("signature")).data?.filter((f) => f.name.startsWith("e2e-")) ?? [];
  check("cleanup: test files removed, setting restored", left.length === 0 && (await owner.from("property_settings").select("signature_path").single()).data.signature_path === before);
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
