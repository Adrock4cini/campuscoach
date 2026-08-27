import { extractAssignmentTutorSource } from "./assignment-tutor.ts";

/**
 * A later Study Lab set may revisit the skill exposed by an assignment, but it
 * must never replay the assignment OCR or the student's exact confirmed
 * problem. Tutor owns that exact-problem boundary. This helper reduces the
 * confirmed source to one of the two original, deterministic Tutor v1 rules
 * and returns no assignment text.
 */

export const ASSIGNMENT_REVIEW_RECIPE_VERSION = "assignment-review-v1";

export interface AssignmentReviewConcept {
  id: string;
  name: string;
  definition: string | null;
  examples: string[] | null;
  class_id: string | null;
  client_class_id: string | null;
}

export interface AssignmentReviewCapture {
  id: string;
  kind: string | null;
  class_id: string | null;
  client_class_id: string | null;
  processing_status: string | null;
  concept_extraction_claim_id: string | null;
  practice_source_status: string | null;
  practice_source_text: string | null;
  practice_source_version: number | null;
  practice_source_hash: string | null;
  practice_concept_id: string | null;
}

export interface AssignmentReviewBoundary {
  captureId: string;
  practiceConceptId: string;
  sourceVersion: number;
  sourceHash: string;
  recipeVersion: typeof ASSIGNMENT_REVIEW_RECIPE_VERSION;
}

export interface AssignmentReviewSource<T extends AssignmentReviewConcept> {
  /** Request-local concept view. Exact assignment examples are removed. */
  concept: T;
  /** Generic original teaching copy; never the photographed problem. */
  sourceExcerpt: string;
  boundary: AssignmentReviewBoundary;
}

const SAFE_RECIPES = {
  "Percent of a Number": "Convert the percent to a decimal, then multiply it by the whole amount.",
  "Percent Discount": "Find the discount amount, then subtract it from the original price.",
} as const;

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Returns a safe, generic review source only for a complete current
 * confirmation pinned to this exact concept and class. The confirmed text is
 * parsed only to choose an allowlisted recipe, then discarded.
 */
export function buildAssignmentReviewSource<T extends AssignmentReviewConcept>(
  concept: T,
  capture: AssignmentReviewCapture,
): AssignmentReviewSource<T> | null {
  if (
    capture.kind !== "scan-assignment"
    || capture.processing_status !== "ready"
    || capture.concept_extraction_claim_id !== null
    || capture.practice_source_status !== "confirmed"
    || capture.practice_concept_id !== concept.id
    || capture.class_id !== concept.class_id
    || capture.client_class_id !== concept.client_class_id
    || typeof capture.practice_source_text !== "string"
    || capture.practice_source_text !== capture.practice_source_text.trim()
    || !capture.practice_source_text
    || capture.practice_source_text.length > 360
    || !Number.isInteger(capture.practice_source_version)
    || (capture.practice_source_version ?? 0) < 1
    || !isSha256(capture.practice_source_hash)
  ) return null;

  const extracted = extractAssignmentTutorSource(capture.practice_source_text);
  const extractedConcept = extracted?.concepts[0];
  if (!extractedConcept || extracted.concepts.length !== 1) return null;

  const safeDefinition = SAFE_RECIPES[
    extractedConcept.name as keyof typeof SAFE_RECIPES
  ];
  if (!safeDefinition || extractedConcept.definition !== safeDefinition) return null;

  return {
    concept: {
      ...concept,
      name: extractedConcept.name,
      definition: safeDefinition,
      // Defense in depth for legacy rows that may still carry an old exact
      // assignment example. Never expose examples to normal artifact builders.
      examples: [],
    },
    sourceExcerpt: safeDefinition,
    boundary: {
      captureId: capture.id,
      practiceConceptId: concept.id,
      sourceVersion: capture.practice_source_version as number,
      sourceHash: capture.practice_source_hash,
      recipeVersion: ASSIGNMENT_REVIEW_RECIPE_VERSION,
    },
  };
}
