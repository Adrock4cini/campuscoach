import { describe, expect, it } from "vitest";
import { leaveSessionCopy, pendingEvidenceSegment } from "./incrementalEvidence";

const answer = (correct: boolean, recovery = false) => ({
  conceptId: "c1",
  correct,
  confidence: "sure",
  recovery,
});

describe("incremental study evidence", () => {
  it("only sends what has not been saved yet", () => {
    const results = [answer(true), answer(false), answer(true)];
    expect(pendingEvidenceSegment(results, 0, { final: true })).toMatchObject({ total: 3, correct: 2 });
    expect(pendingEvidenceSegment(results, 2, { final: true })).toMatchObject({ total: 1, correct: 1 });
    expect(pendingEvidenceSegment(results, 3, { final: true })).toBeNull();
  });

  it("holds an unresolved miss back until its recovery pass is answered", () => {
    const results = [answer(true), answer(false), answer(true)];
    // Mid-session: only the clean first hit is settled.
    expect(pendingEvidenceSegment(results, 0)).toMatchObject({ total: 1, correct: 1 });
    // Once the recovery pass lands, the miss and its recovery flush together.
    const withRecovery = [...results, answer(true, true)];
    expect(pendingEvidenceSegment(withRecovery, 1)).toMatchObject({ total: 2, correct: 1 });
  });

  it("does not let a retry inflate the correct count", () => {
    const segment = pendingEvidenceSegment([answer(true, true)], 0);
    expect(segment).toMatchObject({ total: 1, correct: 0 });
  });

  it("tells the truth about saved progress when leaving", () => {
    expect(leaveSessionCopy(0)).toContain("nothing to lose");
    expect(leaveSessionCopy(6)).toContain("saved (6 answers)");
    expect(leaveSessionCopy(6)).not.toContain("have not been saved");
  });
});
