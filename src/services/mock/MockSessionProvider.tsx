import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MockSession, Role } from "@/types";

/**
 * DEV / MOCK LOGIN.
 *
 * There is no authentication here. A role is chosen on the login screen and
 * kept in localStorage so a refresh does not bounce you out. Deleting this
 * file and the `<DevBadge />` is the whole removal job in Phase 2, where
 * Supabase Auth supplies the session and the guest identity comes from the
 * signed-in user rather than a hardcoded fixture id.
 */

/** The fixture guest the mock login signs in as — Pooja Bothra, who has a
 *  confirmed whole-villa booking at Villa Maaya. */
export const MOCK_GUEST_CUSTOMER_ID = "c-pooja";
export const MOCK_GUEST_BOOKING_ID = "b-1001";

const STORAGE_KEY = "hos.mock-session";

interface SessionContextValue {
  session: MockSession | null;
  signInAs: (role: Role) => MockSession;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const readStored = (): MockSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockSession) : null;
  } catch {
    return null;
  }
};

export function MockSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MockSession | null>(readStored);

  const signInAs = useCallback((role: Role) => {
    const next: MockSession =
      role === "admin"
        ? { role, name: "Anjali Rao" }
        : { role, name: "Pooja Bothra", customerId: MOCK_GUEST_CUSTOMER_ID };
    setSession(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private browsing — the session simply will not survive a refresh */
    }
    return next;
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  const value = useMemo(() => ({ session, signInAs, signOut }), [session, signInAs, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <MockSessionProvider>");
  return ctx;
}
