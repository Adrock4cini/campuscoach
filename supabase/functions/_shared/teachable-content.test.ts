import { describe, expect, it } from "vitest";
import {
  isCaptureMetadataLine,
  isStudentConfusionLine,
  isTeachableAnswer,
  isTeachableConceptName,
} from "./teachable-content";
import {
  buildDeterministicFlashcards,
  buildDeterministicMultipleChoice,
  buildDeterministicMatchingPairs,
  dedupeStudyConcepts,
} from "./artifact-validation";
import { buildSolvableProblemChoices, extractSolvableProblem } from "./problem-source";

const LOGISTICS = "Test Friday — covers fractions, decimals, and percentages.";
const CONFUSION = "Student note: I never know whether to multiply or divide.";
const METADATA = "P9 mobile note";
const PERCENT_OF = "14% of 50 = ?";
const PLAIN_PERCENT_OF = "14% of 50";
const DISCOUNT = "$80 jacket 25% off";
const REAL = "A percent is a ratio that compares a number to 100.";

describe("teachable-content gate", () => {
  it("rejects logistics, confusion, and capture metadata as teaching answers", () => {
    expect(isTeachableAnswer(LOGISTICS)).toBe(false);
    expect(isTeachableAnswer(CONFUSION)).toBe(false);
    expect(isTeachableAnswer(METADATA)).toBe(false);
    expect(isStudentConfusionLine(CONFUSION)).toBe(true);
    expect(isCaptureMetadataLine(METADATA)).toBe(true);
    expect(isCaptureMetadataLine("QA probe 3")).toBe(true);
  });

  it("keeps real class explanations teachable", () => {
    expect(isTeachableAnswer(REAL)).toBe(true);
    expect(isTeachableAnswer(PLAIN_PERCENT_OF)).toBe(true);
    expect(isTeachableConceptName("Percent of a Number")).toBe(true);
    expect(isTeachableConceptName(CONFUSION)).toBe(false);
  });
});

describe("solvable problems beat generic recall", () => {
  it("turns a percent-of problem into a concrete question with the computed answer", () => {
    const problem = extractSolvableProblem(PERCENT_OF);
    expect(problem?.question).toBe("What is 14% of 50?");
    expect(problem?.answer).toBe("7");
  });

  it("turns a discount problem into a sale-price question", () => {
    const problem = extractSolvableProblem(DISCOUNT);
    expect(problem?.question).toContain("25% off");
    expect(problem?.answer).toBe("$60");
  });

  it("builds four grounded numeric choices", () => {
    const mc = buildSolvableProblemChoices(PERCENT_OF);
    expect(mc?.choices).toHaveLength(4);
    expect(mc?.choices[mc.answerIndex]).toBe("7");
  });

  it("leaves ordinary prose alone", () => {
    expect(extractSolvableProblem(REAL)).toBeNull();
  });
});

describe("deterministic builders never teach source junk", () => {
  const concepts = [
    { id: "c1", name: "Test Friday", definition: LOGISTICS },
    { id: "c2", name: "Multiply or divide", definition: CONFUSION },
    { id: "c3", name: "Percent of a Number", definition: REAL },
  ];
  const sources = new Map([
    ["c1", LOGISTICS],
    ["c2", CONFUSION],
    ["c3", PERCENT_OF],
  ]);

  it("drops logistics and confusion cards and prefers the real problem", () => {
    const cards = buildDeterministicFlashcards(concepts, sources, 5);
    expect(cards).toHaveLength(1);
    expect(cards[0].conceptId).toBe("c3");
    expect(cards[0].front).toBe("What is 14% of 50?");
    expect(String(cards[0].back)).toContain("7");
  });

  it("asks the captured problem directly in multiple choice", () => {
    const questions = buildDeterministicMultipleChoice(concepts, sources, 5);
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe("What is 14% of 50?");
    const choices = questions[0].choices as string[];
    expect(choices.some((choice) => choice.includes("Friday") || choice.includes("multiply or divide"))).toBe(false);
  });

  it("never pairs a matching definition with logistics or a misconception", () => {
    const { pairs } = buildDeterministicMatchingPairs(concepts, sources, 6);
    expect(pairs.every((pair) => pair.conceptId !== "c1" && pair.conceptId !== "c2")).toBe(true);
  });

  it("collapses near-synonym concepts before a set is built", () => {
    const deduped = dedupeStudyConcepts([
      { id: "a", name: "Percentage to Decimal Conversion" },
      { id: "b", name: "Converting a percentage to a decimal" },
    ]);
    expect(deduped).toHaveLength(1);
  });
});
