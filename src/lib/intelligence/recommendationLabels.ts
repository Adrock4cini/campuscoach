/**
 * Short, UI-facing labels derived from a LearningRecommendation.
 *
 * Every visible primary CTA in the app reads from these helpers so
 * copy stays consistent across the Dashboard, ClassCommandCard,
 * AssignmentsPage, ExamsPage, and Study From Capture. The engine
 * remains the single source of truth — this module only formats.
 */

import type {
  LearningRecommendation,
  VerificationKind,
} from "./learningEngine";

const VERIFICATION_COPY: Record<VerificationKind, string> = {
  "quiz-accuracy": "Verify with quick quiz",
  "recall-check": "Verify by recall",
  "assignment-submitted": "Verify by submitting",
  "self-rating": "Verify with self-rating",
  "timed-score": "Verify with timed score",
  "post-session-confidence": "Verify confidence check",
};

export interface RecommendationChips {
  minutes: string;          // "15 min"
  gain: string;             // "+8 readiness"
  verify: string;           // "Verify with quick quiz"
  highestImpact: boolean;   // caller decides if it's the global top rec
}

export function getRecommendationChips(
  rec: LearningRecommendation,
  isTop = false,
): RecommendationChips {
  return {
    minutes: `${rec.estimatedMinutes} min`,
    gain: `+${rec.estimatedLearningGain} readiness`,
    verify: VERIFICATION_COPY[rec.verification.kind],
    highestImpact: isTop,
  };
}
