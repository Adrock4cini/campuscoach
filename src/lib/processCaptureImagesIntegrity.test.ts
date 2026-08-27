import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/process-capture-images/index.ts",
), "utf8");

describe("photo capture worker integrity", () => {
  it("fences every derived-write stage with the owned claim and source version", () => {
    const ownedUpdateStart = source.indexOf("const updateOwnedClaim = async");
    const ownedUpdateEnd = source.indexOf("const renewClaim = async", ownedUpdateStart);
    const ownedUpdate = source.slice(ownedUpdateStart, ownedUpdateEnd);

    expect(ownedUpdateStart).toBeGreaterThan(-1);
    expect(ownedUpdate).toContain('.eq("concept_extraction_claim_id", claimId)');
    expect(ownedUpdate).toContain('.eq("practice_source_version", expectedPracticeSourceVersion)');
    expect(ownedUpdate).toContain("select(claimSelect).maybeSingle()");

    const conceptInsert = source.indexOf('.from("concepts")\n      .upsert(conceptRows, {');
    const conceptLease = source.lastIndexOf("const conceptLease = await renewClaim()", conceptInsert);
    const masteryWrite = source.indexOf('.from("user_concept_mastery")\n    .upsert(masterySeeds');
    const masteryLease = source.lastIndexOf("const masteryLease = await renewClaim()", masteryWrite);
    const evidenceWrite = source.indexOf('.from("concept_capture_evidence")\n    .upsert(resolvedConceptIds');
    const evidenceLease = source.lastIndexOf("const evidenceLease = await renewClaim()", evidenceWrite);

    expect(conceptInsert).toBeGreaterThan(conceptLease);
    expect(conceptLease).toBeGreaterThan(-1);
    expect(masteryWrite).toBeGreaterThan(masteryLease);
    expect(masteryLease).toBeGreaterThan(-1);
    expect(evidenceWrite).toBeGreaterThan(evidenceLease);
    expect(evidenceLease).toBeGreaterThan(-1);
    expect(source).toContain("if (!conceptLease.active) return changedWhileProcessing()");
    expect(source).toContain("if (!masteryLease.active) return changedWhileProcessing()");
    expect(source).toContain("if (!evidenceLease.active) return changedWhileProcessing()");
    expect(source).toContain("class_id: ownedClass.id");
    expect(source).toContain("client_class_id: ownedClass.client_class_id");
    expect(source).toContain("row.class_id === ownedClass.id");
  });

  it("does not overwrite OCR evidence when no readable academic source is returned", () => {
    const unreadableStart = source.indexOf('if (!sourceText || (capture.kind === "scan-material" && !concepts.length))');
    const unreadableEnd = source.indexOf('if (capture.kind === "scan-assignment")', unreadableStart);
    const unreadableBranch = source.slice(unreadableStart, unreadableEnd);

    expect(unreadableStart).toBeGreaterThan(-1);
    expect(unreadableBranch).toContain("await failClaim()");
    expect(unreadableBranch).not.toContain("raw_text:");
    expect(unreadableBranch).not.toContain('.from("captures")');
  });

  it("stores assignment OCR only as a review candidate before confirmation", () => {
    const assignmentStart = source.indexOf(
      'if (capture.kind === "scan-assignment") {\n    // OCR is evidence',
    );
    const materialStart = source.indexOf("const { data: sourceCapture", assignmentStart);
    const assignmentBranch = source.slice(assignmentStart, materialStart);

    expect(assignmentStart).toBeGreaterThan(-1);
    expect(assignmentBranch).toContain('practice_source_status: "needs_review"');
    expect(assignmentBranch).toContain("practice_source_text: tutorCandidate");
    expect(assignmentBranch).toContain("practice_source_version: nextPracticeSourceVersion");
    expect(assignmentBranch).toContain("concepts: []");
    expect(assignmentBranch).not.toContain('.from("concepts")');
    expect(assignmentBranch).not.toContain('.from("user_concept_mastery")');
    expect(assignmentBranch).not.toContain('.from("concept_capture_evidence")');
    expect(assignmentBranch).not.toContain('.from("processed_content")');
  });

  it("preserves the concept, mastery, evidence, and processed-source pipeline for study material", () => {
    expect(source).toContain('if (capture.kind !== "scan-material") return null;');
    expect(source).toContain('.from("concepts")\n      .upsert(conceptRows, {');
    expect(source).toContain('onConflict: "user_id,class_id,identity_key"');
    expect(source).toContain("ignoreDuplicates: true");
    expect(source).toContain('.in("identity_key", canonicalIdentityKeys)');
    expect(source).toContain('.from("user_concept_mastery")\n    .upsert(masterySeeds');
    expect(source).toContain('.from("concept_capture_evidence")\n    .upsert(resolvedConceptIds');
    expect(source).toContain('userClient.from("processed_content").insert({');
  });
});
