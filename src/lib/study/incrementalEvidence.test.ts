import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceOutbox,
  drainEvidenceOutbox,
  enqueueEvidenceRequest,
  leaveSessionCopy,
  pendingEvidenceSegment,
  type DurableEvidenceRequest,
} from "./incrementalEvidence";

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
    expect(segment).toMatchObject({ total: 1, correct: 0, resultCount: 1 });
  });

  it("moves the raw-result cursor past recovery entries", () => {
    const results = [answer(false), answer(true), answer(true, true)];
    const segment = pendingEvidenceSegment(results, 0);
    expect(segment).toMatchObject({ total: 2, correct: 1, resultCount: 3 });
    expect(pendingEvidenceSegment(results, segment!.resultCount)).toBeNull();
  });

  it("keeps interleaved misses with their recovery answers", () => {
    const firstMiss = { ...answer(false), conceptId: "c1" };
    const secondMiss = { ...answer(false), conceptId: "c2" };
    const firstRecovery = { ...answer(true, true), conceptId: "c1" };
    const secondRecovery = { ...answer(true, true), conceptId: "c2" };

    expect(pendingEvidenceSegment([firstMiss, secondMiss, firstRecovery], 0)).toBeNull();
    expect(pendingEvidenceSegment(
      [firstMiss, secondMiss, firstRecovery, secondRecovery],
      0,
    )).toMatchObject({ total: 2, correct: 0, resultCount: 4 });
  });

  it("serializes queued requests and counts answers separately from recoveries", async () => {
    const outbox = createEvidenceOutbox<{ marker: string }, string>();
    enqueueEvidenceRequest(outbox, {
      attemptId: "attempt-1",
      body: { marker: "first" },
      resultCount: 2,
      answerCount: 1,
    });
    enqueueEvidenceRequest(outbox, {
      attemptId: "attempt-2",
      body: { marker: "second" },
      resultCount: 1,
      answerCount: 1,
    });

    let concurrent = 0;
    let maximumConcurrent = 0;
    const send = vi.fn(async ({ body }: DurableEvidenceRequest<{ marker: string }>) => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      return body.marker;
    });

    const [firstDrain, secondDrain] = await Promise.all([
      drainEvidenceOutbox(outbox, send),
      drainEvidenceOutbox(outbox, send),
    ]);

    expect(firstDrain).toBe("second");
    expect(secondDrain).toBe("second");
    expect(maximumConcurrent).toBe(1);
    expect(send.mock.calls.map(([request]) => request.attemptId)).toEqual(["attempt-1", "attempt-2"]);
    expect(outbox).toMatchObject({
      pending: [],
      queuedResultCount: 3,
      savedResultCount: 3,
      savedAnswerCount: 2,
    });
  });

  it("retains the exact failed request for an idempotent retry", async () => {
    const outbox = createEvidenceOutbox<{ marker: string }, string>();
    const body = { marker: "stable" };
    enqueueEvidenceRequest(outbox, {
      attemptId: "attempt-stable",
      body,
      resultCount: 1,
      answerCount: 1,
    });
    const seen: unknown[] = [];
    const send = vi.fn(async (request: unknown) => {
      seen.push(request);
      if (seen.length === 1) throw new Error("response lost");
      return "saved";
    });

    await expect(drainEvidenceOutbox(outbox, send)).rejects.toThrow("response lost");
    expect(outbox.pending).toHaveLength(1);
    expect(outbox.savedResultCount).toBe(0);

    await expect(drainEvidenceOutbox(outbox, send)).resolves.toBe("saved");
    expect(seen[1]).toBe(seen[0]);
    expect(outbox.savedResultCount).toBe(1);
    expect(outbox.savedAnswerCount).toBe(1);
  });

  it("tells the truth about saved progress when leaving", () => {
    expect(leaveSessionCopy(0)).toContain("nothing to lose");
    expect(leaveSessionCopy(6)).toContain("saved (6 answers)");
    expect(leaveSessionCopy(6)).not.toContain("have not been saved");
  });
});
