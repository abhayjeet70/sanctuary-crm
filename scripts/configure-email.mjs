#!/usr/bin/env node
/**
 * Configure email for the project. Run once.
 *
 *   node scripts/configure-email.mjs
 *
 * Two separate things need an email provider, and one Resend key covers both:
 *
 *   1. Supabase Auth  — confirmation and invite emails. Sent by Supabase
 *      itself, so it needs SMTP credentials in the PROJECT CONFIG. Without
 *      this you are on the built-in sender, which is rate limited to a few
 *      messages an hour and only intended for testing.
 *
 *   2. send-notification — booking and payment emails from the Edge Function.
 *      Uses the Resend HTTP API, so it needs the key as a FUNCTION SECRET.
 *
 * Resend exposes both: the same API key is the SMTP password, with username
 * "resend" on smtp.resend.com:465.
 *
 * Nothing is written to the repo. Both credentials are prompted for and sent
 * straight to Supabase.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout, env, exit } from "node:process";
import { execFileSync } from "node:child_process";

const PROJECT_REF = env.SUPABASE_PROJECT_REF ?? "tufwyptholucfgdrldzh";
const MANAGEMENT_API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

const rl = createInterface({ input: stdin, output: stdout });
const ask = (question) => rl.question(question);

console.log(`\nConfiguring email for project ${PROJECT_REF}\n`);
console.log("You need two things:");
console.log("  1. A Resend API key      https://resend.com/api-keys        (starts re_)");
console.log("  2. A Supabase access token  https://supabase.com/dashboard/account/tokens\n");
console.log("A verified sending domain in Resend is required for anything other");
console.log("than your own address. Until then use onboarding@resend.dev.\n");

const resendKey = (await ask("Resend API key: ")).trim();
if (!resendKey.startsWith("re_")) {
  console.error("\nThat does not look like a Resend key (they start with re_).");
  rl.close();
  exit(1);
}

const fromAddress =
  (await ask('Send from [Homes of Sanctuary <onboarding@resend.dev>]: ')).trim() ||
  "Homes of Sanctuary <onboarding@resend.dev>";

const accessToken =
  env.SUPABASE_ACCESS_TOKEN?.trim() || (await ask("Supabase access token: ")).trim();
if (!accessToken.startsWith("sbp_")) {
  console.error("\nThat does not look like a Supabase access token (they start with sbp_).");
  rl.close();
  exit(1);
}
rl.close();

const senderName = fromAddress.includes("<") ? fromAddress.split("<")[0].trim() : "Homes of Sanctuary";
const senderEmail = fromAddress.includes("<")
  ? fromAddress.split("<")[1].replace(">", "").trim()
  : fromAddress;

/* ---------------------------------------------- 1. Auth SMTP (confirmations) */
console.log("\n1/2  Pointing Supabase Auth at Resend SMTP…");

const response = await fetch(MANAGEMENT_API, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    smtp_admin_email: senderEmail,
    smtp_host: "smtp.resend.com",
    smtp_port: 465,
    smtp_user: "resend",
    smtp_pass: resendKey,
    smtp_sender_name: senderName,
    // The built-in sender allows a handful an hour. Resend's free tier is
    // 100/day, so this is raised to something a real property can use while
    // still capping a runaway loop.
    rate_limit_email_sent: 30,
    // Confirmation must stay ON: a new account is linked to an existing
    // customer by email, so an unverified address would be a way into someone
    // else's booking.
    mailer_autoconfirm: false,
  }),
});

if (!response.ok) {
  console.error(`     failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  exit(1);
}
console.log("     done — confirmation and invite emails now go through Resend.");

/* ------------------------------------- 2. Function secret (booking emails) */
console.log("2/2  Setting the Edge Function secrets…");

try {
  execFileSync(
    "npx",
    [
      "--yes",
      "supabase@latest",
      "secrets",
      "set",
      `RESEND_API_KEY=${resendKey}`,
      `NOTIFY_FROM=${fromAddress}`,
      "--project-ref",
      PROJECT_REF,
    ],
    { stdio: "inherit", env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken }, shell: true },
  );
} catch {
  console.error("     failed. Run this yourself:");
  console.error(`     npx supabase secrets set RESEND_API_KEY=... --project-ref ${PROJECT_REF}`);
  exit(1);
}

console.log("\nEmail is configured.\n");
console.log("Verify it:");
console.log("  1. Sign up a new guest — the confirmation email should arrive.");
console.log("  2. Open a booking and press Email under Send booking details.\n");
console.log("If mail does not arrive, check Resend's dashboard: an unverified");
console.log("sending domain can only send to your own address.\n");
