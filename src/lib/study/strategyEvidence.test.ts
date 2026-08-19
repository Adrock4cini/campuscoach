import { describe, expect, it } from "vitest";
import {
  evidenceAdjustment,
  evidenceNote,
  orderFormatsByEvidence,
  summarizeStrategyEvidence,
  type StrategyOutcomeRecord,
} from "./strategyEvidence";
import { selectStrategies } from "./strategyToolbox";

const NOW = new Date("2026-01-15T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function outcome(over: Partial<StrategyOutcomeRecord> = {}): StrategyOutcomeRecord {
  return {
    strategyId: "error-spotting",
    technique: null,
    format: null,
    subjectProfileId: "math",
    taskKind: "apply-procedure",
    correct: 5,
    total: 5,
    masteryDelta: 0.2,
    source: "study_result",
    occurredAt: daysAgo(1),
    ...over,
  };
}

function mathContext(evidence = summarizeStrategyEvidence([], { now: NOW })) {
  return {
    subjectProfileId: "math" as const,
    taskKind: "apply-procedure" as const,
    hasGroundedSource: true,
    evidence,
  };
}

function topStrategyIds(evidence: ReturnType<typeof summarizeStrategyEvidence>): string[] {
  return selectStrategies(mathContext(evidence)).map((choice) => choice.strategy.id);
}

function rankOf(evidence: ReturnType<typeof summarizeStrategyEvidence>, id: string): number {
  return topStrategyIds(evidence).indexOf(id);
}

/**
 * Later-semester history: error spotting keeps landing for this student while
 * the cold-start favourite (worked examples) keeps under-performing. Evidence
 * is relative to the student's own baseline, so contrast is what matters.
 */
const LATER_SEMESTER: StrategyOutcomeRecord[] = [
  ...Array.from({ length: 6 }, (_, index) => outcome({
    strategyId: "error-spotting",
    correct: 5,
    total: 5,
    occurredAt: daysAgo(index * 2 + 1),
  })),
  ...Array.from({ length: 6 }, (_, index) => outcome({
    strategyId: "worked-example",
    correct: 1,
    total: 5,
    masteryDelta: -0.1,
    occurredAt: daysAgo(index * 2 + 2),
  })),
];

describe("strategy evidence — September cold start", () => {
  it("puts worked examples ahead of error spotting for a math student with no history", () => {
    const cold = summarizeStrategyEvidence([], { now: NOW });
    expect(rankOf(cold, "worked-example")).toBeGreaterThanOrEqual(0);
    expect(rankOf(cold, "worked-example")).toBeLessThan(rankOf(cold, "error-spotting"));
  });

  it("treats an empty history and a below-threshold history identically", () => {
    const thin = summarizeStrategyEvidence([outcome()], { now: NOW });
    expect(topStrategyIds(thin)).toEqual(topStrategyIds(summarizeStrategyEvidence([], { now: NOW })));
  });
});

