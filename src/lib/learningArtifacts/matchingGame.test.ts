import { describe, expect, it } from "vitest";
import {
  isMatchingChoicePermutation,
  validateMatchingPayload,
  type MatchingPayload,
} from "./matchingGame";

const validPayload: MatchingPayload = {
  pairs: [
    {
      id: "pair-1",
      conceptId: "concept-1",
      conceptName: "Cell structures",
      left: "Mitochondria",
      right: "Produces usable cellular energy",
      sourceExcerpt: "Mitochondria generate ATP for the cell.",
    },
    {
      id: "pair-2",
      conceptId: "concept-2",
      conceptName: "Cell structures",
      left: "Nucleus",
      right: "Stores most genetic material",
      sourceExcerpt: "The nucleus contains the cell's DNA.",
    },
    {
      id: "pair-3",
      conceptId: "concept-3",
      conceptName: "Cell structures",
      left: "Ribosome",
      right: "Builds proteins",
    },
  ],
};

const allowed = ["concept-1", "concept-2", "concept-3"];

describe("matching game payload validation", () => {
  it("normalizes a valid grounded payload without mutating the source", () => {
    const payload = structuredClone(validPayload);
    payload.pairs[0] = {
      ...payload.pairs[0],
      id: " pair-1 ",
      left: " Mitochondria ",
      sourceExcerpt: " Mitochondria generate ATP for the cell. ",
    };

    expect(validateMatchingPayload(payload, allowed)).toEqual(validPayload);
    expect(payload.pairs[0].left).toBe(" Mitochondria ");
  });

  it("accepts several pairs for one grounded concept", () => {
    const payload: MatchingPayload = {
      pairs: validPayload.pairs.map((pair) => ({ ...pair, conceptId: "concept-1" })),
    };

    expect(validateMatchingPayload(payload, ["concept-1"])).not.toBeNull();
  });

  it.each([
    ["missing payload", undefined, allowed],
    ["missing pairs", {}, allowed],
    ["too few pairs", { pairs: validPayload.pairs.slice(0, 2) }, allowed],
    ["too many pairs", { pairs: [...validPayload.pairs, ...validPayload.pairs, validPayload.pairs[0]] }, allowed],
    ["empty allow-list", validPayload, []],
    ["foreign concept", validPayload, ["concept-1", "concept-2"]],
    ["non-object pair", { pairs: [validPayload.pairs[0], validPayload.pairs[1], null] }, allowed],
    ["empty id", { pairs: validPayload.pairs.map((pair, i) => i === 0 ? { ...pair, id: " " } : pair) }, allowed],
    ["empty concept name", { pairs: validPayload.pairs.map((pair, i) => i === 0 ? { ...pair, conceptName: "" } : pair) }, allowed],
    ["empty left", { pairs: validPayload.pairs.map((pair, i) => i === 0 ? { ...pair, left: "" } : pair) }, allowed],
    ["empty right", { pairs: validPayload.pairs.map((pair, i) => i === 0 ? { ...pair, right: "  " } : pair) }, allowed],
    ["empty supplied excerpt", { pairs: validPayload.pairs.map((pair, i) => i === 0 ? { ...pair, sourceExcerpt: "" } : pair) }, allowed],
    ["null supplied excerpt", { pairs: validPayload.pairs.map((pair, i) => i === 0 ? { ...pair, sourceExcerpt: null } : pair) }, allowed],
    ["duplicate id", { pairs: validPayload.pairs.map((pair, i) => i === 1 ? { ...pair, id: "pair-1" } : pair) }, allowed],
    ["duplicate left ignoring case", { pairs: validPayload.pairs.map((pair, i) => i === 1 ? { ...pair, left: "MITOCHONDRIA" } : pair) }, allowed],
    ["duplicate right ignoring whitespace", { pairs: validPayload.pairs.map((pair, i) => i === 1 ? { ...pair, right: "  Produces usable cellular energy " } : pair) }, allowed],
  ])("fails closed for %s", (_label, payload, conceptIds) => {
    expect(validateMatchingPayload(payload, conceptIds as string[])).toBeNull();
  });

  it("verifies that an injected shuffle returns each choice exactly once", () => {
    const choices = [
      { pairId: "pair-3", label: "C" },
      { pairId: "pair-1", label: "A" },
      { pairId: "pair-2", label: "B" },
    ];

    const expected = [choices[1], choices[2], choices[0]];
    expect(isMatchingChoicePermutation(choices, expected)).toBe(true);
    expect(isMatchingChoicePermutation([choices[0], choices[0], choices[1]], expected)).toBe(false);
    expect(isMatchingChoicePermutation(choices.slice(0, 2), expected)).toBe(false);
    expect(isMatchingChoicePermutation(
      choices.map((choice, index) => index === 0 ? { ...choice, label: "Changed" } : choice),
      expected,
    )).toBe(false);
  });
});
