/**
 * Route memory — returning from another app (or an iOS tab reload) should put
 * the student back where they were, not on Today.
 *
 * Only in-app, non-destructive routes are remembered. Auth screens, one-shot
 * flows, and anything with a confirmation semantic are never restored.
 */

export const LAST_ROUTE_KEY = "cc_last_route_v1";

/**
 * Today/Dashboard is the product home. Default entry (plain sign-in, root,
 * onboarding or agreement completion without an explicit destination) always
 * resolves here — never to whichever tab happened to be visited last.
 */
export const DEFAULT_HOME_ROUTE = "/dashboard";

/** Resolves an entry destination: an intentional deep link, else Today. */
export function resolveEntryRoute(next?: unknown): string {
  if (typeof next === "string" && next !== "/" && isRestorableRoute(next)) return next;
  return DEFAULT_HOME_ROUTE;
}

const NEVER_RESTORE = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/family-beta-agreement",
  "/onboarding",
  "/privacy",
  "/terms",
];

function safeStorage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isRestorableRoute(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.length > 300) return false;
  if (path === "/") return false;
  const pathname = path.split("?")[0];
  return !NEVER_RESTORE.some((blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`));
}

export function writeLastRoute(path: string, storage?: Storage | null): void {
  if (!isRestorableRoute(path)) return;
  try {
    safeStorage(storage)?.setItem(LAST_ROUTE_KEY, path);
  } catch {
    // Remembering the route is a convenience, never a requirement.
  }
}

export function readLastRoute(storage?: Storage | null): string | null {
  let raw: string | null = null;
  try {
    raw = safeStorage(storage)?.getItem(LAST_ROUTE_KEY) ?? null;
  } catch {
    return null;
  }
  return isRestorableRoute(raw) ? raw : null;
}

export function clearLastRoute(storage?: Storage | null): void {
  try {
    safeStorage(storage)?.removeItem(LAST_ROUTE_KEY);
  } catch {
    // Best effort.
  }
}
