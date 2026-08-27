import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLearningProblem, preferredStrategyForRoute, strategyTaskKindForRoute } from "./teaching-router.ts";

Deno.test("percent-of routes to problem solving and transfer", () => {
  const route = classifyLearningProblem({ conceptName: "Percent of a Number", sourceExcerpt: "What is 14% of 50?", studentConfusion: "I never know whether to multiply or divide." });
  assertEquals(route.kind, "solve-problems");
  assertEquals(route.moves, ["student-attempt", "hint", "worked-example", "faded-example", "similar-problem"]);
  assertEquals(strategyTaskKindForRoute(route), "solve-problems");
  assertEquals(preferredStrategyForRoute(route), "worked-example");
});

Deno.test("hypotonic versus hypertonic routes to contrast with familiar bridge", () => {
  const route = classifyLearningProblem({ conceptName: "Hypotonic vs Hypertonic", definition: "Hypotonic: water moves into the cell and it swells. Hypertonic: water moves out and it shrinks.", studentConfusion: "I always mix up hypotonic and hypertonic and get them backwards." });
  assertEquals(route.kind, "compare-ideas");
  assertEquals(route.confusable, true);
  assertEquals(route.familiarBridgeEligible, true);
  assertEquals(strategyTaskKindForRoute(route), "compare-ideas");
  assertEquals(preferredStrategyForRoute(route), "compare-table");
});

Deno.test("Maryland Annapolis stays a compact fact instead of becoming a lecture", () => {
  const route = classifyLearningProblem({ conceptName: "Maryland capital", sourceExcerpt: "Maryland — Annapolis" });
  assertEquals(route.kind, "memorize-fact");
  assertEquals(route.moves, ["student-attempt", "familiar-bridge", "retrieval-question", "spacing"]);
  assertEquals(strategyTaskKindForRoute(route), "memorize-terms");
  assertEquals(preferredStrategyForRoute(route), "familiar-bridge");
});

Deno.test("ordered accounting steps route to existing mini-story strategy", () => {
  const route = classifyLearningProblem({ conceptName: "Accounting cycle", sourceExcerpt: "First analyze the transaction, then journalize it, next post to the ledger, finally prepare the trial balance." });
  assertEquals(route.kind, "sequence-events");
  assertEquals(strategyTaskKindForRoute(route), "sequence-events");
  assertEquals(preferredStrategyForRoute(route), "mini-story");
});

Deno.test("multi-item list routes to chunking before existing acronym strategy", () => {
  const route = classifyLearningProblem({ conceptName: "Four review factors", sourceExcerpt: "Cash, Communication, Compliance, Customer protection" });
  assertEquals(route.kind, "memorize-list");
  assertEquals(route.moves[1], "chunking");
  assertEquals(preferredStrategyForRoute(route), "acronym");
});
