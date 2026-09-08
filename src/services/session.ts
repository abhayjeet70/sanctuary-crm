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

/**
 * Whether to show combined financial figures — total billed, outstanding
 * across the book, lifetime spend per guest.
 *
 * The owner's numbers, not the manager's. Worth being clear that this is a
 * display decision and not a boundary: a manager reads individual bookings
 * because verifying a payment requires it, so nothing stops them adding the
 * figures up. It keeps the business's position off screens the manager works
 * on all day; it does not withhold it from someone determined to total it.
 */
export function useShowsFinancials() {
  return useSession().session?.role === "admin";
}
