/**
 * Truthful student-facing failure copy.
 *
 * Two rules, both learned from live testing:
 *   1. Never show raw transport text ("Edge Function returned a non-2xx
 *      status code") — it tells a student nothing and looks broken.
 *   2. Never blame the connection unless the failure really was a network
 *      failure. Blaming the network for a server rejection teaches students
 *      to distrust their own working internet.
 */

/** Raw strings that only ever mean "the request never reached the server". */
const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /network ?error/i,
  /networkrequestfailed/i,
  /load failed/i,
  /timed? ?out/i,
  /aborted/i,
  /offline/i,
];

/** Raw transport noise that must never be shown verbatim. */
const OPAQUE_PATTERNS = [
  /non-2xx status code/i,
  /functionshttperror/i,
  /functionsfetcherror/i,
  /functionsrelayerror/i,
  /^\[object Object\]$/,
];

export function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return false;
  if (OPAQUE_PATTERNS.some((pattern) => pattern.test(message))) return false;
  return NETWORK_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Turn any thrown value into one honest sentence.
 *
 * `fallback` describes what could not be finished, e.g. "We couldn't save
 * your answers". The returned sentence always ends with a next step and never
 * invents a cause.
 */
export function describeStudentFacingFailure(error: unknown, fallback: string): string {
  const message = (error instanceof Error ? error.message : String(error ?? "")).trim();

  if (isNetworkFailure(error)) {
    return `${fallback} — your device looks offline. Reconnect and try again.`;
  }
  if (!message || OPAQUE_PATTERNS.some((pattern) => pattern.test(message))) {
    // A server-side rejection with no usable detail. Say so plainly instead of
    // guessing at the student's connection.
    return `${fallback} — Campus Companion had a problem on our side. Try again in a moment.`;
  }
  return `${fallback} — ${message}`;
}
