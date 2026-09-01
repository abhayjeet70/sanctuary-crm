import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./client";
import { SessionContext } from "@/services/session";
import type { MockSession, Role } from "@/types";

/**
 * Real authentication, behind the same `useSession()` shape the mock provider
 * exposed — so no page component changed when this replaced it.
 *
 * The role comes from the `profiles` row, which a database trigger mirrors into
 * the JWT's app_metadata. RLS reads the claim; this reads the table. Either way
 * the browser is never the authority on who is an admin: the route guard is a
 * convenience, and the policies decide.
 */
export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MockSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    /** Resolve an auth user into the app's session shape. */
    const hydrate = async (userId: string | undefined, email: string | undefined) => {
      if (!userId) {
        if (active) {
          setSession(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role, full_name, customer_id, team")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;
      setSession({
        role: (data?.role as Role) ?? "guest",
        name: data?.full_name || email?.split("@")[0] || "Guest",
        email,
        customerId: data?.customer_id ?? undefined,
        team: data?.team ?? undefined,
      });
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      void hydrate(data.session?.user.id, data.session?.user.email);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      // Deliberately not awaited: the callback runs inside the auth lock, and
      // querying Supabase from within it can deadlock the client.
      void hydrate(next?.user.id, next?.user.email);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      // GoTrue says "Invalid login credentials" for both a wrong password and a
      // missing account, on purpose — it does not confirm who has an account.
      return { error: error.message };
    }
    return { error: null };
  }, []);

  /**
   * Create a guest account.
   *
   * `full_name` is the only thing passed through from the client. A `role` sent
   * here is ignored: the database trigger reads the role from app_metadata only,
   * because user_metadata is whatever the browser chose to send.
   */
  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    if (error) return { error: error.message, needsConfirmation: false };

    // A session here means confirmations are off; otherwise the account exists
    // but cannot sign in until the emailed link is followed.
    return { error: null, needsConfirmation: !data.session };
  }, []);

  /**
   * Recovery mail. The link carries a short-lived session, so /reset-password
   * can call updatePassword without the old password.
   */
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, signIn, signUp, signOut, resetPassword, updatePassword }),
    [session, loading, signIn, signUp, signOut, resetPassword, updatePassword],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

