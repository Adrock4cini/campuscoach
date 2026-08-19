/**
 * Study runner restoration.
 *
 * Leaving the app mid-session (to paste a screenshot into another app, or
 * because iOS reloaded the tab) must not throw away the student's place in a
 * flashcard or multiple-choice set. Only safe, re-derivable progress is
 * stored: which artifact, where they were, what they had revealed, and the
 * running score. Nothing destructive and no answer content is persisted.
 */

export const STUDY_RUNNER_STATE_KEY = "campus-coach:study-runner";

export type StoredConfidence = "low" | "medium" | "high";

export interface StudyRunnerQueueEntry {
  itemIndex: number;
  recovery: boolean;
}

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
  };
}
