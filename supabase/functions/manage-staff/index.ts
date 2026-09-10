/**
 * Give an employee a login, or take one away.
 *
 * ── On the service-role key ──────────────────────────────────────────────
 * Creating an auth user, setting a password and banning an account are admin
 * operations the anon key cannot perform. This is the second function that
 * holds the service key, and like invite-guest it authorises the CALLER first,
 * with the caller's own JWT: they must be the owner. The privileged client is
 * never used to decide who may do what — only to carry out what has already
 * been allowed.
 *
 * Only the owner, not a manager. Handing out logins is how someone grants
 * themselves a second account with a role they were not given.
 *
 * The generated password is returned exactly once, in the response. It is
 * never stored: GoTrue keeps only a bcrypt hash, and an admin who loses the
 * slip issues a new one rather than reading the old.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

/**
 * A password a person can read down a phone line and still not guess.
 *
 * No l/1/I or O/0, because these get dictated across a kitchen. Drawn from
 * crypto.getRandomValues rather than Math.random — this is a credential.
 */
function generatePassword(length = 14): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

type Action = "create_account" | "reset_password" | "revoke_account";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let body: { employeeId?: string; action?: Action; role?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }

  const { employeeId, action } = body;
  if (!employeeId) return fail("employeeId is required");
  if (!action) return fail("action is required");

  // ---- Authorise the caller with THEIR permissions, before the service key.
  const { data: isOwner, error: roleError } = await supabase.rpc("is_owner");
  if (roleError) return fail(roleError.message, 400);
  if (!isOwner) return fail("Only the owner can manage staff logins", 403);

  const { data: employee, error: readError } = await supabase
    .from("employees")
    .select("id, full_name, email, team, department_id, status, profile_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (readError) return fail(readError.message, 400);
  if (!employee) return fail("No such employee", 404);

  // A role sent from the browser is not trusted for anything but a choice
  // between the two we allow. An owner is never created this way.
  const requested = body.role === "manager" ? "manager" : "staff";

  // ---- Privileged section.
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return fail("Server is missing its service role key", 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });

  if (action === "revoke_account") {
    if (!employee.profile_id) return fail("That employee has no login", 422);
    // Banned rather than deleted: their name stays on past bookings, requests
    // and activity, and deleting the user would take that history with it.
    const { error } = await admin.auth.admin.updateUserById(employee.profile_id, {
      ban_duration: "876000h",
    });
    if (error) return fail(error.message, 400);
    return json({ ok: true, action, revoked: true });
  }

  if (action === "reset_password") {
    if (!employee.profile_id) return fail("That employee has no login", 422);
    const password = generatePassword();
    const { error } = await admin.auth.admin.updateUserById(employee.profile_id, {
      password,
      ban_duration: "none",
    });
    if (error) return fail(error.message, 400);
    return json({ ok: true, action, password, email: employee.email });
  }

  // ---- create_account
  const email = employee.email?.trim().toLowerCase();
  if (!email) return fail("Add an email address to this employee first", 422);
  if (employee.profile_id) return fail("That employee already has a login", 409);

  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (existing?.users.some((u) => u.email?.toLowerCase() === email)) {
    return fail("Somebody already signs in with that address", 409);
  }

  const password = generatePassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // The property vouches for its own staff.
    app_metadata: { role: requested, provider: "email", providers: ["email"] },
    user_metadata: { full_name: employee.full_name },
  });

  if (createError) return fail(createError.message, 400);
  const userId = created.user?.id;
  if (!userId) return fail("The account was not created", 500);

  // The signup trigger writes a guest profile from app_metadata; staff need
  // their role and team on it, and the roster needs the link back.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: userId,
      role: requested,
      full_name: employee.full_name,
      team: employee.team,
      // The department is what the policies read; `team` is carried along
      // only so older rows stay legible.
      department_id: employee.department_id,
      customer_id: null,
    });
  if (profileError) return fail(profileError.message, 400);

  const { error: linkError } = await admin
    .from("employees")
    .update({ profile_id: userId })
    .eq("id", employee.id);
  if (linkError) return fail(linkError.message, 400);

  return json({
    ok: true,
    action,
    email,
    password,
    role: requested,
    // Shown once and not stored anywhere. Say so, so nobody goes looking.
    note: "Give this to them now — it cannot be shown again, only replaced.",
  });
});
