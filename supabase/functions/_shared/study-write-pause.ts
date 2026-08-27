export const STUDY_WRITES_PAUSED_REASON = "study_writes_paused";

export const STUDY_WRITES_PAUSED_RESPONSE = {
  error: "Study writes are temporarily paused. Please try again shortly.",
  reason: STUDY_WRITES_PAUSED_REASON,
  retryable: true,
} as const;

interface PauseRpcResult {
  data: unknown;
  error: unknown;
}

export interface StudyWritePauseGate {
  blocked: boolean;
  lookupFailed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read the private rollout control through its service-only RPC.
 *
 * An absent, malformed or failed control read is blocked deliberately. That
 * keeps a database rollout from accepting new writes when the release gate
 * itself is unavailable or has not been installed correctly.
 */
export async function checkStudyWritesPaused(
  invoke: () => PromiseLike<PauseRpcResult>,
): Promise<StudyWritePauseGate> {
  try {
    const { data, error } = await invoke();
    if (error || !isRecord(data) || typeof data.paused !== "boolean") {
      return { blocked: true, lookupFailed: true };
    }
    return { blocked: data.paused, lookupFailed: false };
  } catch {
    return { blocked: true, lookupFailed: true };
  }
}
