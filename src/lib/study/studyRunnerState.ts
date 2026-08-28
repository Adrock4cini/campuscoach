/**
 * Study runner restoration.
 *
 * Leaving the app mid-session (to paste a screenshot into another app, or
 * because iOS reloaded the tab) must not throw away the student's place in a
 * flashcard or multiple-choice set. Only safe, re-derivable progress is
 * stored: which artifact, where they were, what they had revealed, and the
 * running score. Minimal grading metadata and the idempotent request outbox
 * are also stored so a reload cannot turn a miss/recovery into a new attempt.
 * Question text, answer choices, source excerpts, and typed answers are never
 * written here.
 */

import type {
  DurableEvidenceOutboxSnapshot,
  StudyResultSegmentBody,
  StudyResultSegmentResponse,
} from "@/lib/study/incrementalEvidence";

export const STUDY_RUNNER_STATE_KEY = "campus-coach:study-runner";

export type StoredConfidence = "low" | "medium" | "high";

export interface StudyRunnerQueueEntry {
  itemIndex: number;
  recovery: boolean;
}

export interface StoredStudyEvidenceResult {
  conceptId: string;
  correct: boolean;
  confidence: StoredConfidence;
  recovery: boolean;
  firstSelectedIndex?: number;
}

export interface StoredPendingFinal {
  correct: number;
  incorrect: number;
}

export interface StoredReadinessAggregate {
  firstReadinessBefore: number | null;
  latestReadiness: number | null;
  /** Sum of every acknowledged segment delta; null until one can be derived. */
  fallbackDelta: number | null;
}

export type StoredStudyEvidenceOutbox = DurableEvidenceOutboxSnapshot<
  StudyResultSegmentBody,
  StudyResultSegmentResponse
>;

export interface StudyRunnerState {
  artifactId: string;
  queue: StudyRunnerQueueEntry[];
  position: number;
  revealed: boolean;
  picked: number | null;
  confidence: StoredConfidence | null;
  correct: number;
  incorrect: number;
  /** Make It Stick disclosure state, so returning re-opens the same panel. */
  mnemonicOpen?: boolean;
  /** Stable parent id shared by every incremental segment in this run. */
  studyRunId?: string;
  nextSegmentIndex?: number;
  /** Active, unsent time since the most recently created segment. */
  pendingDurationSeconds?: number;
  evidenceResults?: StoredStudyEvidenceResult[];
  pendingFinal?: StoredPendingFinal | null;
  evidenceOutbox?: StoredStudyEvidenceOutbox;
  readinessAggregate?: StoredReadinessAggregate;
}

function safeStorage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isConfidence(value: unknown): value is StoredConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function isQueue(value: unknown, itemCount: number): value is StudyRunnerQueueEntry[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 64
    && value.every((entry) => (
      Boolean(entry)
      && typeof entry === "object"
      && Number.isInteger((entry as StudyRunnerQueueEntry).itemIndex)
      && (entry as StudyRunnerQueueEntry).itemIndex >= 0
      && (entry as StudyRunnerQueueEntry).itemIndex < itemCount
      && typeof (entry as StudyRunnerQueueEntry).recovery === "boolean"
    ));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasOnlyKeys(value: object, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isEvidenceResults(value: unknown): value is StoredStudyEvidenceResult[] {
  return Array.isArray(value)
    && value.length <= 128
    && value.every((entry) => (
      Boolean(entry)
      && typeof entry === "object"
      && hasOnlyKeys(entry as object, [
        "conceptId", "correct", "confidence", "recovery", "firstSelectedIndex",
      ])
      && typeof (entry as StoredStudyEvidenceResult).conceptId === "string"
      && (entry as StoredStudyEvidenceResult).conceptId.length > 0
      && (entry as StoredStudyEvidenceResult).conceptId.length <= 128
      && typeof (entry as StoredStudyEvidenceResult).correct === "boolean"
      && isConfidence((entry as StoredStudyEvidenceResult).confidence)
      && typeof (entry as StoredStudyEvidenceResult).recovery === "boolean"
      && (
        (entry as StoredStudyEvidenceResult).firstSelectedIndex === undefined
        || isStoredChoiceIndex((entry as StoredStudyEvidenceResult).firstSelectedIndex)
      )
    ));
}

function isSegmentBody(
  value: unknown,
  artifactId: string,
  studyRunId: string,
  itemCount: number,
): value is StudyResultSegmentBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as StudyResultSegmentBody;
  if (!hasOnlyKeys(body, [
    "attemptId", "studyRunId", "segmentIndex", "segmentFinal", "artifactId",
    "correct", "total", "durationSeconds", "perConcept",
  ])
      || !UUID_PATTERN.test(body.attemptId)
      || body.studyRunId !== studyRunId
      || !UUID_PATTERN.test(body.studyRunId)
      || body.artifactId !== artifactId
      || !Number.isInteger(body.segmentIndex)
      || body.segmentIndex < 0
      || body.segmentIndex > 127
      || typeof body.segmentFinal !== "boolean"
      || !Number.isInteger(body.correct)
      || !Number.isInteger(body.total)
      || body.total <= 0
      || body.total > itemCount
      || body.correct < 0
      || body.correct > body.total
      || !Number.isInteger(body.durationSeconds)
      || body.durationSeconds < 0
      || body.durationSeconds > 86_400
      || !Array.isArray(body.perConcept)
      || body.perConcept.length !== body.total) return false;
  const seen = new Set<string>();
  return body.perConcept.every((score) => {
    if (!score || typeof score !== "object"
        || !hasOnlyKeys(score, [
          "conceptId", "correct", "confidence", "recovered", "firstSelectedIndex",
        ])
        || typeof score.conceptId !== "string"
        || !score.conceptId
        || seen.has(score.conceptId)
        || typeof score.correct !== "boolean"
        || !isConfidence(score.confidence)
        || typeof score.recovered !== "boolean"
        || (
          score.firstSelectedIndex !== undefined
          && !isStoredChoiceIndex(score.firstSelectedIndex)
        )
        || (score.recovered && score.correct)) return false;
    seen.add(score.conceptId);
    return true;
  });
}

function isStoredChoiceIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 8;
}

