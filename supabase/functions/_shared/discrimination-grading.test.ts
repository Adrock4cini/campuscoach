import { describe, expect, it } from "vitest";
import {
  gradeMatchingFirstChoices,
  gradeMultipleChoiceSelections,
} from "./discrimination-grading";

const multipleChoicePayload = {
  questions: [
    {
      conceptId: "concept-a",
      choices: ["A", "B", "C", "D"],
      answerIndex: 2,
    },
    {
      conceptId: "concept-b",
      choices: ["W", "X", "Y", "Z"],
      answerIndex: 0,
    },
  ],
};

const matchingPayload = {
  pairs: [
    { id: "pair-a", conceptId: "concept-a" },
    { id: "pair-b", conceptId: "concept-b" },
    { id: "pair-c", conceptId: "concept-c" },
  ],
};

describe("server-derived discrimination grading", () => {
  it("derives multiple-choice correctness from the immutable answer index", () => {
    expect(gradeMultipleChoiceSelections(multipleChoicePayload, [
      { conceptId: "concept-a", firstSelectedIndex: 2 },
      { conceptId: "concept-b", firstSelectedIndex: 3 },
    ])).toEqual({
      ok: true,
      grades: [
        { conceptId: "concept-a", correct: true, firstSelectedIndex: 2 },
        { conceptId: "concept-b", correct: false, firstSelectedIndex: 3 },
      ],
    });
  });

  it.each([
    ["foreign concept", [{ conceptId: "concept-x", firstSelectedIndex: 0 }]],
    ["out-of-range choice", [{ conceptId: "concept-a", firstSelectedIndex: 4 }]],
    ["duplicate question", [
      { conceptId: "concept-a", firstSelectedIndex: 2 },
      { conceptId: "concept-a", firstSelectedIndex: 1 },
    ]],
  ])("rejects a %s instead of accepting browser correctness", (_label, selections) => {
    expect(gradeMultipleChoiceSelections(multipleChoicePayload, selections)).toMatchObject({ ok: false });
  });

  it("derives matching correctness from first left/right pair IDs", () => {
    expect(gradeMatchingFirstChoices(matchingPayload, [
      { leftPairId: "pair-a", rightPairId: "pair-c" },
      { leftPairId: "pair-b", rightPairId: "pair-b" },
    ])).toEqual({
      ok: true,
      grades: [
        {
          conceptId: "concept-a",
          correct: false,
          leftPairId: "pair-a",
          rightPairId: "pair-c",
        },
        {
          conceptId: "concept-b",
          correct: true,
          leftPairId: "pair-b",
          rightPairId: "pair-b",
        },
      ],
    });
  });

  it("accepts exactly N-1 independent matches and gives the forced final pair no grade", () => {
    const result = gradeMatchingFirstChoices(matchingPayload, [
      { leftPairId: "pair-a", rightPairId: "pair-a" },
      { leftPairId: "pair-b", rightPairId: "pair-b" },
    ]);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.grades.map((grade) => grade.conceptId)).not.toContain("concept-c");
  });

  it("rejects an impossible all-correct N-of-N transcript", () => {
    expect(gradeMatchingFirstChoices(matchingPayload, [
      { leftPairId: "pair-a", rightPairId: "pair-a" },
      { leftPairId: "pair-b", rightPairId: "pair-b" },
      { leftPairId: "pair-c", rightPairId: "pair-c" },
    ])).toEqual({
      ok: false,
      reason: "matching transcript includes a forced final answer",
    });
  });

  it.each([
    ["too few choices", [{ leftPairId: "pair-a", rightPairId: "pair-a" }]],
    ["foreign right pair", [
      { leftPairId: "pair-a", rightPairId: "pair-x" },
      { leftPairId: "pair-b", rightPairId: "pair-b" },
    ]],
    ["duplicate left pair", [
      { leftPairId: "pair-a", rightPairId: "pair-a" },
      { leftPairId: "pair-a", rightPairId: "pair-b" },
    ]],
  ])("rejects matching with %s", (_label, firstChoices) => {
    expect(gradeMatchingFirstChoices(matchingPayload, firstChoices)).toMatchObject({ ok: false });
  });
});
