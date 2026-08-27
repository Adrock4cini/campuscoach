export const MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS = 360;

export type AssignmentPracticeSourceStatus =
  | "not_required"
  | "processing"
  | "needs_review"
  | "confirmed";

export interface AssignmentPracticeSource {
  status: AssignmentPracticeSourceStatus;
  text: string | null;
  version: number;
  hash: string | null;
  confirmedAt: string | null;
}

const VALID_STATUS = new Set<AssignmentPracticeSourceStatus>([
  "not_required",
  "processing",
  "needs_review",
  "confirmed",
]);

const EMPTY_SOURCE: AssignmentPracticeSource = {
  status: "not_required",
  text: null,
  version: 0,
  hash: null,
  confirmedAt: null,
};

/**
 * Older capture rows do not have the review fields. Assignment captures fail
 * closed to review; every other capture keeps its existing typed-study path.
 */
export function assignmentPracticeSourceFromUnknown(
  value: unknown,
  captureKind: string,
): AssignmentPracticeSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return captureKind === "scan-assignment"
      ? { ...EMPTY_SOURCE, status: "needs_review" }
      : { ...EMPTY_SOURCE };
  }

  const candidate = value as Record<string, unknown>;
  const rawStatus = candidate.status
    ?? candidate.practiceSourceStatus
    ?? candidate.practice_source_status;
  const rawText = candidate.text
    ?? candidate.practiceSourceText
    ?? candidate.practice_source_text;
  const rawVersion = candidate.version
    ?? candidate.practiceSourceVersion
    ?? candidate.practice_source_version;
  const rawHash = candidate.hash
    ?? candidate.practiceSourceHash
    ?? candidate.practice_source_hash;
  const rawConfirmedAt = candidate.confirmedAt
    ?? candidate.practiceSourceConfirmedAt
    ?? candidate.practice_source_confirmed_at;
  const status = typeof rawStatus === "string" && VALID_STATUS.has(rawStatus as AssignmentPracticeSourceStatus)
    ? rawStatus as AssignmentPracticeSourceStatus
    : captureKind === "scan-assignment"
      ? "needs_review"
      : "not_required";
  const text = typeof rawText === "string" && rawText.length <= MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS
    ? rawText
    : null;
  const version = Number.isInteger(rawVersion) && Number(rawVersion) >= 0
    ? Number(rawVersion)
    : 0;
  const hash = typeof rawHash === "string" && /^[0-9a-f]{64}$/i.test(rawHash)
    ? rawHash.toLowerCase()
    : null;
  const confirmedAt = typeof rawConfirmedAt === "string" && rawConfirmedAt.length > 0
    ? rawConfirmedAt
    : null;

  if (status === "confirmed" && (!text?.trim() || !hash || !confirmedAt || version < 1)) {
    return { status: "needs_review", text, version, hash: null, confirmedAt: null };
  }
  if (status !== "confirmed") {
    return { status, text, version, hash: null, confirmedAt: null };
  }
  return { status, text, version, hash, confirmedAt };
}

export function assignmentPracticeSourceFromCaptureRow(
  row: Record<string, unknown>,
  captureKind: string,
): AssignmentPracticeSource {
  return assignmentPracticeSourceFromUnknown({
    practice_source_status: row.practice_source_status,
    practice_source_text: row.practice_source_text,
    practice_source_version: row.practice_source_version,
    practice_source_hash: row.practice_source_hash,
    practice_source_confirmed_at: row.practice_source_confirmed_at,
  }, captureKind);
}

export function isConfirmedAssignmentPracticeSource(
  source: AssignmentPracticeSource,
): boolean {
  return source.status === "confirmed"
    && Boolean(source.text?.trim())
    && Boolean(source.hash)
    && Boolean(source.confirmedAt)
    && source.version > 0;
}
