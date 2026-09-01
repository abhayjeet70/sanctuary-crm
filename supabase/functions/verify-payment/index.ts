/**
 * Approve or reject an uploaded payment receipt.
 *
 * The transaction itself lives in the `approve_payment` / `reject_payment`
 * RPCs — this function is the operational wrapper around them: it validates the
 * request shape, and it is the place where the guest notification (email or
 * WhatsApp) gets sent once those providers are wired up.
 *
 * Authorization is not re-implemented here. The client carries the caller's
 * JWT, so the RPC's own `is_admin()` check is what decides, and a guest calling
 * this endpoint gets the same refusal they would get calling the RPC directly.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

const REASONS = [
  "wrong_amount",
  "unreadable_receipt",
  "duplicate_receipt",
  "wrong_bank_account",
  "invalid_transaction",
  "other",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let body: { paymentId?: string; action?: string; reason?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }

  const { paymentId, action, reason, note } = body;
  if (!paymentId) return fail("paymentId is required");
  if (action !== "approve" && action !== "reject") {
    return fail("action must be 'approve' or 'reject'");
  }

  if (action === "approve") {
    const { data, error } = await supabase.rpc("approve_payment", { p_payment_id: paymentId });
    if (error) return fail(error.message, error.code === "42501" ? 403 : 400);

    // Phase 3 hook: notify the guest that their payment cleared. Deliberately
    // after the RPC, so a failed email can never roll back an approved payment.
    return json({ ok: true, action, payment: data });
  }

  if (!reason || !REASONS.includes(reason as (typeof REASONS)[number])) {
    return fail(`reason must be one of: ${REASONS.join(", ")}`);
  }
  if (reason === "other" && !note?.trim()) {
    return fail("Choosing 'other' requires a note explaining what was wrong");
  }

  const { data, error } = await supabase.rpc("reject_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
    p_note: note ?? null,
  });
  if (error) return fail(error.message, error.code === "42501" ? 403 : 400);

  return json({ ok: true, action, payment: data });
});
