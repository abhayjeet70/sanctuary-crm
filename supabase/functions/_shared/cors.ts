export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const fail = (message: string, status = 400) => json({ error: message }, status);

/**
 * A Supabase client carrying the CALLER's JWT, not the service role.
 *
 * This matters: every query and RPC made through it runs under that user's RLS
 * policies. An edge function that used the service-role key would bypass every
 * policy in the schema and become the weakest link in the system, so none of
 * these functions do.
 */
export async function callerClient(req: Request) {
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return null;

  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
}
