/**
 * Pure mastery-update math. Applied server-side by the
 * `record-study-result` edge function AND used by the vitest to
 * guarantee the feedback loop stays honest.
 *
 * Concepts are the permanent memory (see mem://constraints/concept-architecture).
 * Every study attempt on a concept nudges strength/streak/next_review_at.
 *
 * Confidence (optional) calibrates the update:
 * - high confidence + wrong → larger strength drop, sooner review
 * - high confidence + correct → slightly stronger retention interval
 * - low confidence + correct → modest gain (lucky or shaky)
 */

export type ConfidenceLevel = "low" | "medium" | "high";

export interface MasteryRow {
  attempts: number;
  correct: number;
  strength: number; // 0..1
  streak: number;
  last_seen_at: string | null;
  next_review_at: string | null;
}

export interface MasteryUpdateInput {
  prev: MasteryRow | null;
  correct: boolean;
  /** Student self-rating before seeing feedback. Affects drop/gain size. */
  confidence?: ConfidenceLevel | null;
  now?: Date;
}

const STRENGTH_UP = 0.15;
const STRENGTH_DOWN = 0.1;
const MAX_INTERVAL_HOURS = 24 * 30;

export function applyMasteryUpdate({
  prev,
  correct,
  confidence = null,
  now = new Date(),
}: MasteryUpdateInput): MasteryRow {
  const p: MasteryRow = prev ?? {
    attempts: 0,
    correct: 0,
    strength: 0,
    streak: 0,
    last_seen_at: null,
    next_review_at: null,
  };

  const attempts = p.attempts + 1;
  const correctCount = p.correct + (correct ? 1 : 0);

  // Confidently wrong is the most important signal for exam readiness.
  let delta = correct ? STRENGTH_UP : -STRENGTH_DOWN;
  if (confidence === "high" && !correct) delta = -0.22;
  else if (confidence === "high" && correct) delta = 0.18;
  else if (confidence === "low" && correct) delta = 0.1;
  else if (confidence === "low" && !correct) delta = -0.08;

  const strength = clamp(p.strength + delta, 0, 1);
  const streak = correct ? p.streak + 1 : 0;

  let hours: number;
  if (!correct) {
    // Confident misses come back sooner than uncertain ones.
    hours = confidence === "high" ? 2 : 4;
  } else {
    const base = 24 * Math.pow(2, Math.max(0, streak - 1));
    hours = Math.min(MAX_INTERVAL_HOURS, confidence === "low" ? Math.max(8, base * 0.6) : base);
  }
  const next = new Date(now.getTime() + hours * 3600 * 1000);

  return {
    attempts,
    correct: correctCount,
    strength,
    streak,
    last_seen_at: now.toISOString(),
    next_review_at: next.toISOString(),
  };
}

export function computeReadiness(strengths: number[]): number {
  if (strengths.length === 0) return 0;
  const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  return Math.round(clamp(avg, 0, 1) * 100);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
