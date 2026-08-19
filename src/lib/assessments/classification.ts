/**
 * One shared assessment classifier.
 *
 * Deadlines are still stored in the existing `assignments` / `exams` tables —
 * this adds a derived, backward-compatible classification so the UI and study
 * logic can tell an ordinary homework item from a quiz or a real test without
 * a schema migration and without a second importance algorithm.
 */

export type AssessmentType = "assignment" | "quiz" | "exam";

export interface AssessmentRowLike {
  title?: string | null;
  /** Which table the row came from. Exam rows are always tests. */
  row?: "assignment" | "exam";
  meta?: unknown;
}

const QUIZ_PATTERN = /\b(quiz|quizzes|quizlet check|pop[- ]quiz)\b/i;
const EXAM_PATTERN = /\b(exam|midterm|final(?!\s+exam\s+review\s+quiz)|test)\b/i;

function metaType(meta: unknown): AssessmentType | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).assessment_type;
  return value === "quiz" || value === "exam" || value === "assignment" ? value : null;
}

export function classifyAssessment(input: AssessmentRowLike): AssessmentType {
  if (input.row === "exam") return "exam";
  const declared = metaType(input.meta);
  if (declared) return declared;
  const title = (input.title ?? "").trim();
  if (!title) return "assignment";
  // A quiz wins even when the title also says "final exam review quiz":
  // it is graded practice, not the test itself.
  if (QUIZ_PATTERN.test(title)) return "quiz";
  if (EXAM_PATTERN.test(title)) return "exam";
  return "assignment";
}

export function assessmentLabel(type: AssessmentType): string {
  return type === "quiz" ? "Quiz" : type === "exam" ? "Test" : "Assignment";
}

/**
 * How strongly a completed item counts as evidence of what a class tests.
 * Consumed by the existing readiness/selection path — it does not rank on
 * its own.
 */
export function assessmentEvidenceWeight(type: AssessmentType): number {
  return type === "exam" ? 1 : type === "quiz" ? 0.6 : 0.25;
}

export function isAssessment(type: AssessmentType): boolean {
  return type !== "assignment";
}

export function countAssessments(
  rows: readonly AssessmentRowLike[],
): Record<AssessmentType, number> {
  const counts: Record<AssessmentType, number> = { assignment: 0, quiz: 0, exam: 0 };
  for (const row of rows) counts[classifyAssessment(row)] += 1;
  return counts;
}
