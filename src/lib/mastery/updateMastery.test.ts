/**
 * Journey test — Feedback loop math.
 *
 * Guarantees the Concept memory grows on correct answers and decays
 * on incorrect ones. If this breaks, the "system remembers what you
 * know" promise breaks.
 */
import { describe, expect, it } from "vitest";
import { applyMasteryUpdate, computeReadiness } from "./updateMastery";

describe("mastery feedback loop", () => {
  it("strengthens memory on correct answers, resets streak on miss", () => {
    const t0 = new Date("2026-07-09T12:00:00Z");
    const r1 = applyMasteryUpdate({ prev: null, correct: true, now: t0 });
    expect(r1.attempts).toBe(1);
    expect(r1.correct).toBe(1);
    expect(r1.strength).toBeGreaterThan(0);
    expect(r1.streak).toBe(1);
    expect(r1.last_seen_at).toBe(t0.toISOString());
    expect(r1.next_review_at).not.toBeNull();

    const r2 = applyMasteryUpdate({ prev: r1, correct: true, now: t0 });
    expect(r2.streak).toBe(2);
    expect(r2.strength).toBeGreaterThan(r1.strength);

    const r3 = applyMasteryUpdate({ prev: r2, correct: false, now: t0 });
    expect(r3.streak).toBe(0);
    expect(r3.strength).toBeLessThan(r2.strength);
    expect(r3.attempts).toBe(3);
    expect(r3.correct).toBe(2);
  });

  it("drops strength more when the student was confidently wrong", () => {
    const t0 = new Date("2026-07-09T12:00:00Z");
    const base = applyMasteryUpdate({ prev: null, correct: true, confidence: "medium", now: t0 });
    const uncertainMiss = applyMasteryUpdate({
      prev: base,
      correct: false,
      confidence: "low",
      now: t0,
    });
    const confidentMiss = applyMasteryUpdate({
      prev: base,
      correct: false,
      confidence: "high",
      now: t0,
    });
    expect(confidentMiss.strength).toBeLessThan(uncertainMiss.strength);
    expect(new Date(confidentMiss.next_review_at!).getTime()).toBeLessThan(
      new Date(uncertainMiss.next_review_at!).getTime(),
    );
  });

  it("records a positive flashcard self-report without raising secure mastery", () => {
    const t0 = new Date("2026-07-09T12:00:00Z");
    const previous = applyMasteryUpdate({
      prev: null,
      correct: true,
      confidence: "medium",
      now: t0,
    });
    const earlierReview = new Date(t0.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const result = applyMasteryUpdate({
      prev: { ...previous, next_review_at: earlierReview },
      correct: true,
      confidence: "high",
      evidenceType: "self_report",
      now: t0,
    });

    expect(result.attempts).toBe(previous.attempts + 1);
    expect(result.correct).toBe(previous.correct + 1);
    expect(result.strength).toBe(previous.strength);
    expect(result.streak).toBe(previous.streak);
    expect(result.next_review_at).toBe(earlierReview);
  });

  it("readiness averages strengths to a 0-100 integer", () => {
    expect(computeReadiness([])).toBe(0);
    expect(computeReadiness([0, 0.5, 1])).toBe(50);
    expect(computeReadiness([1, 1, 1])).toBe(100);
  });
});
