import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import "../../../supabase/functions/_shared/assignment-review-source.test";

const generator = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/generate-artifact/index.ts",
), "utf8");
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827125000_assignment_review_artifact_guard.sql",
), "utf8");

describe("confirmed assignment weakness recurrence boundary", () => {
  it("loads confirmed review metadata separately and never selects assignment raw OCR", () => {
    const queryStart = generator.indexOf("const { data: assignmentSources");
    const queryEnd = generator.indexOf("if (assignmentSourceError)", queryStart);
    expect(queryStart).toBeGreaterThan(-1);
    const assignmentQuery = generator.slice(queryStart, queryEnd);

    expect(assignmentQuery).toContain("practice_source_text");
    expect(assignmentQuery).toContain("practice_source_version");
    expect(assignmentQuery).toContain("practice_source_hash");
    expect(assignmentQuery).not.toContain("raw_text");
    expect(generator).toContain("buildAssignmentReviewSource(concept, capture)");
  });

  it("admits at most one generic assignment source and sanitizes the request-local concept", () => {
    expect(generator).toContain("At most one assignment-only weakness may enter a normal study set");
    expect(generator).toContain("return { sourceByConcept, assignmentReview: review }");
    expect(generator).toContain("concept: assignmentReview.concept");
    expect(generator).toContain("generatedConceptIds.includes(assignmentReview.boundary.practiceConceptId)");
  });

  it("persists a generated assignment review only through the locked RPC", () => {
    const guardedBranch = generator.indexOf("} else if (generatedAssignmentReview) {");
    const directInsert = generator.indexOf('.from("learning_artifacts")\n      .insert(insertRow)', guardedBranch);
    expect(guardedBranch).toBeGreaterThan(-1);
    expect(generator.slice(guardedBranch, directInsert)).toContain(
      '"insert_confirmed_assignment_review_artifact"',
    );
    expect(generator).toContain("assignmentReviewSource: generatedAssignmentReview.boundary");
    expect(generator).toContain("await assignmentReviewBoundaryIsCurrent(");
  });

  it("locks and validates the exact confirmation boundary before inserting", () => {
    expect(migration).toContain("insert_confirmed_assignment_review_artifact");
    expect(migration).toContain("for share;");
    expect(migration).toContain("v_capture.practice_source_version is distinct from p_source_version");
    expect(migration).toContain("v_capture.practice_source_hash is distinct from p_source_hash");
    expect(migration).toContain("v_capture.practice_concept_id is distinct from p_concept_id");
    expect(migration).toContain("from public.concept_capture_evidence evidence");
    expect(migration).toContain("v_concept.retired_at is not null");
    expect(migration).toContain("p_artifact ->> 'model' is distinct from 'deterministic-grounded'");
  });

  it("keeps the RPC server-only and the artifact in its class/recent/exam scope", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("p_artifact ->> 'capture_id' is not null");
    expect(migration).toContain("not in ('flashcards', 'multiple_choice', 'matching')");
    expect(migration).toContain("not in ('recent', 'exam', 'class')");
  });
});
