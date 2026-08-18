import { describe, expect, it } from "vitest";
import {
  aggregateMnemonicTechniqueFeedback,
  buildDeterministicFlashcards,
  buildDeterministicMatchingPairs,
  buildDeterministicMultipleChoice,
  validateArtifactPayload,
} from "./artifact-validation";

const concepts = [
  { id: "concept-1", name: "Mitosis" },
  { id: "concept-2", name: "Meiosis" },
  { id: "concept-3", name: "Interphase" },
];
const excerpts = new Map([
  ["concept-1", "Mitosis creates two genetically identical cells."],
  ["concept-2", "Meiosis creates four genetically different cells."],
  ["concept-3", "Interphase prepares a cell for division."],
]);

describe("strict learning-artifact validation", () => {
  it("builds flashcard answers from exact source instead of an AI paraphrase", () => {
    const cards = buildDeterministicFlashcards([
      { id: "concept-1", name: "Mitosis", definition: "Conflicting generated paraphrase." },
    ], new Map([["concept-1", "Mitosis creates two genetically identical cells."]]), 1);

    expect(cards).toEqual([expect.objectContaining({
      back: "Mitosis creates two genetically identical cells.",
      sourceExcerpt: "Mitosis creates two genetically identical cells.",
    })]);
  });

  it("builds a four-choice question whose answer and rationale preserve exact source", () => {
    const questions = buildDeterministicMultipleChoice([
      { id: "concept-1", name: "Mitosis", definition: "Conflicting generated paraphrase." },
    ], new Map([["concept-1", "Mitosis creates two genetically identical cells."]]), 1);

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      conceptId: "concept-1",
      sourceExcerpt: "Mitosis creates two genetically identical cells.",
      rationale: "Your class material states: Mitosis creates two genetically identical cells.",
    });
    const answerIndex = questions[0].answerIndex as number;
    expect((questions[0].choices as string[])[answerIndex]).toBe(
      "Mitosis creates two genetically identical cells.",
    );
  });

  it("accepts canonical flashcards and attaches only server excerpts", () => {
    const result = validateArtifactPayload("flashcards", {
      cards: [
        { front: "What does mitosis create?", back: "Two identical cells.", conceptId: "concept-1", conceptName: "Mitosis" },
        { front: "What does meiosis create?", back: "Four different cells.", conceptId: "concept-2", conceptName: "Meiosis" },
      ],
    }, { concepts, expectedCount: 2, sourceExcerptByConcept: excerpts });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({ cards: [
        expect.objectContaining({ conceptId: "concept-1", sourceExcerpt: excerpts.get("concept-1") }),
        expect.objectContaining({ conceptId: "concept-2", sourceExcerpt: excerpts.get("concept-2") }),
      ] });
    }
  });

  it.each([
    ["wrong count", { cards: [] }],
    ["foreign id", { cards: [{ front: "A question?", back: "Answer", conceptId: "foreign", conceptName: "Mitosis" }, { front: "Another?", back: "Answer", conceptId: "concept-2", conceptName: "Meiosis" }] }],
    ["duplicate concepts", { cards: [{ front: "Question one?", back: "Answer", conceptId: "concept-1", conceptName: "Mitosis" }, { front: "Question two?", back: "Answer", conceptId: "concept-1", conceptName: "Mitosis" }] }],
    ["oversized answer", { cards: [{ front: "Question one?", back: "x".repeat(801), conceptId: "concept-1", conceptName: "Mitosis" }, { front: "Question two?", back: "Answer", conceptId: "concept-2", conceptName: "Meiosis" }] }],
  ])("rejects flashcards with %s", (_label, payload) => {
    expect(validateArtifactPayload("flashcards", payload, { concepts, expectedCount: 2 }).ok).toBe(false);
  });

  it("accepts a four-choice question with an in-range answer index", () => {
    const result = validateArtifactPayload("multiple_choice", {
      questions: [{
        prompt: "What does mitosis produce?",
        choices: ["Two identical cells", "Four different cells", "One gamete", "No cells"],
        answerIndex: 0,
        rationale: "The source says mitosis produces two identical cells.",
        conceptId: "concept-1",
        conceptName: "Mitosis",
      }],
    }, { concepts, expectedCount: 1, sourceExcerptByConcept: excerpts });
    expect(result.ok).toBe(true);
  });

  it.each([
    ["three choices", ["A", "B", "C"], 0],
    ["duplicate choices", ["A", "A", "C", "D"], 0],
    ["negative answer", ["A", "B", "C", "D"], -1],
    ["large answer", ["A", "B", "C", "D"], 4],
    ["fractional answer", ["A", "B", "C", "D"], 1.5],
  ])("rejects multiple choice with %s", (_label, choices, answerIndex) => {
    const result = validateArtifactPayload("multiple_choice", {
      questions: [{
        prompt: "What is tested?",
        choices,
        answerIndex,
        rationale: "Because the source says so.",
        conceptId: "concept-1",
        conceptName: "Mitosis",
      }],
    }, { concepts, expectedCount: 1 });
    expect(result.ok).toBe(false);
  });

  it("builds stable matching IDs for three grounded pairs", () => {
    const valid = validateArtifactPayload("matching", {
      pairs: [
        { left: "Mitosis", right: "Two identical cells", conceptId: "concept-1", conceptName: "Mitosis" },
        { left: "Meiosis", right: "Four different cells", conceptId: "concept-2", conceptName: "Meiosis" },
        { left: "Interphase", right: "Preparation for division", conceptId: "concept-3", conceptName: "Interphase" },
      ],
    }, { concepts, expectedCount: 3, sourceExcerptByConcept: excerpts });
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.payload).toEqual({ pairs: [
      expect.objectContaining({ id: "match-concept-1", conceptId: "concept-1" }),
      expect.objectContaining({ id: "match-concept-2", conceptId: "concept-2" }),
      expect.objectContaining({ id: "match-concept-3", conceptId: "concept-3" }),
    ] });
  });

  it("builds exact matching pairs from durable definitions before AI", () => {
    const exact = buildDeterministicMatchingPairs([
      { id: "concept-1", name: "Mitosis", definition: "Mitosis creates two identical daughter cells." },
      { id: "concept-2", name: "Meiosis", definition: null },
      { id: "concept-3", name: "Interphase", definition: null, examples: [] },
    ], new Map([
      ["concept-2", "Meiosis creates four genetically different cells."],
    ]), 3);

    expect(exact.pairs).toEqual([
      {
        left: "Mitosis",
        right: "Mitosis creates two identical daughter cells.",
        conceptId: "concept-1",
        conceptName: "Mitosis",
      },
      {
        left: "Meiosis",
        right: "Meiosis creates four genetically different cells.",
        conceptId: "concept-2",
        conceptName: "Meiosis",
      },
    ]);
    expect([...exact.handledConceptIds]).toEqual(["concept-1", "concept-2"]);
    expect(exact.handledConceptIds.has("concept-3")).toBe(false);
  });

  it("prefers the exact source excerpt when a stored matching definition conflicts", () => {
    const exact = buildDeterministicMatchingPairs([
      { id: "concept-1", name: "Mitosis", definition: "Conflicting generated paraphrase." },
    ], new Map([["concept-1", "Mitosis creates two genetically identical cells."]]), 1);

    expect(exact.pairs[0]).toMatchObject({
      right: "Mitosis creates two genetically identical cells.",
    });
  });

  it("revalidates a canonical AI remainder after deterministic assembly", () => {
    const partial = validateArtifactPayload("matching", {
      pairs: [
        { left: "Interphase", right: "Preparation for division", conceptId: "concept-3", conceptName: "Interphase" },
      ],
    }, {
      concepts: [concepts[2]],
      expectedCount: 1,
      sourceExcerptByConcept: excerpts,
      allowPartialMatching: true,
    });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;

    const assembled = validateArtifactPayload("matching", {
      pairs: [
        { left: "Mitosis", right: "Two identical cells", conceptId: "concept-1", conceptName: "Mitosis" },
        { left: "Meiosis", right: "Four different cells", conceptId: "concept-2", conceptName: "Meiosis" },
        ...(partial.payload.pairs as unknown[]),
      ],
    }, { concepts, expectedCount: 3, sourceExcerptByConcept: excerpts });

    expect(assembled.ok).toBe(true);
  });

  it("rejects a matching pair whose persisted id is forged", () => {
    const result = validateArtifactPayload("matching", {
      pairs: [
        { id: "match-foreign", left: "Mitosis", right: "Two identical cells", conceptId: "concept-1", conceptName: "Mitosis" },
        { left: "Meiosis", right: "Four different cells", conceptId: "concept-2", conceptName: "Meiosis" },
        { left: "Interphase", right: "Preparation for division", conceptId: "concept-3", conceptName: "Interphase" },
      ],
    }, { concepts, expectedCount: 3 });

    expect(result.ok).toBe(false);
  });

  it("rejects duplicate matching sides", () => {
    const duplicate = validateArtifactPayload("matching", {
      pairs: [
        { left: "Cell division", right: "Two identical cells", conceptId: "concept-1", conceptName: "Mitosis" },
        { left: "cell division", right: "Four different cells", conceptId: "concept-2", conceptName: "Meiosis" },
        { left: "Interphase", right: "Preparation for division", conceptId: "concept-3", conceptName: "Interphase" },
      ],
    }, { concepts, expectedCount: 3 });
    expect(duplicate.ok).toBe(false);
  });

  it("rejects matching sets outside the 3-6 pair game contract", () => {
    const twoPairs = { pairs: [
      { left: "Mitosis", right: "Two identical cells", conceptId: "concept-1", conceptName: "Mitosis" },
      { left: "Meiosis", right: "Four different cells", conceptId: "concept-2", conceptName: "Meiosis" },
    ] };
    expect(validateArtifactPayload("matching", twoPairs, { concepts, expectedCount: 2 }).ok).toBe(false);
    expect(validateArtifactPayload("matching", { pairs: [] }, { concepts, expectedCount: 7 }).ok).toBe(false);
  });

  it("keeps an exact mnemonic target separate from its AI-created trick", () => {
    const targets = new Map([["concept-1", "Mitosis produces two genetically identical cells."]]);
    const result = validateArtifactPayload("mnemonic", {
      items: [{
        target: targets.get("concept-1"),
        mnemonic: "MITO-sis makes two matching twins.",
        technique: "association",
        explanation: "The repeated T sound cues two matching cells.",
        conceptId: "concept-1",
        conceptName: "Mitosis",
      }],
    }, {
      concepts,
      expectedCount: 1,
      exactTargetByConcept: targets,
      sourceExcerptByConcept: excerpts,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual({ items: [expect.objectContaining({
      id: "mnemonic-concept-1",
      target: targets.get("concept-1"),
      origin: "ai_created",
      technique: "association",
    })] });
  });

  it.each([
    ["changed target", "Mitosis produces four cells.", "association"],
    ["invalid technique", "Mitosis produces two genetically identical cells.", "guessing"],
  ])("rejects a mnemonic with %s", (_label, target, technique) => {
    const result = validateArtifactPayload("mnemonic", {
      items: [{
        target,
        mnemonic: "Two matching twins.",
        technique,
        explanation: "This cues matching cells.",
        conceptId: "concept-1",
        conceptName: "Mitosis",
      }],
    }, {
      concepts,
      expectedCount: 1,
      exactTargetByConcept: new Map([["concept-1", "Mitosis produces two genetically identical cells."]]),
    });
    expect(result.ok).toBe(false);
  });

  it("aggregates only real, enum-safe student feedback", () => {
    expect(aggregateMnemonicTechniqueFeedback([
      { technique: "story", helpful: true },
      { technique: "story", helpful: true },
      { technique: "acronym", helpful: false },
      { technique: "made-up", helpful: true },
      { technique: "rhyme", helpful: null },
    ])).toEqual({
      hasFeedback: true,
      preferred: ["story"],
      avoid: ["acronym"],
    });
    expect(aggregateMnemonicTechniqueFeedback([]).hasFeedback).toBe(false);
  });
});