describe("strategy evidence — later-semester learning", () => {
  const strongHistory = LATER_SEMESTER;

  it("lets repeated strong outcomes lift error spotting above the cold-start default", () => {
    const evidence = summarizeStrategyEvidence(strongHistory, { now: NOW });
    expect(rankOf(evidence, "error-spotting")).toBeLessThan(rankOf(evidence, "worked-example"));
  });

  it("surfaces a non-labelling student-facing note", () => {
    const evidence = summarizeStrategyEvidence(strongHistory, { now: NOW });
    const row = evidenceAdjustment(evidence, {
      strategyId: "error-spotting",
      subjectProfileId: "math",
      taskKind: "apply-procedure",
    }).evidence;
    const note = evidenceNote(row);
    expect(note).toBeTruthy();
    expect(note!.toLowerCase()).toContain("usually works well for you");
    expect(note!.toLowerCase()).not.toContain("learner");
  });

  it("does not let a single fluke success override the default", () => {
    const evidence = summarizeStrategyEvidence([
      outcome({ strategyId: "error-spotting", correct: 1, total: 1 }),
      outcome({ strategyId: "worked-example", correct: 0, total: 1, masteryDelta: null }),
    ], { now: NOW });
    expect(rankOf(evidence, "worked-example")).toBeLessThan(rankOf(evidence, "error-spotting"));
  });

  it("weights recent evidence over stale evidence", () => {
    const stale = summarizeStrategyEvidence(
      strongHistory.map((row, index) => ({ ...row, occurredAt: daysAgo(150 + index) })),
      { now: NOW },
    );
    const fresh = summarizeStrategyEvidence(strongHistory, { now: NOW });
    const staleAdjustment = evidenceAdjustment(stale, {
      strategyId: "error-spotting", subjectProfileId: "math", taskKind: "apply-procedure",
    }).adjustment;
    const freshAdjustment = evidenceAdjustment(fresh, {
      strategyId: "error-spotting", subjectProfileId: "math", taskKind: "apply-procedure",
    }).adjustment;
    expect(freshAdjustment).toBeGreaterThan(staleAdjustment);
  });

  it("lowers a strategy the student repeatedly rejects", () => {
    const rejected = summarizeStrategyEvidence([
      ...Array.from({ length: 6 }, (_, index) => outcome({
        strategyId: "worked-example",
        source: "feedback" as const,
        correct: 0,
        total: 1,
        masteryDelta: null,
        occurredAt: daysAgo(index + 1),
      })),
      ...Array.from({ length: 6 }, (_, index) => outcome({
        strategyId: "error-spotting",
        source: "feedback" as const,
        correct: 1,
        total: 1,
        masteryDelta: null,
        occurredAt: daysAgo(index + 1),
      })),
    ], { now: NOW });
    expect(evidenceAdjustment(rejected, {
      strategyId: "worked-example", subjectProfileId: "math", taskKind: "apply-procedure",
    }).adjustment).toBeLessThan(0);
    expect(rankOf(rejected, "error-spotting")).toBeLessThan(rankOf(rejected, "worked-example"));
  });
});

describe("strategy evidence — bucket isolation", () => {
  it("does not let one task kind contaminate another", () => {
    const evidence = summarizeStrategyEvidence(
      LATER_SEMESTER.map((row) => ({ ...row, taskKind: "memorize-terms" })),
      { now: NOW },
    );
    expect(evidenceAdjustment(evidence, {
      strategyId: "error-spotting", subjectProfileId: "math", taskKind: "apply-procedure",
    }).adjustment).toBe(0);
    expect(topStrategyIds(evidence)).toEqual(topStrategyIds(summarizeStrategyEvidence([], { now: NOW })));
  });

  it("does not let one subject contaminate another", () => {
    const evidence = summarizeStrategyEvidence(
      LATER_SEMESTER.map((row) => ({ ...row, subjectProfileId: "history" })),
      { now: NOW },
    );
    expect(evidenceAdjustment(evidence, {
      strategyId: "error-spotting", subjectProfileId: "math", taskKind: "apply-procedure",
    }).adjustment).toBe(0);
  });
});

describe("study format ordering", () => {
  const formats = ["flashcards", "multiple_choice", "matching", "practice"];
  const coldStart = ["practice", "flashcards", "multiple_choice", "matching"];

  it("keeps the subject default order at cold start", () => {
    expect(orderFormatsByEvidence(formats, coldStart, [], { subjectProfileId: "math" }))
      .toEqual(coldStart);
  });

  it("promotes a format with meaningful positive evidence", () => {
    const evidence = summarizeStrategyEvidence([
      ...Array.from({ length: 6 }, (_, index) => outcome({
        strategyId: null,
        format: "matching",
        taskKind: null,
        correct: 5,
        total: 5,
        occurredAt: daysAgo(index + 1),
      })),
      ...Array.from({ length: 6 }, (_, index) => outcome({
        strategyId: null,
        format: "practice",
        taskKind: null,
        correct: 1,
        total: 5,
        masteryDelta: -0.1,
        occurredAt: daysAgo(index + 1),
      })),
    ], { now: NOW });
    const ordered = orderFormatsByEvidence(formats, coldStart, evidence, {
      subjectProfileId: "math",
      taskKind: null,
    });
    expect(ordered[0]).toBe("matching");
    expect([...ordered].sort()).toEqual([...formats].sort());
  });
});