function isSegmentResponse(value: unknown): value is StudyResultSegmentResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as StudyResultSegmentResponse;
  return hasOnlyKeys(response, [
    "ok", "sessionId", "readiness", "readinessBefore", "readinessDelta",
  ])
    && response.ok === true
    && typeof response.sessionId === "string"
    && (response.readiness === undefined || isFiniteNumber(response.readiness))
    && (response.readinessBefore === undefined || isFiniteNumber(response.readinessBefore))
    && (response.readinessDelta === undefined || isFiniteNumber(response.readinessDelta));
}

function isEvidenceOutbox(
  value: unknown,
  artifactId: string,
  studyRunId: string,
  itemCount: number,
  evidenceResultCount: number,
): value is StoredStudyEvidenceOutbox {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const outbox = value as StoredStudyEvidenceOutbox;
  if (!hasOnlyKeys(outbox, [
    "pending", "queuedResultCount", "savedResultCount", "savedAnswerCount", "lastResponse",
  ])
      || !Array.isArray(outbox.pending)
      || outbox.pending.length > 64
      || !Number.isInteger(outbox.queuedResultCount)
      || !Number.isInteger(outbox.savedResultCount)
      || !Number.isInteger(outbox.savedAnswerCount)
      || outbox.queuedResultCount < 0
      || outbox.queuedResultCount > evidenceResultCount
      || outbox.savedResultCount < 0
      || outbox.savedResultCount > outbox.queuedResultCount
      || outbox.savedAnswerCount < 0
      || outbox.savedAnswerCount > itemCount
      || (outbox.lastResponse !== null && !isSegmentResponse(outbox.lastResponse))) return false;
  let pendingResultCount = 0;
  for (const request of outbox.pending) {
    if (!request || typeof request !== "object"
        || !hasOnlyKeys(request, ["attemptId", "body", "resultCount", "answerCount"])
        || !UUID_PATTERN.test(request.attemptId)
        || !Number.isInteger(request.resultCount)
        || request.resultCount <= 0
        || !Number.isInteger(request.answerCount)
        || request.answerCount <= 0
        || request.answerCount > itemCount
        || !isSegmentBody(request.body, artifactId, studyRunId, itemCount)
        || request.body.attemptId !== request.attemptId) return false;
    pendingResultCount += request.resultCount;
  }
  return pendingResultCount === outbox.queuedResultCount - outbox.savedResultCount;
}

function isReadinessAggregate(value: unknown): value is StoredReadinessAggregate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const aggregate = value as StoredReadinessAggregate;
  return hasOnlyKeys(aggregate, ["firstReadinessBefore", "latestReadiness", "fallbackDelta"])
    && (aggregate.firstReadinessBefore === null || isFiniteNumber(aggregate.firstReadinessBefore))
    && (aggregate.latestReadiness === null || isFiniteNumber(aggregate.latestReadiness))
    && (aggregate.fallbackDelta === null || isFiniteNumber(aggregate.fallbackDelta));
}

export function writeStudyRunnerState(
  state: StudyRunnerState,
  storage?: Storage | null,
): void {
  const store = safeStorage(storage);
  if (!store || !state.artifactId) return;
  try {
    store.setItem(STUDY_RUNNER_STATE_KEY, JSON.stringify(state));
  } catch {
    // A blocked or full storage must never interrupt studying.
  }
}

