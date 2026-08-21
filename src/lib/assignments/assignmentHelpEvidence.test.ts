/**
 * Assignment Help → mastery semantics.
 * Locks the rule that completion is not mastery and help is not shame.
 */
import { describe, expect, it } from "vitest";
import {
  applyAssignmentHelpEvents,
  assignmentHelpEvidence,
} from "@/lib/assignments/assignmentHelpEvidence";
import type { MasteryRow } from "@/lib/mastery/updateMastery";

const prev: MasteryRow = {
  attempts: 2,
  correct: 1,
  strength: 0.5,
  streak: 1,
  last_seen_at: null,
  next_review_at: null,
};

describe("assignmentHelpEvidence", () => {
  it("never moves mastery when an assignment is only marked complete", () => {
    const evidence = assignmentHelpEvidence(
      { conceptId: "c1", outcome: "marked_complete", eventId: "e1" },
      prev,
    );
    expect(evidence.recordsMastery).toBe(false);
    expect(evidence.masteryUpdate).toBeNull();
  });

  it("never credits mastery for an AI-shown answer", () => {
    const evidence = assignmentHelpEvidence(
      { conceptId: "c1", outcome: "answer_shown_only", eventId: "e2" },
      prev,
    );
    expect(evidence.recordsMastery).toBe(false);
    expect(evidence.recordsExposure).toBe(true);
  });

  it("records needing a hint as weak evidence, not failure", () => {
    const evidence = assignmentHelpEvidence(
      { conceptId: "c1", outcome: "needed_hint", eventId: "e3" },
      prev,
    );
    expect(evidence.recordsMastery).toBe(true);
    expect(evidence.masteryUpdate!.strength).toBeLessThan(prev.strength);
    expect(evidence.masteryUpdate!.streak).toBe(0);
    expect(evidence.studentNote).not.toMatch(/fail|wrong|bad/i);
  });

  it("credits a solved-after-help attempt", () => {
    const evidence = assignmentHelpEvidence(
      { conceptId: "c1", outcome: "solved_after_help", eventId: "e4" },
      prev,
    );
    expect(evidence.masteryUpdate!.strength).toBeGreaterThan(prev.strength);
  });
});

describe("applyAssignmentHelpEvents", () => {
  it("ignores a replayed event id so a retry cannot double-count", () => {
    const events = [
      { conceptId: "c1", outcome: "solved_unaided" as const, eventId: "same" },
      { conceptId: "c1", outcome: "solved_unaided" as const, eventId: "same" },
    ];
    const result = applyAssignmentHelpEvents(events, { c1: prev });
    expect(result.applied).toHaveLength(1);
    expect(result.skippedEventIds).toEqual(["same"]);
    expect(result.mastery.c1!.attempts).toBe(prev.attempts + 1);
  });
});
