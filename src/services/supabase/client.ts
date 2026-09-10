import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser client, carrying the anon key.
 *
 * That key is public by design — it identifies the project, it does not grant
 * anything. Every row this client can reach is decided by the RLS policies in
 * `supabase/migrations/20260901122935_rls_policies.sql`. The service-role key
 * is never used in the browser and is not in this repo.
 *
 * It is created lazily, on first use rather than on import. Importing this
 * module must stay free of side effects: components several layers up import it
 * transitively, and `npm run smoke` renders those components in Node where
 * `import.meta.env` does not exist. Eager creation there threw before a single
 * route rendered.
 */
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;

  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.",
    );
  }

  cached = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cached;
}

/** Behaves exactly like a SupabaseClient; construction is deferred to first
 *  property access, which is what keeps the import side-effect free. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const RECEIPTS_BUCKET = "payment-receipts";
/** Photo IDs taken at check-in. Private, and management-only in both
 *  directions — see the storage policies in the front-desk migration. */
export const GUEST_IDS_BUCKET = "guest-ids";
