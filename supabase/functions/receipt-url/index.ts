/**
 * Hand back a short-lived signed URL for a payment receipt.
 *
 * The `payment-receipts` bucket is private and stays private — receipts carry
 * bank details and phone numbers. Nothing in the app ever holds a permanent
 * link to one; the admin queue asks for a fresh URL each time it renders.
 *
 * Storage RLS still applies because the caller's JWT is used, so a guest can
 * only ever sign a URL for a receipt on their own booking.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

const BUCKET = "payment-receipts";
const TTL_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }
  if (!body.paymentId) return fail("paymentId is required");

  // Reading the payment through the caller's client is the authorization check:
  // RLS returns nothing if this receipt is not theirs to see.
  const { data: payment, error: readError } = await supabase
    .from("payments")
    .select("id, receipt_path")
    .eq("id", body.paymentId)
    .maybeSingle();

  if (readError) return fail(readError.message, 400);
  if (!payment) return fail("No such receipt, or it is not yours to view", 404);
  if (!payment.receipt_path) return fail("That payment has no receipt attached", 404);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(payment.receipt_path, TTL_SECONDS);

  if (error) return fail(error.message, 400);

  return json({ url: data.signedUrl, expiresIn: TTL_SECONDS });
});
