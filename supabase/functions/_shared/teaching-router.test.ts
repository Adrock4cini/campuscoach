import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLearningProblem } from "./teaching-router.ts";

Deno.test("percent-of routes to problem solving and transfer", () => {
  const route = classifyLearningProblem({
    conceptName: "Percent of a Number",
    sourceExcerpt: "QA: What is 14% of 50? Student note: I never know whether to multiply or divide.",
    studentConfusion: "I never know whether to multiply or divide.",
  });
  assertEquals(route.kind, "solve-problems");
  assertEquals(route.moves, ["student-attempt", "hint", "worked-example", "faded-example", "similar-problem"]);
});

Deno.test("hypotonic versus hypertonic routes to contrast with familiar bridge", () => {
  const route = classifyLearningProblem({
    conceptName: "Hypotonic vs Hypertonic",
    definition: "Hypotonic solution: water moves into the cell and it swells. Hypertonic solution: water moves out and the cell shrinks.",
    studentConfusion: "I always mix up hypotonic and hypertonic and get them backwards.",
  });
  assertEquals(route.kind, "compare-ideas");
  assertEquals(route.confusable, true);
  assertEquals(route.familiarBridgeEligible, true);
  assertEquals(route.moves.includes("discrimination-question"), true);
});

Deno.test("Maryland Annapolis stays a compact fact instead of becoming a lecture", () => {
  const route = classifyLearningProblem({
    conceptName: "Maryland capital",
    sourceExcerpt: "Maryland — Annapolis",
  });
  assertEquals(route.kind, "memorize-fact");
  assertEquals(route.moves, ["student-attempt", "familiar-bridge", "retrieval-question", "spacing"]);
});

Deno.test("ordered steps route to sequence memory", () => {
  const route = classifyLearningProblem({
    conceptName: "Accounting cycle",
    sourceExcerpt: "First analyze the transaction, then journalize it, next post to the ledger, finally prepare the trial balance.",
  });
  assertEquals(route.kind, "sequence-events");
});

Deno.test("multi-item list routes to chunking before mnemonic", () => {
  const route = classifyLearningProblem({
    conceptName: "Four review factors",
    sourceExcerpt: "Cash, Communication, Compliance, Customer protection",
  });
  assertEquals(route.kind, "memorize-list");
  assertEquals(route.moves[1], "chunking");
});
