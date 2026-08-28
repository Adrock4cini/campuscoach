/**
 * Readiness explanation — turns the evidence behind a class readiness
 * score into plain student language.
 *
 * Prediction layer only: it reads permanent memory signals (concepts,
 * mastery attempts, captures) plus schedule pressure, and never invents
 * a score. When there is too little evidence we deliberately show a
 * qualitative label instead of false precision like "49%".
 */

export interface ReadinessSignals {
  /** Concepts Campus Coach has learned for this class. */
  conceptCount: number;
  /** Mastery strengths (0..1) for concepts the student has practiced. */
  strengths: number[];
  /** Total practice attempts across all concepts. */
  attempts: number;
  /** Captures attached to this class (notes, photos, hints). */
  captureCount: number;
  /** Days until the next exam, null if none scheduled. */
  daysToExam?: number | null;
  /** Assignments past due and not complete. */
  overdueAssignments?: number;
}

export type ReadinessTone = "good" | "watch" | "gap";

export interface ReadinessFactor {
  label: string;
  detail: string;
  tone: ReadinessTone;
}

export interface ReadinessExplanation {
  status: "no-data" | "early" | "scored";
  /** Short student-facing label, always safe to show. */
  label: string;
  /** Percentage, or null when there is not enough evidence to be precise. */
  percent: number | null;
  headline: string;
  factors: ReadinessFactor[];
  nextStep: string;
  weakCount: number;
}

/** Below this, a concept counts as "needs practice". */
export const WEAK_STRENGTH = 0.5;
/** Minimum practice attempts before we show a percentage at all. */
export const MIN_ATTEMPTS_FOR_SCORE = 3;
/** Minimum concepts before we show a percentage at all. */
export const MIN_CONCEPTS_FOR_SCORE = 3;

function pluralConcepts(n: number) {
  return `${n} concept${n === 1 ? "" : "s"}`;
}

/** Keep every active concept in the readiness denominator. */
export function fullScopeStrengths(conceptCount: number, strengths: readonly number[]): number[] {
  const scopeCount = Number.isFinite(conceptCount)
    ? Math.max(0, Math.trunc(conceptCount))
    : 0;
  const scoped = strengths
    .slice(0, scopeCount)
    .map((strength) => Math.max(0, Math.min(1, Number(strength) || 0)));
  return scoped.length < scopeCount
    ? [...scoped, ...Array<number>(scopeCount - scoped.length).fill(0)]
    : scoped;
}

export function explainReadiness(signals: ReadinessSignals): ReadinessExplanation {
  const {
    conceptCount,
    strengths,
    attempts,
    captureCount,
    daysToExam = null,
    overdueAssignments = 0,
  } = signals;

  const scopedStrengths = fullScopeStrengths(conceptCount, strengths);
  const weakCount = scopedStrengths.filter((s) => s < WEAK_STRENGTH).length;
  const factors: ReadinessFactor[] = [];

  factors.push(
    conceptCount > 0
      ? {
          label: "What we've learned",
          detail: `${pluralConcepts(conceptCount)} from ${captureCount} capture${captureCount === 1 ? "" : "s"}`,
          tone: "good",
        }
      : {
          label: "What we've learned",
          detail: "Nothing captured for this class yet",
          tone: "gap",
        },
  );

  factors.push(
    attempts > 0
      ? {
          label: "Practice",
          detail: `${attempts} question${attempts === 1 ? "" : "s"} answered`,
          tone: attempts >= MIN_ATTEMPTS_FOR_SCORE ? "good" : "watch",
        }
      : { label: "Practice", detail: "No study sessions yet", tone: "gap" },
  );

  if (weakCount > 0) {
    factors.push({
      label: "Needs attention",
      detail: `${pluralConcepts(weakCount)} ${weakCount === 1 ? "needs" : "need"} practice`,
      tone: "gap",
    });
  }

  if (typeof daysToExam === "number" && daysToExam >= 0) {
    factors.push({
      label: "Next test",
      detail: daysToExam === 0 ? "Today" : `In ${daysToExam} day${daysToExam === 1 ? "" : "s"}`,
      tone: daysToExam <= 3 ? "watch" : "good",
    });
  }

  if (overdueAssignments > 0) {
    factors.push({
      label: "Overdue work",
      detail: `${overdueAssignments} item${overdueAssignments === 1 ? "" : "s"} past due`,
      tone: "gap",
    });
  }

  if (conceptCount === 0 && captureCount === 0) {
    return {
      status: "no-data",
      label: "Not enough info yet",
      percent: null,
      headline: "We can't judge this class yet — nothing has been captured.",
      factors,
      nextStep: "Capture one thing from class: a photo, a note, or a teacher hint.",
      weakCount,
    };
  }

  if (attempts < MIN_ATTEMPTS_FOR_SCORE || conceptCount < MIN_CONCEPTS_FOR_SCORE) {
    return {
      status: "early",
      label: "Still learning",
      percent: null,
      headline: "We know a little about this class, but not enough to score you fairly.",
      factors,
      nextStep:
        conceptCount === 0
          ? "Add one more capture so we can pull out concepts."
          : "Do one 10-minute study set — then this becomes a real number.",
      weakCount,
    };
  }

  const avg = scopedStrengths.length
    ? scopedStrengths.reduce((sum, s) => sum + s, 0) / scopedStrengths.length
    : 0;
  const percent = Math.max(0, Math.min(100, Math.round(avg * 100)));
  const label = percent >= 80 ? "Exam ready" : percent >= 60 ? "Getting there" : "Needs work";

  const headline =
    weakCount > 0
      ? `You're solid on ${pluralConcepts(scopedStrengths.length - weakCount)}; ${pluralConcepts(weakCount)} ${weakCount === 1 ? "is" : "are"} not yet strong.`
      : `You've answered ${attempts} questions and you're holding steady across ${pluralConcepts(scopedStrengths.length)}.`;

  return {
    status: "scored",
    label,
    percent,
    headline,
    factors,
    nextStep:
      weakCount > 0
        ? `Practice the ${pluralConcepts(weakCount)} that ${weakCount === 1 ? "isn't" : "aren't"} strong yet first.`
        : "Keep spacing your reviews — short sets beat cramming.",
    weakCount,
  };
}
