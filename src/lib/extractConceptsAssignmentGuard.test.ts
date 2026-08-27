import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/extract-concepts/index.ts",
), "utf8");

describe("extract-concepts assignment boundary", () => {
  it("loads the durable kind and routes assignment text to capture-only review state", () => {
    const captureLookup = source.indexOf('.select("id, kind, class_id, client_class_id, assignment_id, exam_id, raw_text');
    const assignmentGuard = source.indexOf('if (capture?.kind === "scan-assignment"');
    const assignmentEnd = source.indexOf(
      "\n  if (capture?.concept_extraction_claim_id",
      assignmentGuard,
    );
    const assignmentBranch = source.slice(assignmentGuard, assignmentEnd);
    const recoveryLookup = source.indexOf('.from("concept_capture_evidence")', assignmentGuard);
    const conceptInsert = source.indexOf('.from("concepts")\n      .upsert(conceptRows, {', assignmentGuard);

    expect(captureLookup).toBeGreaterThan(-1);
    expect(assignmentGuard).toBeGreaterThan(captureLookup);
    expect(assignmentEnd).toBeGreaterThan(assignmentGuard);
    expect(assignmentBranch).toContain('practice_source_status: "needs_review"');
    expect(assignmentBranch).toContain("practice_source_text: reviewCandidate");
    expect(assignmentBranch).toContain("concepts: []");
    expect(assignmentBranch).not.toContain('.from("concepts")');
    expect(assignmentBranch).not.toContain('.from("user_concept_mastery")');
    expect(assignmentBranch).not.toContain('.from("concept_capture_evidence")');
    expect(assignmentBranch).not.toContain("fetch(");
    expect(recoveryLookup).toBeGreaterThan(assignmentEnd);
    expect(conceptInsert).toBeGreaterThan(assignmentEnd);
  });

  it("CAS-fences the review candidate and rejects an unsaved assignment payload", () => {
    const assignmentGuard = source.indexOf('if (capture?.kind === "scan-assignment"');
    const assignmentEnd = source.indexOf(
      "\n  if (capture?.concept_extraction_claim_id",
      assignmentGuard,
    );
    const assignmentBranch = source.slice(assignmentGuard, assignmentEnd);

    expect(source).toContain('if (!capture && body.kind === "scan-assignment")');
    expect(source).toContain("assignment_confirmation_required");
    expect(assignmentBranch).toContain('.eq("practice_source_version", expectedPracticeSourceVersion)');
    expect(assignmentBranch).toContain('.eq("concept_extraction_claim_id", claimId)');
    expect(assignmentBranch).toContain("select(claimFields)");
    expect(assignmentBranch).toContain("nextPracticeSourceVersion");
    expect(assignmentBranch).toContain("MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS");
  });
});
