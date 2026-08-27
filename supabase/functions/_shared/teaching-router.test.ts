import {
  classifyLearningProblem,
  preferredStrategyForRoute,
  strategyTaskKindForRoute,
} from "./teaching-router.ts";

describe("teaching router", () => {
  it("routes percent-of to problem solving and transfer", () => {
    const route = classifyLearningProblem({
      conceptName: "Percent of a Number",
      sourceExcerpt: "What is 14% of 50?",
      studentConfusion: "I never know whether to multiply or divide.",
    });
    expect(route.kind).toBe("solve-problems");
    expect(route.moves).toEqual([
      "student-attempt",
      "hint",
      "worked-example",
      "faded-example",
      "similar-problem",
    ]);
    expect(strategyTaskKindForRoute(route)).toBe("solve-problems");
    expect(preferredStrategyForRoute(route)).toBe("worked-example");
  });

  it("routes hypotonic versus hypertonic to contrast with familiar bridge", () => {
    const route = classifyLearningProblem({
      conceptName: "Hypotonic vs Hypertonic",
      definition: "Hypotonic: water moves into the cell and it swells. Hypertonic: water moves out and it shrinks.",
      studentConfusion: "I always mix up hypotonic and hypertonic and get them backwards.",
    });
    expect(route.kind).toBe("compare-ideas");
    expect(route.confusable).toBe(true);
    expect(route.familiarBridgeEligible).toBe(true);
    expect(strategyTaskKindForRoute(route)).toBe("compare-ideas");
    expect(preferredStrategyForRoute(route)).toBe("compare-table");
  });

  it("keeps Maryland Annapolis a compact fact instead of becoming a lecture", () => {
    const route = classifyLearningProblem({
      conceptName: "Maryland capital",
      sourceExcerpt: "Maryland — Annapolis",
    });
    expect(route.kind).toBe("memorize-fact");
    expect(route.moves).toEqual([
      "student-attempt",
      "familiar-bridge",
      "retrieval-question",
      "spacing",
    ]);
    expect(strategyTaskKindForRoute(route)).toBe("memorize-terms");
    expect(preferredStrategyForRoute(route)).toBe("familiar-bridge");
  });

  it("routes ordered accounting steps to the existing mini-story strategy", () => {
    const route = classifyLearningProblem({
      conceptName: "Accounting cycle",
      sourceExcerpt: "First analyze the transaction, then journalize it, next post to the ledger, finally prepare the trial balance.",
    });
    expect(route.kind).toBe("sequence-events");
    expect(strategyTaskKindForRoute(route)).toBe("sequence-events");
    expect(preferredStrategyForRoute(route)).toBe("mini-story");
  });

  it("routes a multi-item list to chunking before the existing acronym strategy", () => {
    const route = classifyLearningProblem({
      conceptName: "Four review factors",
      sourceExcerpt: "Cash, Communication, Compliance, Customer protection",
    });
    expect(route.kind).toBe("memorize-list");
    expect(route.moves[1]).toBe("chunking");
    expect(preferredStrategyForRoute(route)).toBe("acronym");
  });
});
