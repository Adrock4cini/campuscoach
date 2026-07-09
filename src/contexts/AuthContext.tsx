/**
 * AuthContext — single source of truth for the current student session.
 *
 * Signed-in path: `session` / `user` come from Supabase. We also mirror
 * `user.id` into `setAuthUserId()` so the legacy `getAnonUserId()` helper
 * (used by capture / class / intelligence writes) automatically starts
 * writing rows keyed to `auth.uid()`, which is what our RLS policies expect.
 *
 * Signed-out path: `isDemoMode` becomes true once the user explicitly opts
 * into demo mode (from the login screen). All existing localStorage flows
 * keep working.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setAuthUserId } from "@/hooks/useClassIntelligence";

const DEMO_KEY = "cc_demo_mode_v1";

type Profile = { display_name: string | null; onboarded_at: string | null } | null;

/**
 * `mode` is the SINGLE source of truth for demo-vs-real rendering.
 *   - "real": authenticated user, NOT in explicit demo mode → real data only.
 *   - "demo": explicit opt-in demo (or anon user viewing the demo tour).
 *   - "loading": auth state still resolving — render neutral empty UI, never demo.
 */
type DataMode = "real" | "demo" | "loading";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  onboarded: boolean | null; // null = still loading
  isDemoMode: boolean;
  profile: Profile;
  mode: DataMode;
  enableDemoMode: () => void;
  signOut: () => Promise<void>;
  refreshOnboarded: () => Promise<void>;
};


const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [isDemoMode, setDemo] = useState<boolean>(
    typeof window !== "undefined" && localStorage.getItem(DEMO_KEY) === "1"
  );

  const loadProfile = async (userId: string | undefined | null) => {
    if (!userId) {
      setOnboarded(null);
      setProfile(null);
      return;
    }
    try {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, onboarded_at")
        .eq("user_id", userId)
        .maybeSingle();
      setProfile(data ?? null);
      setOnboarded(!!data?.onboarded_at);
    } catch {
      setProfile(null);
      setOnboarded(false);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthUserId(s?.user?.id ?? null);
      if (s) {
        localStorage.removeItem(DEMO_KEY);
        setDemo(false);
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setOnboarded(null);
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthUserId(data.session?.user?.id ?? null);
      setLoading(false);
      if (data.session?.user?.id) loadProfile(data.session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const mode: DataMode = loading
    ? "loading"
    : session?.user
      ? (isDemoMode ? "demo" : "real")
      : (isDemoMode ? "demo" : "demo"); // anon = demo tour

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      onboarded,
      isDemoMode,
      profile,
      mode,

      enableDemoMode: () => {
        localStorage.setItem(DEMO_KEY, "1");
        setDemo(true);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setAuthUserId(null);
        setOnboarded(null);
        setProfile(null);
      },
      refreshOnboarded: () => loadProfile(session?.user?.id),
    }),
    [session, loading, isDemoMode, onboarded, profile]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
