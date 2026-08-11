/**
 * A persisted capture is authoritative on retries. The request kind is only a
 * fallback for legacy calls that do not reference a durable capture.
 */
export function resolveCaptureKind(
  storedKind: string | null | undefined,
  requestedKind: string | null | undefined,
): string | null {
  return storedKind ?? requestedKind ?? null;
}
