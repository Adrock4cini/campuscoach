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

  it("does not let a logistics-shaped topic label override grounded content", () => {
    const result = decideArtifactTeachingRoute({
      concepts: [{ id: "c1", name: "Maryland capital", examples: null }],
      sourceExcerptByConcept: new Map([["c1", "Maryland — Annapolis"]]),
      topic: "Test Friday — solve every review problem",
    });
    expect(result.route.kind).toBe("memorize-fact");
    expect(result.taskKind).toBe("memorize-terms");
  });

  it("does not let the first easy fact hide a later problem-solving concept", () => {
    const result = decideArtifactTeachingRoute({
      concepts: [
        { id: "fact", name: "Percent symbol", definition: "Percent means per hundred." },
        { id: "problem", name: "Percent of a Number", definition: null },
      ],
      sourceExcerptByConcept: new Map([
        ["fact", "Percent means per hundred."],
        ["problem", "What is 14% of 50?"],
      ]),
    });
    expect(result.route.kind).toBe("solve-problems");
    expect(result.taskKind).toBe("solve-problems");
  });

  it("lets an explicit confusable pair outrank a neighboring procedure in the same set", () => {
    const result = decideArtifactTeachingRoute({
      concepts: [
        { id: "procedure", name: "Calculate concentration", definition: "Calculate the concentration from the given values." },
        {
          id: "contrast",
          name: "Hypotonic vs Hypertonic",
          definition: "Hypotonic: water moves in. Hypertonic: water moves out.",
        },
      ],
      sourceExcerptByConcept: new Map([
        ["procedure", "Calculate concentration."],
        ["contrast", "Hypotonic: water moves in. Hypertonic: water moves out."],
      ]),
      studentConfusion: "I always mix up hypotonic and hypertonic and get them backwards.",
    });
    expect(result.route.kind).toBe("compare-ideas");
    expect(result.taskKind).toBe("compare-ideas");
    expect(result.preferredStrategyId).toBe("compare-table");
  });
});
