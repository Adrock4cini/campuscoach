import { describe, expect, it } from "vitest";
import {
  aggregateMnemonicTechniqueFeedback,
  buildDeterministicFlashcards,
  buildDeterministicMatchingPairs,
  buildDeterministicMultipleChoice,
  validateArtifactPayload,
} from "./artifact-validation";
import { buildAssignmentTutorPractice, type AssignmentTutorPractice } from "./assignment-tutor";

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

const practiceConcepts = [{ id: "percent-1", name: "Percent of a number" }];
const practiceExcerpts = new Map([["percent-1", "Solve 14% of 50."]]);
type MutablePractice = Omit<AssignmentTutorPractice, "routeKind"> & { routeKind: string };
const builtPractice = buildAssignmentTutorPractice({
  conceptId: practiceConcepts[0].id,
  conceptName: practiceConcepts[0].name,
  sourceExcerpt: practiceExcerpts.get("percent-1")!,
});
if (!builtPractice.supported) throw new Error("Expected canonical practice fixture");
const validPracticePayload: { problems: MutablePractice[] } = {
  problems: [builtPractice.problem],
};

function practicePayload() {
  return structuredClone(validPracticePayload);
}

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

  it("accepts one deterministic practice problem and preserves its canonical linkage", () => {
    const result = validateArtifactPayload("practice", practicePayload(), {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(validPracticePayload);
    }
  });

  it.each([
    ["half-cent currency percent", "What is 1% of $14.50?"],
    ["long decimal result", "What is 12.5% of 10.99?"],
    ["half-cent discount", "$14.50 item 1% off"],
  ])("validates the canonical decimal-safe builder for %s", (_label, sourceExcerpt) => {
    const concept = { id: "decimal-safe", name: "Decimal-safe percent" };
    const built = buildAssignmentTutorPractice({
      conceptId: concept.id,
      conceptName: concept.name,
      sourceExcerpt,
    });
    expect(built.supported).toBe(true);
    if (!built.supported) return;

    expect(validateArtifactPayload("practice", { problems: [built.problem] }, {
      concepts: [concept],
      expectedCount: 1,
      sourceExcerptByConcept: new Map([[concept.id, sourceExcerpt]]),
    }).ok).toBe(true);
  });

  it("requires exactly one practice problem", () => {
    const payload = practicePayload();
    payload.problems.push(structuredClone(payload.problems[0]));
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
    expect(validateArtifactPayload("practice", practicePayload(), {
      concepts: practiceConcepts,
      expectedCount: 2,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it.each([
    ["forged id", (payload: typeof validPracticePayload) => { payload.problems[0].id = "practice-foreign"; }],
    ["foreign concept", (payload: typeof validPracticePayload) => { payload.problems[0].conceptId = "foreign"; }],
    ["forged concept name", (payload: typeof validPracticePayload) => { payload.problems[0].conceptName = "Discounts"; }],
    ["forged excerpt", (payload: typeof validPracticePayload) => { payload.problems[0].sourceExcerpt = "Solve 99% of 99."; }],
    ["wrong route", (payload: typeof validPracticePayload) => { payload.problems[0].routeKind = "memorize-terms"; }],
  ])("rejects practice with %s", (_label, mutate) => {
    const payload = practicePayload();
    mutate(payload);
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it("rejects unknown fields at every practice contract boundary", () => {
    const top = practicePayload() as typeof validPracticePayload & { debug?: boolean };
    top.debug = true;
    const item = practicePayload();
    (item.problems[0] as typeof item.problems[0] & { solution?: string }).solution = "7";
    const graded = practicePayload();
    (graded.problems[0].original as typeof graded.problems[0]["original"] & { answer?: string }).answer = "7";
    const walkthrough = practicePayload();
    (walkthrough.problems[0].walkthrough as typeof walkthrough.problems[0]["walkthrough"] & { note?: string }).note = "extra";

    for (const payload of [top, item, graded, walkthrough]) {
      expect(validateArtifactPayload("practice", payload, {
        concepts: practiceConcepts,
        expectedCount: 1,
        sourceExcerptByConcept: practiceExcerpts,
      }).ok).toBe(false);
    }
  });

  it("rejects oversized practice text and walkthrough arrays", () => {
    const longHint = practicePayload();
    longHint.problems[0].hint = "x".repeat(501);
    const tooManySteps = practicePayload();
    tooManySteps.problems[0].walkthrough.steps = Array.from({ length: 9 }, (_, index) => `Step ${index + 1}`);

    for (const payload of [longHint, tooManySteps]) {
      expect(validateArtifactPayload("practice", payload, {
        concepts: practiceConcepts,
        expectedCount: 1,
        sourceExcerptByConcept: practiceExcerpts,
      }).ok).toBe(false);
    }
  });

  it.each([
    ["duplicate original choices", (payload: typeof validPracticePayload) => {
      payload.problems[0].original.choices[1] = payload.problems[0].original.choices[0];
    }],
    ["duplicate transfer choices", (payload: typeof validPracticePayload) => {
      payload.problems[0].transfer.choices[1] = payload.problems[0].transfer.choices[0];
    }],
    ["fractional original answer index", (payload: typeof validPracticePayload) => {
      payload.problems[0].original.answerIndex = 1.5;
    }],
    ["out-of-range transfer answer index", (payload: typeof validPracticePayload) => {
      payload.problems[0].transfer.answerIndex = 4;
    }],
    ["arithmetically wrong original answer index", (payload: typeof validPracticePayload) => {
      payload.problems[0].original.answerIndex = (payload.problems[0].original.answerIndex + 1) % 4;
    }],
    ["arithmetically wrong transfer answer index", (payload: typeof validPracticePayload) => {
      payload.problems[0].transfer.answerIndex = (payload.problems[0].transfer.answerIndex + 1) % 4;
    }],
  ])("rejects practice with %s", (_label, mutate) => {
    const payload = practicePayload();
    mutate(payload);
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it("rejects a hint that reveals the original answer", () => {
    const payload = practicePayload();
    const answer = payload.problems[0].original.choices[payload.problems[0].original.answerIndex];
    payload.problems[0].hint = `Multiply carefully; the answer is ${answer}.`;
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it("rejects an equivalent formatted answer leaked in a hint", () => {
    const payload = practicePayload();
    payload.problems[0].hint = "The result is 7.00 before you continue.";
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it("rejects unsupported prompts instead of skipping arithmetic checks", () => {
    const payload = practicePayload();
    payload.problems[0].transfer.prompt = "Choose the best answer about percentages.";
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it("requires changed numeric values even when prompts are reworded", () => {
    const payload = practicePayload();
    payload.problems[0].transfer.prompt = "Calculate 14 percent of 50.";
    payload.problems[0].transfer.choices = [...payload.problems[0].original.choices];
    payload.problems[0].transfer.answerIndex = payload.problems[0].original.answerIndex;
    expect(validateArtifactPayload("practice", payload, {
      concepts: practiceConcepts,
      expectedCount: 1,
      sourceExcerptByConcept: practiceExcerpts,
    }).ok).toBe(false);
  });

  it.each(["original", "walkthrough"] as const)(
    "rejects a transfer prompt duplicated from the %s prompt",
    (duplicateFrom) => {
      const payload = practicePayload();
      payload.problems[0].transfer.prompt = duplicateFrom === "original"
        ? payload.problems[0].original.prompt.toUpperCase().replace("?", "")
        : payload.problems[0].walkthrough.prompt;
      expect(validateArtifactPayload("practice", payload, {
        concepts: practiceConcepts,
        expectedCount: 1,
        sourceExcerptByConcept: practiceExcerpts,
      }).ok).toBe(false);
    },
  );

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
