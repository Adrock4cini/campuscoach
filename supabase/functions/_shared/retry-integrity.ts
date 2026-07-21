export const ACTIVE_STUDY_ATTEMPT_MS = 30_000;

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
