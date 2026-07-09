/**
 * Pure mastery-update math. Applied server-side by the
 * `record-study-result` edge function AND used by the vitest to
 * guarantee the feedback loop stays honest.
 *
 * Concepts are the permanent memory (see mem://constraints/concept-architecture).
 * Every study attempt on a concept nudges strength/streak/next_review_at.
 */

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
  now?: Date;
}

const STRENGTH_UP = 0.15;
const STRENGTH_DOWN = 0.1;
const MAX_INTERVAL_HOURS = 24 * 30;

export function applyMasteryUpdate({ prev, correct, now = new Date() }: MasteryUpdateInput): MasteryRow {
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
  const strength = clamp(p.strength + (correct ? STRENGTH_UP : -STRENGTH_DOWN), 0, 1);
  const streak = correct ? p.streak + 1 : 0;

  const hours = correct
    ? Math.min(MAX_INTERVAL_HOURS, 24 * Math.pow(2, Math.max(0, streak - 1)))
    : 4;
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
