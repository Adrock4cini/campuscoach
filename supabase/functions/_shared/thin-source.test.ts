import { describe, expect, it } from "vitest";
import { buildExactThinMultipleChoice, extractExactThinSource } from "./thin-source";

describe("exact thin-source extraction", () => {
  it("preserves a single arithmetic fact as one concept and one direct question", () => {
    const result = extractExactThinSource("2+2 = 4");

    expect(result).toMatchObject({
      question: "What is 2 + 2?",
      answer: "4",
      sourceExcerpt: "2+2 = 4",
    });
    expect(result?.concepts).toEqual([{
      name: "2 + 2 = 4",
      definition: "2 + 2 equals 4.",
      examples: ["2 + 2 = 4"],
      professor_emphasis: false,
    }]);
  });

  it("does not override ordinary class notes", () => {
    expect(extractExactThinSource("Mitosis has four stages.")).toBeNull();
  });

  it("builds a direct, source-faithful multiple-choice question", () => {
    const result = buildExactThinMultipleChoice("2+2 = 4");

    expect(result?.prompt).toBe("What is 2 + 2?");
    expect(result?.choices[result.answerIndex]).toBe("4");
    expect(result?.choices).toHaveLength(4);
    expect(result?.rationale).toBe("2+2 = 4.");
  });
});
