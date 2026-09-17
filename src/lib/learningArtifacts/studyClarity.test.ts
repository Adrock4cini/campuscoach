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
    expect(shortStudyAnswer("Encoding", "Retrieval: getting information out of memory", 12)).toBe("");
    expect(shortStudyAnswer("Spacing effect", `${slide} · Spacing effect beats massed practice`, 12)).toBe("Spacing effect beats massed practice");
    expect(shortStudyAnswer("Encoding", "Encoding: " + "a very long answer ".repeat(20), 12)).toBe("");
    expect(shortStudyAnswer("Storage", "Storage: does not lose information over time", 12)).toBe("does not lose information over time");
  });
});

it("rejects short multi-concept slide answers, schedule blurbs and truncated answers", () => {
  for (const back of [
    "Encoding: getting info into memory • Storage: keeping it over time",
    "Quiz 2 — in class Date: Friday September 25, 2026 Covers: causes, compromises, secession",
    "Optional reminder Sometime next week — TBA Bring your textbook if you can",
    "A source explanation ending mid-sentence…",
  ]) expect(needsConciseStudyRebuild("flashcards", { cards: [{ back }] })).toBe(true);
});

it("never turns the HIST planner fixture into answers about the Civil War", () => {
  const concepts = ["Secession", "Causes of the Civil War", "TBA (To Be Announced)"].map(name => ({ id: name, name }));
  const sources = new Map([
    [concepts[0].id, "Quiz 2 — in class Date: Friday September 25, 2026 Covers: causes, compromises, secession 10 multiple choice + 1 short answer"],
    [concepts[1].id, "QA PR62 HIST — Week 4 Causes of the Civil War Lecture slides for planner QA Assignment (from this slide) Due: Friday September 18, 2026 Write 1 page: explain one cause of the Civil War in your own words with one modern…"],
    [concepts[2].id, "Optional reminder Sometime next week — TBA Bring your textbook if you can"],
  ]);
  expect(buildDeterministicFlashcards(concepts, sources, 3)).toEqual([]);
  expect(buildDeterministicMultipleChoice(concepts, sources, 3)).toEqual([]);
  expect(buildDeterministicMatchingPairs(concepts, sources, 3).pairs).toEqual([]);
});
