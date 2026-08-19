/**
 * Session resilience — a student must never be dumped at the login screen
 * because a phone was backgrounded, Safari suspended the tab, or the network
 * blipped for a second.
 *
 * Supabase already persists and refreshes the session. The missing piece is
 * *interpretation*: a momentary `getSession()` failure, an offline resume, or
 * a transient `INITIAL_SESSION` with no session must be treated as
 * "reconnecting", not as "this person signed out".
 *
 * Only two things end a session here:
 *   1. The student explicitly taps Sign out.
 *   2. Supabase reports SIGNED_OUT while the device is genuinely online
 *      (a real revoked/expired refresh token).
 */

export const KNOWN_SESSION_KEY = "cc_known_session_v1";

function safeStorage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Records that this device has held a valid session, so a blank read later is suspicious. */
export function rememberSignedIn(userId: string, storage?: Storage | null): void {
  const store = safeStorage(storage);
  if (!store || !userId) return;
  try {
    store.setItem(KNOWN_SESSION_KEY, "1");
  } catch {
    // Storage pressure must never break sign-in.
  }
}

/** Only ever called for an explicit sign out or a confirmed revoked session. */
export function forgetSignedIn(storage?: Storage | null): void {
  const store = safeStorage(storage);
  try {
    store?.removeItem(KNOWN_SESSION_KEY);
  } catch {
    // Best effort.
  }
}

export function hasRememberedSession(storage?: Storage | null): boolean {
  const store = safeStorage(storage);
  try {
    return store?.getItem(KNOWN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export type SessionLossDecision = "signed-out" | "recovering";

export interface SessionLossInput {
  /** Supabase auth event, or "bootstrap" for the initial getSession read. */
  event: string;
  /** True only when the student tapped Sign out in this app. */
  explicit: boolean;
  /** navigator.onLine at decision time; undefined when unknown. */
  online?: boolean;
  /** Whether this device previously held a real session. */
  remembered: boolean;
}

/**
 * Decides what an empty session means. Defaults to "recovering" whenever the
 * evidence is ambiguous — showing a reconnect card is always recoverable,
 * bouncing a signed-in student to /login is not.
 */
export function classifySessionLoss({
  event,
  explicit,
  online,
  remembered,
}: SessionLossInput): SessionLossDecision {
  if (explicit) return "signed-out";
  // Never signed in on this device: the login screen is the correct place.
  if (!remembered) return "signed-out";
  // Offline resume: Supabase cannot refresh, and that is not a logout.
  if (online === false) return "recovering";
  if (event === "SIGNED_OUT" || event === "USER_DELETED") return "signed-out";
  return "recovering";
}
