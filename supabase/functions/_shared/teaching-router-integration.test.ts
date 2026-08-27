import { describe, expect, it } from "vitest";
import { decideArtifactTeachingRoute } from "./teaching-router-integration.ts";

function decide(name: string, source: string, definition: string | null = null) {
  return decideArtifactTeachingRoute({
    concepts: [{ id: "c1", name, definition, examples: null }],
    sourceExcerptByConcept: new Map([["c1", source]]),
  });
}

describe("generate-artifact teaching route adapter", () => {
  it("routes a percent problem independently of artifact format", () => {
    const result = decide("Percent of a Number", "What is 14% of 50?");
    expect(result.route.kind).toBe("solve-problems");
    expect(result.taskKind).toBe("solve-problems");
    expect(result.preferredStrategyId).toBe("worked-example");
  });

  it("routes hypo/hyper confusion to compare ideas", () => {
    const result = decideArtifactTeachingRoute({
      concepts: [{
        id: "c1",
        name: "Hypotonic vs Hypertonic",
        definition: "Hypotonic: water moves in and the cell swells. Hypertonic: water moves out and the cell shrinks.",
      }],
      sourceExcerptByConcept: new Map([["c1", "I always mix these up and get them backwards."]]),
      studentConfusion: "I always mix up hypotonic and hypertonic.",
    });
    expect(result.route.kind).toBe("compare-ideas");
    expect(result.taskKind).toBe("compare-ideas");
    expect(result.preferredStrategyId).toBe("compare-table");
  });

  it("routes Maryland Annapolis to compact fact retrieval", () => {
    const result = decide("Maryland capital", "Maryland — Annapolis");
    expect(result.route.kind).toBe("memorize-fact");
    expect(result.taskKind).toBe("memorize-terms");
    expect(result.preferredStrategyId).toBe("familiar-bridge");
  });
});
