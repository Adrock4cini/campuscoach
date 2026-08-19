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

  const explicitSignOutRef = useRef(false);
  const [recovering, setRecovering] = useState<boolean>(
    () => typeof window !== "undefined" && hasRememberedSession(),
  );

  useEffect(() => {
    let active = true;
    let authRevision = 0;
    setSupabaseNetworkMode("loading");

    const applySession = (nextSession: Session | null, event: string) => {
      if (!active) return;
      profileRequestVersion.current += 1;
      if (nextSession?.user) {
        rememberSignedIn(nextSession.user.id);
        setRecovering(false);
        setSupabaseNetworkMode("real");
        setSession(nextSession);
        setAuthUserId(nextSession.user.id);
        localStorage.removeItem(DEMO_KEY);
        setDemo(false);
        setOnboarded(null);
        setProfile(null);
        setTimeout(() => {
          if (active) void loadProfile(nextSession.user.id);
        }, 0);
        return;
      }

      // No session. Decide whether this is a real sign-out or a device that is
      // simply offline / mid-refresh. Guessing "signed out" would eject a
      // signed-in student to the login screen, which is what iPhone users hit.
      const decision = classifySessionLoss({
        event,
        explicit: explicitSignOutRef.current,
        online: typeof navigator === "undefined" ? undefined : navigator.onLine,
        remembered: hasRememberedSession(),
      });

      if (decision === "recovering") {
        setRecovering(true);
        // Keep the last known session object in place: React Query and page
        // state stay mounted while Supabase retries its refresh.
        return;
      }

      forgetSignedIn();
      setRecovering(false);
      setSupabaseNetworkMode("demo");
      setSession(null);
      setAuthUserId(null);
      setOnboarded(null);
      setProfile(null);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authRevision += 1;
      applySession(nextSession, event);
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
          // A failed read is a network problem, never proof of a logout.
          console.warn("[auth] session restore failed", error);
          if (hasRememberedSession()) setRecovering(true);
          return;
        }
        applySession(data.session, "bootstrap");
      })
      .catch((error) => {
        if (!active) return;
        console.warn("[auth] session restore failed", error);
        if (hasRememberedSession()) setRecovering(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Backgrounding, tab suspension, and regained connectivity all resume here.
    // We only ever *ask* Supabase to re-read the persisted session; a failure
    // leaves the student exactly where they were.
    const resume = () => {
      if (!active) return;
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active || error) return;
          if (data.session) applySession(data.session, "resume");
        })
        .catch(() => {
          /* Offline resume: stay put. */
        });
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") resume();
    };

    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", resume);
      window.addEventListener("online", resume);
      window.addEventListener("focus", onVisible);
    }

    return () => {
      active = false;
      setSupabaseNetworkMode("loading");
      sub.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("pageshow", resume);
        window.removeEventListener("online", resume);
        window.removeEventListener("focus", onVisible);
      }
    };
  }, []);

  const mode: DataMode = loading
    ? "loading"
    : session?.user
      ? "real"
      : recovering
        ? "loading" // reconnecting: never fall back to sample data
        : "demo"; // anonymous visitors use the sample tour

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
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
        // The only intentional exit. Everything else is treated as recoverable.
        explicitSignOutRef.current = true;
        forgetSignedIn();
        clearLastRoute();
        clearStudyRunnerState();
        clearCaptureDraft();
        try {
          await supabase.auth.signOut();
        } finally {
          setRecovering(false);
          setSession(null);
          setAuthUserId(null);
          setOnboarded(null);
          setProfile(null);
          explicitSignOutRef.current = false;
        }
      },
      refreshOnboarded: () => loadProfile(session?.user?.id),
    }),
    [session, loading, recovering, isDemoMode, onboarded, profile, mode]
  );


  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
