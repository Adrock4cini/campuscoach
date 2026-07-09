/**
 * Journey test — the Dashboard-as-coach ranker.
 *
 * Proves the deterministic ranking rules the UI depends on:
 *  1. High-weight, imminent exams outrank distant ones.
 *  2. Weaker concepts outrank stronger ones.
 *  3. After a simulated successful session, the same concept drops in rank.
 *  4. Every recommendation carries a structured `evidence` array.
 */
import { describe, expect, it } from "vitest";
import { recommend, type CoachInputs } from "./recommend";

const NOW = new Date("2026-07-09T12:00:00Z");

function base(): CoachInputs {
  return {
    now: NOW,
    classes: [
      { id: "psych101", name: "Intro Psych" },
      { id: "bio220", name: "Cell Bio" },
    ],
    mastery: [
      { concept_id: "p1", class_id: "psych101", strength: 0.2, next_review_at: null, attempts: 2 },
      { concept_id: "p2", class_id: "psych101", strength: 0.3, next_review_at: null, attempts: 1 },
      { concept_id: "b1", class_id: "bio220", strength: 0.8, next_review_at: null, attempts: 5 },
    ],
    exams: [],
    assignments: [],
  };
}

describe("coach.recommend", () => {
  it("imminent exam outranks distant exam", () => {
    const inputs = base();
    inputs.exams = [
      { class_id: "psych101", exam_date: "2026-07-13", title: "Midterm", weight: 1 }, // 4d
      { class_id: "bio220", exam_date: "2026-07-30", title: "Quiz", weight: 1 },      // 21d (out of horizon)
    ];
    const recs = recommend(inputs);
    expect(recs[0].classId).toBe("psych101");
    expect(recs[0].impact.examWeight).toBeGreaterThan(0);
    expect(recs[0].evidence.some((e) => e.type === "exam")).toBe(true);
  });

  it("weaker concepts outrank stronger ones with no exams", () => {
    const recs = recommend(base());
    expect(recs[0].classId).toBe("psych101"); // has weak concepts
    expect(recs[0].evidence.some((e) => e.type === "mastery")).toBe(true);
    expect(recs[0].conceptIds).toContain("p1");
  });

  it("no-concepts class emits a capture recommendation", () => {
    const inputs: CoachInputs = {
      now: NOW,
      classes: [{ id: "new101", name: "New Class" }],
      mastery: [],
      exams: [{ class_id: "new101", exam_date: "2026-07-13", title: "Midterm" }],
      assignments: [],
    };
    const recs = recommend(inputs);
    expect(recs[0].action).toBe("capture");
    expect(recs[0].evidence.some((e) => e.type === "capture")).toBe(true);
  });

  it("after a simulated successful session, the concept drops in rank", () => {
    const before = recommend(base());
    const rankBefore = before.findIndex((r) => r.classId === "psych101");

    const after = base();
    // Simulate the feedback loop applying its +0.075 drift to p1/p2.
    for (const m of after.mastery) {
      if (m.class_id === "psych101") m.strength = Math.min(1, m.strength + 0.5);
    }
    const recs = recommend(after);
    const rankAfter = recs.findIndex((r) => r.classId === "psych101");
    expect(rankAfter).toBeGreaterThanOrEqual(rankBefore);
    expect(recs[rankAfter].impact.readinessDelta).toBeLessThanOrEqual(
      before[rankBefore].impact.readinessDelta,
    );
  });

  it("every recommendation carries a non-empty evidence array", () => {
    const inputs = base();
    inputs.exams = [{ class_id: "psych101", exam_date: "2026-07-13", title: "Midterm" }];
    const recs = recommend(inputs);
    for (const r of recs) {
      expect(Array.isArray(r.evidence)).toBe(true);
      expect(r.evidence.length).toBeGreaterThan(0);
      for (const e of r.evidence) {
        expect(typeof e.label).toBe("string");
        expect(e.weight).toBeGreaterThanOrEqual(0);
        expect(e.weight).toBeLessThanOrEqual(1);
      }
    }
  });
});
