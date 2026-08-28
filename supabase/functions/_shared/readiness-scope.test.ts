import { describe, expect, it } from "vitest";
import {
  computeScopedReadiness,
  examReadinessScopeFromSnapshot,
} from "./readiness-scope.ts";

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];

describe("readiness scope", () => {
  it("counts missing mastery as zero", () => {
    expect(computeScopedReadiness(
      IDS,
      [{ concept_id: IDS[0], strength: 1 }],
      new Map(),
      new Set(),
    )).toEqual({ readiness: 20, readinessBefore: 20, conceptCount: 5 });
  });

  it("substitutes the frozen previous strength for readiness before", () => {
    expect(computeScopedReadiness(
      IDS.slice(0, 2),
      [{ concept_id: IDS[0], strength: 0.8 }],
      new Map([[IDS[0], 0.2]]),
      new Set([IDS[0]]),
    )).toEqual({ readiness: 40, readinessBefore: 10, conceptCount: 2 });
  });

  it("requires a versioned, bounded, valid, deduplicated exam scope", () => {
    expect(examReadinessScopeFromSnapshot({
      readinessScope: { schemaVersion: 1, type: "exam", conceptIds: [IDS[0], IDS[0], IDS[1]] },
    })).toEqual(IDS.slice(0, 2));
    expect(examReadinessScopeFromSnapshot({ readinessScope: { conceptIds: IDS } })).toBeNull();
  });
});
