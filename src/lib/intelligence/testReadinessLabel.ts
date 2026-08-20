/**
 * Test readiness labels — the product contract's "no unexplained percentage" rule.
 *
 * Compact surfaces (agenda rows, calendar rows, exam lists) must never show a
 * bare "62% ready". They show a plain word — Strong / Getting there / Needs work
 * / Need more material — that a student can act on, plus a one-line meaning.
 *
 * This is preparation readiness (how much grounded practice evidence exists),
 * NOT a probability of passing and never a predicted grade.
 */

export type TestReadinessLevel = "unstarted" | "needs-work" | "getting-there" | "strong";

export interface TestReadinessLabel {
  level: TestReadinessLevel;
  /** Short chip text, safe on its own. */
  label: string;
  /** One sentence saying what the label means. */
  meaning: string;
}

/** What every readiness number in the app measures. Reuse verbatim in tooltips. */
export const READINESS_MEANING =
  "Test readiness measures how much of this class you've practiced and got right — not a predicted grade or a chance of passing.";

export function labelTestReadiness(readiness: number | null | undefined): TestReadinessLabel {
  const value = typeof readiness === "number" && Number.isFinite(readiness) ? readiness : 0;

  if (value <= 0) {
    return {
      level: "unstarted",
      label: "Need more material",
      meaning: "No practice yet, so there's nothing to score. Add class material to start.",
    };
  }
  if (value < 45) {
    return {
      level: "needs-work",
      label: "Needs work",
      meaning: "You've missed more than you've got right on the concepts practiced so far.",
    };
  }
  if (value < 75) {
    return {
      level: "getting-there",
      label: "Getting there",
      meaning: "You're right on most practiced concepts, but some are still shaky.",
    };
  }
  return {
    level: "strong",
    label: "Strong",
    meaning: "You're consistently right on the concepts you've practiced for this test.",
  };
}
