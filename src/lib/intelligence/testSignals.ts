/**
 * Three honest test signals — shown separately, never merged into one
 * mystery readiness percentage.
 *
 * 1) URGENCY  — date/time only (handled by dueChip/whenLabel elsewhere).
 * 2) COVERAGE — does Campus Companion have enough class material to help?
 * 3) PRACTICE — what has this student actually demonstrated so far?
 *
 * Everything here is derived from existing concept/material counts and
 * mastery rows. No prediction, no new AI calls: when the data cannot
 * honestly distinguish a state we say "Need material" / "Not practiced".
 */
import {
  MIN_CAPTURES_FOR_PREP,
  MIN_CONCEPTS_FOR_PREP,
  type MaterialSignals,
} from "./materialSufficiency";

export type CoverageLevel = "need-material" | "some-material" | "good-coverage";
export type PracticeLevel = "not-practiced" | "getting-there" | "strong";

export interface CoverageSignal {
  level: CoverageLevel;
  label: string;
}

export interface PracticeSignal {
  level: PracticeLevel;
  label: string;
}

/** COVERAGE: Need material / Some material / Good coverage. */
export function coverageSignal(signals: MaterialSignals): CoverageSignal {
  if (signals.captureCount <= 0) {
    return { level: "need-material", label: "Need material" };
  }
  if (
    signals.conceptCount >= MIN_CONCEPTS_FOR_PREP &&
    signals.captureCount >= MIN_CAPTURES_FOR_PREP
  ) {
    return { level: "good-coverage", label: "Good coverage" };
  }
  return { level: "some-material", label: "Some material" };
}

/**
 * PRACTICE: Not practiced / Getting there / Strong.
 *
 * `strengths` are the 0–1 mastery strengths for this class's concepts; a
 * concept only counts once the student has actually attempted it, so zero
 * attempts always means "Not practiced" even though seeds exist.
 */
export function practiceSignal(signals: {
  attempts: number;
  strengths: number[];
}): PracticeSignal {
  if (signals.attempts <= 0 || signals.strengths.length === 0) {
    return { level: "not-practiced", label: "Not practiced" };
  }
  const average =
    signals.strengths.reduce((sum, value) => sum + value, 0) / signals.strengths.length;
  if (average >= 0.75) return { level: "strong", label: "Strong" };
  return { level: "getting-there", label: "Getting there" };
}

export type TestAction = "add-material" | "study-now" | "keep-practicing";

/**
 * The one obvious next action for a test card:
 * coverage first, then practice.
 */
export function nextTestAction(
  coverage: CoverageSignal,
  practice: PracticeSignal,
): { action: TestAction; label: string } {
  if (coverage.level !== "good-coverage") {
    return { action: "add-material", label: "Add material" };
  }
  if (practice.level === "not-practiced") {
    return { action: "study-now", label: "Study now" };
  }
  return { action: "keep-practicing", label: "Keep practicing" };
}
