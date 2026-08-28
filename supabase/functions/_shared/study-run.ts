const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GroupedStudyRunSegment {
  studyRunId: string;
  segmentIndex: number;
  segmentFinal: boolean;
}

export type StudyRunContract =
  | { kind: "legacy" }
  | ({ kind: "grouped" } & GroupedStudyRunSegment)
  | { kind: "invalid"; error: string };

/**
 * Parse the all-or-nothing parent-run contract. A partial contract must never
 * silently fall back to legacy one-attempt/one-session behavior.
 */
export function parseStudyRunContract(body: Record<string, unknown>): StudyRunContract {
  const hasRunId = Object.hasOwn(body, "studyRunId");
  const hasIndex = Object.hasOwn(body, "segmentIndex");
  const hasFinal = Object.hasOwn(body, "segmentFinal");
  if (!hasRunId && !hasIndex && !hasFinal) return { kind: "legacy" };
  if (!hasRunId || !hasIndex || !hasFinal) {
    return { kind: "invalid", error: "study run metadata must be complete" };
  }
  if (typeof body.studyRunId !== "string" || !UUID_PATTERN.test(body.studyRunId)) {
    return { kind: "invalid", error: "studyRunId must be a UUID" };
  }
  if (!Number.isInteger(body.segmentIndex)
      || (body.segmentIndex as number) < 0
      || (body.segmentIndex as number) > 127) {
    return { kind: "invalid", error: "segmentIndex must be between 0 and 127" };
  }
  if (typeof body.segmentFinal !== "boolean") {
    return { kind: "invalid", error: "segmentFinal must be boolean" };
  }
  return {
    kind: "grouped",
    studyRunId: body.studyRunId,
    segmentIndex: body.segmentIndex as number,
    segmentFinal: body.segmentFinal,
  };
}

export interface StoredStudyRunSegment {
  clientAttemptId: string;
  segmentIndex: number;
  segmentFinal: boolean;
  resultStatus: string;
  correct: number;
  total: number;
  durationSeconds: number;
}

export interface StudyRunAggregate {
  correct: number;
  total: number;
  durationSeconds: number;
  score: number;
  segmentCount: number;
  finalSegmentIndex: number | null;
  complete: boolean;
}

export interface StoredStudyRunConceptEvidence {
  clientAttemptId: string;
  conceptId: string;
  correct: boolean;
}

export interface AuthoritativeStudyRunEvidence {
  correct: number;
  total: number;
  score: number;
  coverageComplete: boolean;
}

/** Aggregate immutable segment metadata without trusting client totals twice. */
export function aggregateStudyRunSegments(
  rows: StoredStudyRunSegment[],
): StudyRunAggregate | null {
  if (!rows.length) return null;
  const byIndex = new Map<number, StoredStudyRunSegment>();
  for (const row of rows) {
    if (!Number.isInteger(row.segmentIndex)
        || row.segmentIndex < 0
        || row.segmentIndex > 127
        || !Number.isInteger(row.correct)
        || !Number.isInteger(row.total)
        || row.total <= 0
        || row.correct < 0
        || row.correct > row.total
        || !Number.isInteger(row.durationSeconds)
        || row.durationSeconds < 0
        || row.durationSeconds > 86_400
        || byIndex.has(row.segmentIndex)) return null;
    byIndex.set(row.segmentIndex, row);
  }

  const completed = [...byIndex.values()]
    .filter((row) => row.resultStatus === "completed")
    .sort((left, right) => left.segmentIndex - right.segmentIndex);
  const correct = completed.reduce((sum, row) => sum + row.correct, 0);
  const total = completed.reduce((sum, row) => sum + row.total, 0);
  const durationSeconds = completed.reduce((sum, row) => sum + row.durationSeconds, 0);
  const finalRows = completed.filter((row) => row.segmentFinal);
  const finalSegmentIndex = finalRows.length === 1 ? finalRows[0].segmentIndex : null;
  const complete = finalSegmentIndex !== null
    && completed.length === finalSegmentIndex + 1
    && completed.every((row, index) => row.segmentIndex === index);

  return {
    correct,
    total,
    durationSeconds,
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    segmentCount: completed.length,
    finalSegmentIndex,
    complete,
  };
}

/**
 * Cross-check completed segment declarations against the immutable mastery
 * ledger. A concept may contribute evidence only once in a logical run.
 */
export function summarizeAuthoritativeStudyRunEvidence(
  rows: StoredStudyRunSegment[],
  evidence: StoredStudyRunConceptEvidence[],
  artifactConceptIds: string[],
): AuthoritativeStudyRunEvidence | null {
  if (!artifactConceptIds.length || new Set(artifactConceptIds).size !== artifactConceptIds.length) {
    return null;
  }
  const completed = rows.filter((row) => row.resultStatus === "completed");
  const attempts = new Map(completed.map((row) => [row.clientAttemptId, row]));
  if (!attempts.size) return null;

  const counts = new Map<string, { correct: number; total: number }>();
  const seenConcepts = new Set<string>();
  const allowedConcepts = new Set(artifactConceptIds);
  for (const item of evidence) {
    if (!attempts.has(item.clientAttemptId)
        || !allowedConcepts.has(item.conceptId)
        || seenConcepts.has(item.conceptId)) {
      return null;
    }
    seenConcepts.add(item.conceptId);
    const count = counts.get(item.clientAttemptId) ?? { correct: 0, total: 0 };
    count.total += 1;
    if (item.correct) count.correct += 1;
    counts.set(item.clientAttemptId, count);
  }

  for (const attempt of completed) {
    const count = counts.get(attempt.clientAttemptId) ?? { correct: 0, total: 0 };
    if (count.total !== attempt.total || count.correct !== attempt.correct) return null;
  }
  const total = evidence.length;
  const correct = evidence.filter((item) => item.correct).length;
  return {
    correct,
    total,
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    coverageComplete: seenConcepts.size === artifactConceptIds.length,
  };
}
