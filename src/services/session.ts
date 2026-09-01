import { createContext, useContext } from "react";
import type { MockSession } from "@/types";

/**
 * The session contract, separate from whatever fills it.
 *
 * Keeping the context here rather than inside SupabaseSessionProvider means a
 * consumer can be rendered without pulling in the Supabase client — which is
 * what lets `npm run smoke` render every route offline.
 */
export interface SessionContextValue {
  session: MockSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Guests only. The role is forced server-side — see the signup migration. */
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Emails a recovery link that lands on /reset-password. */
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  /** Changes the signed-in (or recovering) user's own password. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside a session provider");
  return ctx;
}
