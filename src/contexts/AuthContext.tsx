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
import {
  classifySessionLoss,
  forgetSignedIn,
  hasRememberedSession,
  rememberSignedIn,
} from "@/lib/auth/sessionResilience";
import { clearLastRoute } from "@/lib/app/routeMemory";
import { clearStudyRunnerState } from "@/lib/study/studyRunnerState";
import { clearCaptureDraft } from "@/lib/capture/captureDraft";
import {
  classifySetupError,
  resolveSetupStatus,
  SETUP_RESOLUTION_TIMEOUT_MS,
  type SetupErrorKind,
  type SetupStatus,
} from "@/lib/auth/setupStatus";
import {
  acceptCurrentFamilyBetaAgreement,
  getFamilyBetaAgreementStatus,
} from "@/lib/legal/familyBetaAgreementService";
import { demoModeEnabled } from "@/lib/legal/familyBeta";


const DEMO_KEY = "cc_demo_mode_v1";
export const SESSION_RECOVERY_RECHECK_MS = 1500;
export const SESSION_RECOVERY_NULL_LIMIT = 2;

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
export type FamilyBetaAgreementStatus = "checking" | "accepted" | "required" | "error";

export const AGREEMENT_RESOLUTION_TIMEOUT_MS = 8_000;

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when a known session could not be read yet (offline / refresh in flight). */
  recovering: boolean;
  onboarded: boolean | null; // derived from setupStatus; null = not yet resolved
  /** Terminal setup resolution: checking | onboarded | needs_onboarding | error. */
  setupStatus: SetupStatus;
  setupError: SetupErrorKind;
  /** Server-backed current agreement receipt; Auth metadata is never trusted. */
  agreementStatus: FamilyBetaAgreementStatus;
  isDemoMode: boolean;
  profile: Profile;
  mode: DataMode;
  enableDemoMode: () => void;
  signOut: () => Promise<void>;
  refreshOnboarded: () => Promise<void>;
  refreshAgreement: () => Promise<boolean>;
  acceptAgreement: () => Promise<boolean>;
};


