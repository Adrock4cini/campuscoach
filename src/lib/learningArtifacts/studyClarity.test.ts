import { needsConciseStudyRebuild } from "../study/studyClarity";
import { describe, expect, it } from "vitest";
import { buildDeterministicFlashcards, buildDeterministicMultipleChoice, buildDeterministicMatchingPairs } from "../../../supabase/functions/_shared/artifact-validation";
import { shortStudyAnswer } from "../../../supabase/functions/_shared/short-study-answer";

const slide = "Hale · Fall 2026 Key concepts for Quiz 1 · Encoding: getting info into memory · Storage: keeping it over time · Retrieval: getting it back out · Assignment due September 12: explain spacing effect.";
const concepts = ["Encoding", "Storage", "Retrieval"].map((name) => ({ id: name, name }));
const sources = new Map(concepts.map(({ id }) => [id, slide]));

describe("study clarity from shared lecture slides", () => {
  it("isolates each definition while retaining original evidence", () => {
    const cards = buildDeterministicFlashcards(concepts, sources, 3);
    expect(cards.map((card) => card.back)).toEqual(["getting info into memory", "keeping it over time", "getting it back out"]);
    expect(cards.every((card) => card.sourceExcerpt === slide)).toBe(true);
    const pairs = buildDeterministicMatchingPairs(concepts, sources, 3).pairs;
    expect(pairs.map((pair) => pair.right)).toEqual(cards.map((card) => card.back));
  });
  it("keeps logistics and multi-concept walls out of choices and feedback", () => {
    const questions = buildDeterministicMultipleChoice(concepts, sources, 3);
    expect(questions).toHaveLength(3);
    for (const question of questions) {
      const choices = question.choices as string[];
      expect(new Set(choices).size).toBe(4);
      expect(choices.every((choice) => choice.split(/\s+/).length <= 12)).toBe(true);
      expect(choices.join(" ")).not.toMatch(/Hale|September|Assignment|Quiz/);
      expect(question.rationale).not.toContain(slide);
    }
  });
  it("marks old paragraph sets for rebuild without invalidating clean sets", () => {
    expect(needsConciseStudyRebuild("flashcards", { cards: [{ back: "word ".repeat(60) }] })).toBe(true);
    expect(needsConciseStudyRebuild("matching", { pairs: [{ left: "Encoding", right: slide }] })).toBe(true);
    expect(needsConciseStudyRebuild("multiple_choice", { questions: buildDeterministicMultipleChoice(concepts, sources, 3) })).toBe(false);
  });
  it("never truncates an unsupported long answer or picks a neighbour's definition", () => {
    expect(shortStudyAnswer("Consolidation", slide, 12)).toBe("");
    expect(shortStudyAnswer("Encoding", "Encoding: " + "a very long answer ".repeat(20), 12)).toBe("");
    expect(shortStudyAnswer("Storage", "Storage: does not lose information over time", 12)).toBe("does not lose information over time");
  });
});
