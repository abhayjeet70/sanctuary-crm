#!/usr/bin/env node
/**
 * Confirm a signed-up account without waiting for an email.
 *
 *   npm run confirm-user someone@example.com
 *   npm run confirm-user someone@example.com newpassword   (also sets it)
 *
 * Why this exists: signup sends a confirmation link, and until SMTP is
 * configured (npm run configure-email) that mail never arrives — Supabase's
 * built-in sender is capped at a couple an hour and on a new project only
 * delivers to project members. Without this, testing the guest flow means
 * opening the dashboard every time.
 *
 * TESTING ONLY. Confirmation exists for a reason: a new account is linked to an
 * existing customer by matching email, so confirming an address you do not
 * control is how someone else's booking gets read. Never point this at an
 * address a real guest gave you.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout, env, argv, exit } from "node:process";

const PROJECT_REF = env.SUPABASE_PROJECT_REF ?? "tufwyptholucfgdrldzh";
const email = argv[2]?.trim().toLowerCase();
const newPassword = argv[3]?.trim();

if (!email || !email.includes("@")) {
  console.error("\nUsage: npm run confirm-user someone@example.com [newpassword]\n");
  exit(1);
}

let accessToken = env.SUPABASE_ACCESS_TOKEN?.trim();
if (!accessToken) {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log("\nNeeds a Supabase access token — https://supabase.com/dashboard/account/tokens");
  console.log("Set SUPABASE_ACCESS_TOKEN to skip this prompt next time.\n");
  accessToken = (await rl.question("Access token: ")).trim();
  rl.close();
}
if (!accessToken?.startsWith("sbp_")) {
  console.error("\nThat does not look like a Supabase access token (they start with sbp_).\n");
  exit(1);
}

const api = async (path, init = {}) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
};

// The service-role key is fetched rather than stored, so nothing sensitive
// lands in the repo or your shell history.
const keys = await api("/api-keys?reveal=true");
const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
if (!serviceKey) {
  console.error("\nCould not read the service-role key for this project.\n");
  exit(1);
}

const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const auth = (path, init = {}) =>
  fetch(`${PROJECT_URL}/auth/v1${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...init.headers },
  });

const list = await (await auth("/admin/users?page=1&per_page=200")).json();
const user = list.users?.find((u) => u.email?.toLowerCase() === email);

if (!user) {
  console.error(`\nNo account for ${email}. Sign up first, then run this.\n`);
  exit(1);
}

if (user.email_confirmed_at) {
  console.log(`\n${email} was already confirmed.`);
} else {
  const response = await auth(`/admin/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({ email_confirm: true }),
  });
  if (!response.ok) {
    console.error(`\nFailed: ${(await response.text()).slice(0, 200)}\n`);
    exit(1);
  }
  console.log(`\n${email} is now confirmed.`);
}

if (newPassword) {
  const set = await auth(`/admin/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({ password: newPassword }),
  });
  if (!set.ok) {
    console.error(`\nCould not set the password: ${(await set.text()).slice(0, 200)}\n`);
    exit(1);
  }
  console.log(`Password for ${email} set.`);
}

console.log("\nSign in at http://localhost:5173/login with the password you chose.");
console.log("With no booking yet the portal offers Book a stay.\n");
