import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_REVIEW_RECIPE_VERSION,
  buildAssignmentReviewSource,
  type AssignmentReviewCapture,
} from "./assignment-review-source";
import { rankStudyConcepts } from "./study-selection";
import {
  buildDeterministicFlashcards,
  buildDeterministicMultipleChoice,
} from "./artifact-validation";

const concept = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Percent of a Number",
  definition: "OCR-derived wording that must not escape",
  examples: ["What is 19% of 50?"],
  class_id: "22222222-2222-4222-8222-222222222222",
  client_class_id: "math",
  created_at: "2026-08-27T12:00:00.000Z",
};

const confirmed: AssignmentReviewCapture = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "scan-assignment",
  class_id: concept.class_id,
  client_class_id: concept.client_class_id,
  processing_status: "ready",
  concept_extraction_claim_id: null,
  practice_source_status: "confirmed",
  practice_source_text: "What is 14% of 50?",
  practice_source_version: 2,
  practice_source_hash: "a".repeat(64),
  practice_concept_id: concept.id,
};

describe("assignment review source", () => {
  it("reduces a confirmed problem to a generic rule and removes every exact example", () => {
    const result = buildAssignmentReviewSource(concept, confirmed);

    expect(result).toMatchObject({
      sourceExcerpt: "Convert the percent to a decimal, then multiply it by the whole amount.",
      concept: {
        name: "Percent of a Number",
        examples: [],
      },
      boundary: {
        captureId: confirmed.id,
        practiceConceptId: concept.id,
        sourceVersion: 2,
        sourceHash: "a".repeat(64),
        recipeVersion: ASSIGNMENT_REVIEW_RECIPE_VERSION,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("14%");
    expect(serialized).not.toContain("19%");
    expect(serialized).not.toContain("50");
    expect(serialized).not.toContain("OCR-derived");
  });

  it("keeps normal deterministic study artifacts free of the homework problem", () => {
    const review = buildAssignmentReviewSource(concept, confirmed);
    if (!review) throw new Error("expected review source");
    const sources = new Map([[review.concept.id, review.sourceExcerpt]]);
    const artifacts = {
      cards: buildDeterministicFlashcards([review.concept], sources, 1),
      questions: buildDeterministicMultipleChoice([review.concept], sources, 1),
    };

    expect(artifacts.cards).toHaveLength(1);
    expect(artifacts.questions).toHaveLength(1);
    const serialized = JSON.stringify(artifacts);
    expect(serialized).toContain("Convert the percent to a decimal");
    expect(serialized).not.toContain("14%");
    expect(serialized).not.toContain("19%");
    expect(serialized).not.toContain("50");
    expect(serialized).not.toContain("OCR-derived");
  });

  it("uses the separate generic discount recipe", () => {
    const result = buildAssignmentReviewSource({
      ...concept,
      name: "Percent Discount",
    }, {
      ...confirmed,
      practice_source_text: "A $80 jacket is 25% off. What is the sale price?",
    });

    expect(result?.sourceExcerpt).toBe(
      "Find the discount amount, then subtract it from the original price.",
    );
    expect(JSON.stringify(result)).not.toContain("$80");
    expect(JSON.stringify(result)).not.toContain("25%");
  });

  it.each([
    { practice_source_status: "needs_review" },
    { processing_status: "processing" },
    { concept_extraction_claim_id: "44444444-4444-4444-8444-444444444444" },
    { practice_concept_id: "55555555-5555-4555-8555-555555555555" },
    { practice_source_hash: null },
    { practice_source_version: 0 },
    { client_class_id: "science" },
  ])("fails closed for an incomplete or mismatched boundary %#", (change) => {
    expect(buildAssignmentReviewSource(concept, { ...confirmed, ...change })).toBeNull();
  });

  it("fails closed for a problem family Tutor v1 cannot verify", () => {
    expect(buildAssignmentReviewSource(concept, {
      ...confirmed,
      practice_source_text: "Solve x + 3 = 10.",
    })).toBeNull();
  });

  it("lets the existing mastery ranking bring the generic weakness back", () => {
    const review = buildAssignmentReviewSource(concept, confirmed);
    if (!review) throw new Error("expected review source");
    const ranked = rankStudyConcepts([
      review.concept,
      {
        ...concept,
        id: "66666666-6666-4666-8666-666666666666",
        name: "Already strong",
        definition: "A separately grounded concept.",
        examples: [],
      },
    ], [
      {
        concept_id: concept.id,
        strength: 0.25,
        attempts: 2,
        correct: 0,
        next_review_at: "2026-08-26T00:00:00.000Z",
      },
      {
        concept_id: "66666666-6666-4666-8666-666666666666",
        strength: 0.95,
        attempts: 5,
        correct: 5,
        next_review_at: "2026-09-10T00:00:00.000Z",
      },
    ], {
      scopeType: "recent",
      now: "2026-08-27T12:00:00.000Z",
      limit: 2,
    });

    expect(ranked[0].concept.id).toBe(concept.id);
    expect(ranked[0].evidence.map((item) => item.signal)).toEqual(
      expect.arrayContaining(["review_due", "low_mastery"]),
    );
  });

  it("does not bypass the existing exam relevance gate", () => {
    const review = buildAssignmentReviewSource(concept, confirmed);
    if (!review) throw new Error("expected review source");
    const outsideExamWindow = {
      ...review.concept,
      created_at: "2026-08-10T12:00:00.000Z",
    };
    const mastery = [{
      concept_id: concept.id,
      strength: 0.2,
      attempts: 2,
      correct: 0,
      next_review_at: "2026-08-26T00:00:00.000Z",
    }];
    const common = {
      scopeType: "exam" as const,
      now: "2026-08-27T12:00:00.000Z",
      limit: 2,
      examDate: "2026-09-15",
      previousExamDate: "2026-08-20",
    };

    expect(rankStudyConcepts([outsideExamWindow], mastery, {
      ...common,
      topics: ["cell biology"],
    })).toEqual([]);
    expect(rankStudyConcepts([outsideExamWindow], mastery, {
      ...common,
      topics: ["percent"],
    })[0].concept.id).toBe(concept.id);
  });
});
