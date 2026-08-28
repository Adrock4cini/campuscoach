import { describe, expect, it } from "vitest";
import {
  aggregateStudyRunSegments,
  parseStudyRunContract,
  summarizeAuthoritativeStudyRunEvidence,
} from "./study-run";

const studyRunId = "10000000-0000-4000-8000-000000000001";

describe("grouped study run contract", () => {
  it("keeps legacy callers compatible but rejects partial grouping metadata", () => {
    expect(parseStudyRunContract({ artifactId: "artifact" })).toEqual({ kind: "legacy" });
    expect(parseStudyRunContract({ studyRunId })).toMatchObject({ kind: "invalid" });
  });

  it("accepts a complete bounded segment contract", () => {
    expect(parseStudyRunContract({ studyRunId, segmentIndex: 2, segmentFinal: true })).toEqual({
      kind: "grouped",
      studyRunId,
      segmentIndex: 2,
      segmentFinal: true,
    });
  });

  it("aggregates completed deltas once and completes only a contiguous final run", () => {
    const base = {
      resultStatus: "completed",
      segmentFinal: false,
    };
    const aggregate = aggregateStudyRunSegments([
      {
        ...base,
        clientAttemptId: "attempt-1",
        segmentIndex: 0,
        correct: 1,
        total: 1,
        durationSeconds: 5,
      },
      {
        ...base,
        clientAttemptId: "attempt-2",
        segmentIndex: 1,
        segmentFinal: true,
        correct: 0,
        total: 1,
        durationSeconds: 7,
      },
    ]);
    expect(aggregate).toEqual({
      correct: 1,
      total: 2,
      durationSeconds: 12,
      score: 50,
      segmentCount: 2,
      finalSegmentIndex: 1,
      complete: true,
    });
  });

  it("does not finalize a run with a missing or processing segment", () => {
    expect(aggregateStudyRunSegments([
      {
        clientAttemptId: "attempt-2",
        segmentIndex: 1,
        segmentFinal: true,
        resultStatus: "completed",
        correct: 1,
        total: 1,
        durationSeconds: 7,
      },
    ])).toMatchObject({ complete: false });
    expect(aggregateStudyRunSegments([
      {
        clientAttemptId: "attempt-1",
        segmentIndex: 0,
        segmentFinal: false,
        resultStatus: "processing",
        correct: 1,
        total: 1,
        durationSeconds: 5,
      },
    ])).toMatchObject({ correct: 0, total: 0, complete: false });
  });

  it("requires each completed segment declaration to match authoritative concept evidence", () => {
    const attempts = [
      {
        clientAttemptId: "attempt-1",
        segmentIndex: 0,
        segmentFinal: false,
        resultStatus: "completed",
        correct: 1,
        total: 1,
        durationSeconds: 5,
      },
      {
        clientAttemptId: "attempt-2",
        segmentIndex: 1,
        segmentFinal: true,
        resultStatus: "completed",
        correct: 0,
        total: 1,
        durationSeconds: 7,
      },
    ];
    expect(summarizeAuthoritativeStudyRunEvidence(attempts, [
      { clientAttemptId: "attempt-1", conceptId: "concept-1", correct: true },
      { clientAttemptId: "attempt-2", conceptId: "concept-2", correct: false },
    ], ["concept-1", "concept-2"])).toEqual({
      correct: 1,
      total: 2,
      score: 50,
      coverageComplete: true,
    });
    expect(summarizeAuthoritativeStudyRunEvidence(attempts, [
      { clientAttemptId: "attempt-1", conceptId: "concept-1", correct: true },
      { clientAttemptId: "attempt-2", conceptId: "concept-1", correct: false },
    ], ["concept-1", "concept-2"])).toBeNull();
  });

  it("keeps incomplete artifact coverage non-final and rejects declared-count drift", () => {
    const attempt = [{
      clientAttemptId: "attempt-1",
      segmentIndex: 0,
      segmentFinal: false,
      resultStatus: "completed",
      correct: 1,
      total: 1,
      durationSeconds: 5,
    }];
    expect(summarizeAuthoritativeStudyRunEvidence(attempt, [
      { clientAttemptId: "attempt-1", conceptId: "concept-1", correct: true },
    ], ["concept-1", "concept-2"])).toMatchObject({ coverageComplete: false });
    expect(summarizeAuthoritativeStudyRunEvidence(attempt, [], ["concept-1"])).toBeNull();
  });
});
