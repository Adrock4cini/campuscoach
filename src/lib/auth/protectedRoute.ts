import type { SetupStatus } from "./setupStatus";

/**
 * Setup routing is derived from the terminal setup state machine, never from a
 * nullable boolean. "checking" and "error" are rendered as visible states by the
 * caller; only a resolved `needs_onboarding` redirects.
 */
export function getOnboardingRedirect({
  signedIn,
  setupStatus,
  pathname,
}: {
  signedIn: boolean;
  setupStatus: SetupStatus;
  pathname: string;
}): "/onboarding" | null {
  if (!signedIn || pathname === "/onboarding") return null;
  return setupStatus === "needs_onboarding" ? "/onboarding" : null;
}

/** Which blocking panel (if any) a protected route must render before its children. */
export function getSetupGate({
  signedIn,
  setupStatus,
}: {
  signedIn: boolean;
  setupStatus: SetupStatus;
}): "checking" | "error" | null {
  if (!signedIn) return null;
  if (setupStatus === "checking") return "checking";
  if (setupStatus === "error") return "error";
  return null;
}