const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("checking");
  const [setupError, setSetupError] = useState<SetupErrorKind>(null);
  const [agreementStatus, setAgreementStatus] = useState<FamilyBetaAgreementStatus>("checking");
  const [profile, setProfile] = useState<Profile>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const profileRequestVersion = useRef(0);
  const agreementRequestVersion = useRef(0);
  const [isDemoMode, setDemo] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (!demoModeEnabled()) {
      // A value left by a preview/staging build is not authorization to enter
      // protected routes in the closed invite-only production release.
      localStorage.removeItem(DEMO_KEY);
      return false;
    }
    return localStorage.getItem(DEMO_KEY) === "1";
  });

  const loadAgreement = async (userId: string | undefined | null): Promise<boolean> => {
    const request = ++agreementRequestVersion.current;
    if (!userId) {
      setAgreementStatus("checking");
      return false;
    }
    setAgreementStatus("checking");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("agreement status timed out")), AGREEMENT_RESOLUTION_TIMEOUT_MS);
    });

    try {
      const receipt = await Promise.race([
        getFamilyBetaAgreementStatus(),
        timeout,
      ]);
      if (request !== agreementRequestVersion.current) return false;
      if (receipt.ownerId !== userId) throw new Error("agreement owner mismatch");
      setAgreementStatus(receipt.accepted ? "accepted" : "required");
      return receipt.accepted;
    } catch (error) {
      if (request !== agreementRequestVersion.current) return false;
      console.warn("[auth] agreement status load failed", error);
      setAgreementStatus("error");
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const loadProfile = async (userId: string | undefined | null) => {
    const request = ++profileRequestVersion.current;
    if (!userId) {
      setSetupStatus("checking");
      setSetupError(null);
      setProfile(null);
      return;
    }
    // A retry must visibly re-enter "checking" before producing a new answer.
    setSetupStatus("checking");
    setSetupError(null);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), SETUP_RESOLUTION_TIMEOUT_MS);
    });

    try {
      const query = supabase
        .from("profiles")
        .select("display_name, onboarded_at, learner_type, term, school_id, work_schedule, schools(name)")
        .eq("user_id", userId)
        .maybeSingle();

      const outcome = await Promise.race([
        Promise.resolve(query).then((value) => ({ kind: "result" as const, value })),
        timeout.then(() => ({ kind: "timeout" as const })),
      ]);
      if (request !== profileRequestVersion.current) return;

      if (outcome.kind === "timeout") {
        console.warn("[auth] profile load timed out");
        setProfile(null);
        setSetupStatus("error");
        setSetupError("timeout");
        return;
      }

      const profileResult = outcome.value as {
        data: unknown;
        error: { message?: string } | null;
      };
      if (profileResult.error) {
        console.warn("[auth] profile load failed", profileResult.error);
        setProfile(null);
        setSetupStatus("error");
        setSetupError(classifySetupError(profileResult.error?.message ?? ""));
        return;
      }

      const nextProfile = (profileResult.data ?? null) as Profile;
      setProfile(nextProfile ?? null);
      const resolved = resolveSetupStatus({
        ok: true,
        hasRow: Boolean(nextProfile),
        onboardedAt: nextProfile?.onboarded_at ?? null,
      });
      setSetupStatus(resolved.status);
      setSetupError(resolved.error);
    } catch (error) {
      if (request !== profileRequestVersion.current) return;
      console.warn("[auth] setup status load failed", error);
      setProfile(null);
      setSetupStatus("error");
      setSetupError(classifySetupError(error));
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const acceptAgreement = async (): Promise<boolean> => {
    try {
      const receipt = await acceptCurrentFamilyBetaAgreement();
      const activeUserId = activeUserIdRef.current;
      if (activeUserId && receipt.ownerId !== activeUserId) {
        throw new Error("agreement owner mismatch");
      }
      agreementRequestVersion.current += 1;
      setAgreementStatus("accepted");
      return true;
    } catch (error) {
      console.warn("[auth] agreement acceptance failed", error);
      return false;
    }
  };


  const explicitSignOutRef = useRef(false);
  const [recovering, setRecovering] = useState<boolean>(
    () => typeof window !== "undefined" && hasRememberedSession(),
  );

  useEffect(() => {
    let active = true;
    let authRevision = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveOnlineNullReads = 0;
    setSupabaseNetworkMode("loading");

    function cancelRecoveryCheck() {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }

    function settleSignedOut() {
      cancelRecoveryCheck();
      consecutiveOnlineNullReads = 0;
      forgetSignedIn();
      activeUserIdRef.current = null;
      profileRequestVersion.current += 1;
      agreementRequestVersion.current += 1;
      setRecovering(false);
      // A closed invite-only build must not silently become a sample-data
      // client after a real sign-out. Only a build where demo access is
      // explicitly available may switch the data policy to demo.
      setSupabaseNetworkMode(demoModeEnabled() ? "demo" : "loading");
      setSession(null);
      setAuthUserId(null);
      setSetupStatus("checking");
      setSetupError(null);
      setAgreementStatus("checking");
      setProfile(null);
    }

    function scheduleRecoveryCheck() {
      if (
        !active
        || recoveryTimer
        || (typeof navigator !== "undefined" && navigator.onLine === false)
      ) return;
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        void supabase.auth.getSession()
          .then(({ data, error }) => {
            if (!active) return;
            if (error) {
              // Network/auth-service errors remain ambiguous. Retry without
              // counting them as evidence that the refresh token is gone.
              scheduleRecoveryCheck();
              return;
            }
            if (data.session) {
              consecutiveOnlineNullReads = 0;
              applySession(data.session, "recovery-check");
              return;
            }
            consecutiveOnlineNullReads += 1;
            if (consecutiveOnlineNullReads >= SESSION_RECOVERY_NULL_LIMIT) {
              // Repeated successful online reads with no session are
              // authoritative. Clear a stale remembered marker instead of
              // trapping this device on Reconnecting forever.
              settleSignedOut();
              return;
            }
            scheduleRecoveryCheck();
          })
          .catch(() => {
            if (active) scheduleRecoveryCheck();
          });
      }, SESSION_RECOVERY_RECHECK_MS);
    }

    function applySession(nextSession: Session | null, event: string) {
      if (!active) return;
      if (nextSession?.user) {
        cancelRecoveryCheck();
        consecutiveOnlineNullReads = 0;
        const sameUser = activeUserIdRef.current === nextSession.user.id;
        activeUserIdRef.current = nextSession.user.id;
        rememberSignedIn(nextSession.user.id);
        setRecovering(false);
        setSupabaseNetworkMode("real");
        setSession(nextSession);
        setAuthUserId(nextSession.user.id);
        localStorage.removeItem(DEMO_KEY);
        setDemo(false);
        // INITIAL_SESSION, TOKEN_REFRESHED, focus and mobile resume routinely
        // repeat the same account. They update credentials only; clearing the
        // settled profile/setup state here used to unmount every protected page.
        if (sameUser) return;
        profileRequestVersion.current += 1;
        agreementRequestVersion.current += 1;
        setSetupStatus("checking");
        setSetupError(null);
        setAgreementStatus("checking");
        setProfile(null);
        setTimeout(() => {
          if (!active) return;
          void loadProfile(nextSession.user.id);
          void loadAgreement(nextSession.user.id);
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
        scheduleRecoveryCheck();
        return;
      }

      settleSignedOut();
    }

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
          applySession(data.session, "resume");
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
      cancelRecoveryCheck();
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
        : demoModeEnabled()
          ? "demo" // anonymous visitors use the sample tour only where enabled
          : "loading"; // settled closed-beta sign-out; route guards render outside the sample shell

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
      onboarded: setupStatus === "onboarded" ? true : setupStatus === "needs_onboarding" ? false : null,
      setupStatus,
      setupError,
      agreementStatus,
      isDemoMode,
      profile,
      mode,

      enableDemoMode: () => {
        // A sample surface must never coexist with an authenticated Supabase
        // session. Several legacy demo pages still import write clients
        // directly, so this is an account-safety invariant—not a UI preference.
        if (session?.user || !demoModeEnabled()) {
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
          agreementRequestVersion.current += 1;
          setRecovering(false);
          setSession(null);
          setAuthUserId(null);
          setSetupStatus("checking");
          setSetupError(null);
          setAgreementStatus("checking");
          setProfile(null);
          explicitSignOutRef.current = false;
        }
      },
      refreshOnboarded: () => loadProfile(session?.user?.id),
      refreshAgreement: () => loadAgreement(session?.user?.id),
      acceptAgreement,
    }),
    [session, loading, recovering, isDemoMode, setupStatus, setupError, agreementStatus, profile, mode]
  );


  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
