// A study save performs several durable, owner-scoped updates. Give an active
// request enough time to finish on a slow mobile connection before a retry may
// reclaim its lease.
export const ACTIVE_STUDY_ATTEMPT_MS = 120_000;

export type StudyAttemptDisposition = "return-cached" | "wait" | "resume";

export function studyAttemptDisposition(
  status: string,
  startedAt: string,
  nowMs = Date.now(),
): StudyAttemptDisposition {
  if (status === "completed") return "return-cached";
  if (status === "failed") return "resume";
  const ageMs = nowMs - new Date(startedAt).getTime();
  return Number.isFinite(ageMs) && ageMs < ACTIVE_STUDY_ATTEMPT_MS
    ? "wait"
    : "resume";
}