export function clearStudyRunnerState(storage?: Storage | null): void {
  try {
    safeStorage(storage)?.removeItem(STUDY_RUNNER_STATE_KEY);
  } catch {
    // Best effort.
  }
}

/**
 * Returns stored progress only when it still describes the artifact being
 * opened and every index is in range. Anything else is discarded so a stale
 * or regenerated set can never strand the student on a missing card.
 */
export function readStudyRunnerState(
  options: { artifactId: string; itemCount: number; storage?: Storage | null },
): StudyRunnerState | null {
  const store = safeStorage(options.storage);
  if (!store || options.itemCount <= 0) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(STUDY_RUNNER_STATE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.artifactId !== options.artifactId) return null;
  if (!isQueue(record.queue, options.itemCount)) return null;
  const queue = record.queue;
  if (!Number.isInteger(record.position) || (record.position as number) < 0 || (record.position as number) >= queue.length) {
    return null;
  }
  if (typeof record.revealed !== "boolean") return null;
  const picked = record.picked;
  if (picked !== null && (!Number.isInteger(picked) || (picked as number) < 0 || (picked as number) > 8)) return null;
  if (record.confidence !== null && !isConfidence(record.confidence)) return null;
  if (!Number.isInteger(record.correct) || !Number.isInteger(record.incorrect)) return null;
  if ((record.correct as number) < 0 || (record.incorrect as number) < 0) return null;

  const studyRunId = typeof record.studyRunId === "string" && UUID_PATTERN.test(record.studyRunId)
    ? record.studyRunId
    : undefined;
  if (record.studyRunId !== undefined && !studyRunId) return null;
  const nextSegmentIndex = record.nextSegmentIndex === undefined
    ? undefined
    : record.nextSegmentIndex;
  if (nextSegmentIndex !== undefined && (
    !Number.isInteger(nextSegmentIndex) || (nextSegmentIndex as number) < 0 || (nextSegmentIndex as number) > 128
  )) return null;
  const pendingDurationSeconds = record.pendingDurationSeconds === undefined
    ? undefined
    : record.pendingDurationSeconds;
  if (pendingDurationSeconds !== undefined && (
    !Number.isInteger(pendingDurationSeconds)
    || (pendingDurationSeconds as number) < 0
    || (pendingDurationSeconds as number) > 86_400
  )) return null;
  const evidenceResults = record.evidenceResults === undefined ? [] : record.evidenceResults;
  if (!isEvidenceResults(evidenceResults)) return null;
  let pendingFinal: StoredPendingFinal | null = null;
  if (record.pendingFinal !== undefined && record.pendingFinal !== null) {
    if (typeof record.pendingFinal !== "object" || Array.isArray(record.pendingFinal)) return null;
    const candidate = record.pendingFinal as StoredPendingFinal;
    if (!hasOnlyKeys(candidate, ["correct", "incorrect"])
        || !Number.isInteger(candidate.correct)
        || !Number.isInteger(candidate.incorrect)
        || candidate.correct < 0
        || candidate.incorrect < 0
        || candidate.correct + candidate.incorrect !== options.itemCount) return null;
    pendingFinal = candidate;
  }
  const evidenceOutbox = record.evidenceOutbox === undefined
    ? undefined
    : record.evidenceOutbox;
  if (evidenceOutbox !== undefined && (
    !studyRunId
    || !isEvidenceOutbox(
      evidenceOutbox,
      options.artifactId,
      studyRunId,
      options.itemCount,
      evidenceResults.length,
    )
  )) return null;
  const readinessAggregate = record.readinessAggregate === undefined
    ? undefined
    : record.readinessAggregate;
  if (readinessAggregate !== undefined && !isReadinessAggregate(readinessAggregate)) return null;
  const validatedEvidenceOutbox = evidenceOutbox as StoredStudyEvidenceOutbox | undefined;
  const validatedReadinessAggregate = readinessAggregate as StoredReadinessAggregate | undefined;

  return {
    artifactId: options.artifactId,
    queue,
    position: record.position as number,
    revealed: record.revealed,
    picked: (picked ?? null) as number | null,
    confidence: (record.confidence ?? null) as StoredConfidence | null,
    correct: record.correct as number,
    incorrect: record.incorrect as number,
    mnemonicOpen: record.mnemonicOpen === true,
    ...(studyRunId ? { studyRunId } : {}),
    ...(nextSegmentIndex !== undefined ? { nextSegmentIndex: nextSegmentIndex as number } : {}),
    ...(pendingDurationSeconds !== undefined
      ? { pendingDurationSeconds: pendingDurationSeconds as number }
      : {}),
    evidenceResults,
    pendingFinal,
    ...(validatedEvidenceOutbox ? { evidenceOutbox: validatedEvidenceOutbox } : {}),
    ...(validatedReadinessAggregate
      ? { readinessAggregate: validatedReadinessAggregate }
      : {}),
  };
}
