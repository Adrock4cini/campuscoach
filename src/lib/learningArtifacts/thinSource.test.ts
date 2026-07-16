import { describe, expect, it } from "vitest";
import {
  buildExactThinMultipleChoice,
  extractExactThinSource,
} from "../../../supabase/functions/_shared/thin-source";

describe("source-faithful study questions", () => {
  it("preserves a thin arithmetic note as a direct recall question", () => {
    const flashcard = extractExactThinSource("2+2 = 4");
    const multipleChoice = buildExactThinMultipleChoice("2+2 = 4");

    expect(flashcard).toMatchObject({
      question: "What is 2 + 2?",
      answer: "4",
      sourceExcerpt: "2+2 = 4",
    });
    expect(multipleChoice?.prompt).toBe("What is 2 + 2?");
    expect(multipleChoice?.choices[multipleChoice.answerIndex]).toBe("4");
    expect(multipleChoice?.choices).toHaveLength(4);
  });

  it("leaves ordinary class notes for grounded model generation", () => {
    expect(extractExactThinSource("Mitosis has four stages.")).toBeNull();
    expect(buildExactThinMultipleChoice("Mitosis has four stages.")).toBeNull();
  });
});
