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
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setAuthUserId } from "@/hooks/useClassIntelligence";
import { completeOAuthPasskeyOffer } from "@/lib/auth/passkeys";
import { setSupabaseNetworkMode } from "@/lib/demo/supabaseNetworkPolicy";

const DEMO_KEY = "cc_demo_mode_v1";

type Profile = {
  display_name: string | null;
  onboarded_at: string | null;
  learner_type: string | null;
  term: string | null;
  school_id: string | null;
  work_schedule: string | null;
  schools: { name: string } | null;
} | null;

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
  const profileRequestVersion = useRef(0);
  const [isDemoMode, setDemo] = useState<boolean>(
    typeof window !== "undefined" && localStorage.getItem(DEMO_KEY) === "1"
  );

  const loadProfile = async (userId: string | undefined | null) => {
    const request = ++profileRequestVersion.current;
    if (!userId) {
      setOnboarded(null);
      setProfile(null);
      return;
    }
    try {
      const profileResult = await supabase
        .from("profiles")
        .select("display_name, onboarded_at, learner_type, term, school_id, work_schedule, schools(name)")
        .eq("user_id", userId)
        .maybeSingle();
      if (request !== profileRequestVersion.current) return;
      if (profileResult.error) {
        console.warn("[auth] profile load failed", profileResult.error);
        setProfile(null);
        // Setup completion is an explicit marker. A class may have been saved
        // just before a later onboarding write failed, so class count alone is
        // never proof that the whole setup completed.
        setOnboarded(null);
        return;
      }

      const nextProfile = profileResult.data as Profile;
      setProfile(nextProfile ?? null);
      setOnboarded(Boolean(nextProfile?.onboarded_at));
    } catch (error) {
      if (request !== profileRequestVersion.current) return;
      console.warn("[auth] setup status load failed", error);
      setProfile(null);
      setOnboarded(null);
    }
  };

  useEffect(() => {
    let active = true;
    let authRevision = 0;
    setSupabaseNetworkMode("loading");

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      profileRequestVersion.current += 1;
      setSupabaseNetworkMode(nextSession?.user ? "real" : "demo");
      setSession(nextSession);
      setAuthUserId(nextSession?.user?.id ?? null);
      if (nextSession) {
        localStorage.removeItem(DEMO_KEY);
        setDemo(false);
        setOnboarded(null);
        setProfile(null);
        setTimeout(() => {
          if (active) void loadProfile(nextSession.user.id);
        }, 0);
      } else {
        setOnboarded(null);
        setProfile(null);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authRevision += 1;
      applySession(nextSession);
      setLoading(false);
      if (event === "SIGNED_IN" && nextSession?.user?.id) {
        completeOAuthPasskeyOffer(nextSession.user.id);
      }
    });

    const bootstrapRevision = authRevision;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authRevision !== bootstrapRevision) return;
        if (error) {
          console.warn("[auth] session restore failed", error);
          return;
        }
        applySession(data.session);
      })
      .catch((error) => {
        if (active) console.warn("[auth] session restore failed", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      setSupabaseNetworkMode("loading");
      sub.subscription.unsubscribe();
    };
  }, []);

  const mode: DataMode = loading
    ? "loading"
    : session?.user
      ? "real"
      : "demo"; // anonymous visitors use the sample tour

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
        // A sample surface must never coexist with an authenticated Supabase
        // session. Several legacy demo pages still import write clients
        // directly, so this is an account-safety invariant—not a UI preference.
        if (session?.user) {
          localStorage.removeItem(DEMO_KEY);
          setDemo(false);
          return;
        }
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
    [session, loading, isDemoMode, onboarded, profile, mode]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
