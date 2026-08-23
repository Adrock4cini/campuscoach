/**
 * Account setup resolution is a terminal state machine.
 *
 * The old code overloaded `onboarded === null` for "still loading", "profile
 * row missing", and "the query failed", so a single failed profile read left
 * every protected route stuck on "Checking your account setup…" forever.
 * Each outcome now has its own explicit, terminal state.
 */
export type SetupStatus = "checking" | "onboarded" | "needs_onboarding" | "error";

/** Why setup could not be resolved. Drives honest copy — never blame the network blindly. */
export type SetupErrorKind = "timeout" | "query" | "network" | null;

/** Bounded wait before a stalled profile read becomes a recoverable error. */
export const SETUP_RESOLUTION_TIMEOUT_MS = 6000;

export interface ProfileResolution {
  /** True when the query itself completed (even with zero rows). */
  ok: boolean;
  hasRow: boolean;
  onboardedAt: string | null;
  errorKind?: Exclude<SetupErrorKind, null>;
}

export function resolveSetupStatus(resolution: ProfileResolution): {
  status: SetupStatus;
  error: SetupErrorKind;
} {
  if (!resolution.ok) {
    return { status: "error", error: resolution.errorKind ?? "query" };
  }
  // A successful query with no row, or a row without the explicit completion
  // marker, is a finished answer: this account still needs setup.
  if (!resolution.hasRow || !resolution.onboardedAt) {
    return { status: "needs_onboarding", error: null };
  }
  return { status: "onboarded", error: null };
}

/** Classifies a thrown/returned Supabase error without pretending to know more than we do. */
export function classifySetupError(error: unknown): Exclude<SetupErrorKind, null> {
  const message = (
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  ).toLowerCase();
  if (!message) return "query";
  if (
    message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("network request failed")
    || message.includes("load failed")
  ) {
    return "network";
  }
  return "query";
}

export function setupErrorCopy(kind: SetupErrorKind): { title: string; description: string } {
  if (kind === "timeout") {
    return {
      title: "Your account setup is taking too long",
      description:
        "We couldn't finish checking your account. Nothing was changed — try again.",
    };
  }
  if (kind === "network") {
    return {
      title: "We couldn't reach your account",
      description:
        "Your device looks offline. Reconnect and try again — nothing you saved is lost.",
    };
  }
  return {
    title: "We couldn't check your account setup",
    description:
      "Something went wrong on our side while reading your account. Nothing was changed — try again.",
  };
}
