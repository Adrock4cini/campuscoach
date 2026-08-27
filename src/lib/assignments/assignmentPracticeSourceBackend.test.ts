import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827110000_assignment_practice_source_confirmation.sql",
), "utf8");
const confirmation = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/confirm-assignment-practice-source/index.ts",
), "utf8");
const processor = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/process-capture-images/index.ts",
), "utf8");
const generator = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/generate-artifact/index.ts",
), "utf8");
const recorder = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/record-study-result/index.ts",
), "utf8");
const masteryGuard = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827120000_assignment_tutor_mastery_guard.sql",
), "utf8");
const grounding = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/_shared/grounded-excerpt.ts",
), "utf8");

describe("assignment practice source backend", () => {
  it("keeps OCR untrusted and requires a server-confirmed source shape", () => {
    expect(migration).toContain("practice_source_status text not null default 'not_required'");
    expect(migration).toContain("when 'confirmed' then");
    expect(migration).toContain("and practice_concept_id is not null");
    expect(migration).toContain("Existing assignment photos must be");
    expect(processor).toContain('practice_source_status: "needs_review"');
    expect(processor).not.toContain('practice_source_status = "confirmed"');
    expect(grounding).toContain('capture.practice_source_status !== "confirmed"');
    expect(generator).toContain("practice_source_confirmation_required");
  });

  it("routes explicit assignment captures only to confirmed Tutor practice", () => {
    const boundaryCheck = generator.indexOf(
      "await verifyCaptureGroundingBoundary(supabase, userId, body.captureId, body.kind)",
    );
    const quotaCheck = generator.indexOf("await consumeGenerationRequestQuota(userId)");
    const unsupportedKindCheck = generator.indexOf("is reserved but no template implemented yet");
    expect(boundaryCheck).toBeGreaterThan(-1);
    expect(boundaryCheck).toBeLessThan(quotaCheck);
    expect(boundaryCheck).toBeLessThan(unsupportedKindCheck);
    expect(generator).toContain(
      "evidenceConceptIds = [assignmentPracticeBoundary.practiceConceptId]",
    );
    expect(generator).toContain(
      "confirmedAssignmentBoundary: assignmentPracticeBoundary",
    );
    expect(generator).toContain('reason: "assignment_tutor_required"');
    expect(generator).toContain('fallback: { kind: "practice", label: "Open Assignment Tutor" }');
    expect(generator).toContain("sourceExcerpt: confirmedBoundary.sourceText");
    expect(grounding).toContain('if (capture.kind !== "scan-assignment")');
    expect(grounding).toContain('return { kind: "assignment-confirmation-required" }');
  });

  it("excludes assignment-only evidence inside mixed class and recent sets", () => {
    expect(generator).toContain(
      '.select("concept_id, capture_id, created_at")',
    );
    expect(generator).toContain('.select("id, kind")');
    expect(generator).toContain('capture.kind !== "scan-assignment"');
    expect(generator).toContain('.in("id", ordinaryCaptureIds)');
    expect(generator).toContain(
      "buildCapturePolicyGroundedExcerptMap(concepts, captureSources, {",
    );
    expect(generator).toContain("captureIdsByConcept,");
    expect(grounding).toContain('if (capture.kind === "scan-assignment") continue');
  });

  it("inserts Tutor practice under the same source lock used by confirmation", () => {
    expect(migration).toContain("insert_confirmed_assignment_practice_artifact");
    expect(migration).toContain("for share");
    expect(generator).toContain('artifactWriter.rpc(\n      "insert_confirmed_assignment_practice_artifact"');
    expect(generator).toContain("p_source_version: assignmentPracticeBoundary.sourceVersion");
    expect(generator).toContain("p_source_hash: assignmentPracticeBoundary.sourceHash");
    expect(generator).toContain("p_concept_id: assignmentPracticeBoundary.practiceConceptId");
    expect(generator).toContain('rpcResult.disposition === "boundary-conflict"');
  });

  it("attributes every Tutor result to the deterministic worked-example contract", () => {
    expect(generator).toContain('const ASSIGNMENT_PRACTICE_STRATEGY_ID = "worked-example"');
    expect(generator).toContain('const taskKind = body.kind === "practice"\n    ? "solve-problems"');
    expect(generator).toContain('const learnedEvidence = body.kind === "practice"\n    ? []');
    expect(generator).toContain('const strategyChoice = body.kind === "practice"\n    ? null');
    expect(generator).toContain('cost: "deterministic" as const');
    expect(generator).toContain("deterministic: true");
    expect(generator).toContain('technique: "worked_example"');
    expect(generator).toContain("learnedFromOutcomes: false");
    expect(generator).toContain("id: strategyMetadata.id");
    expect(generator).toContain("taskKind,");

    // Ordinary Study Lab artifacts retain explicit requests and learned
    // evidence rather than inheriting Tutor's forced strategy.
    expect(generator).toContain("evidence: learnedEvidence");
    expect(generator).toContain("requestedStrategyId: body.strategyId ?? undefined");
    expect(generator).toContain("requestedModality: body.modality ?? undefined");
  });

  it("confirms source, canonical concept, evidence and artifact invalidation in one transaction", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("p_concept_identity_key text");
    expect(migration).toContain("insert into public.user_concept_mastery");
    expect(migration).toContain("insert into public.concept_capture_evidence");
    expect(migration).toContain("practice_concept_id = v_practice_concept_id");
    expect(migration).toContain("update public.learning_artifacts");
    expect(confirmation).toContain("p_concept_identity_key: identityKey");
    expect(confirmation).not.toContain("p_practice_concept_id");
    expect(confirmation.indexOf('rpc("confirm_assignment_practice_source"'))
      .toBeLessThan(confirmation.lastIndexOf("practiceConceptId: result.conceptId"));
  });

  it("keeps exact homework text out of stable concept teaching fields", () => {
    expect(migration).toContain("v_has_trusted_evidence boolean");
    expect(migration).toContain("source_capture.kind <> 'scan-assignment'");
    expect(migration).toContain("examples = case when v_has_trusted_evidence then examples else array[]::text[] end");
    expect(migration).not.toContain("examples = array[p_concept_example]");
  });

  it("supports a version-checked correction after initial confirmation", () => {
    expect(migration).toContain("practice_source_status not in ('needs_review', 'confirmed')");
    expect(migration).toContain("practice_source_version <> p_expected_version");
    expect(migration).toContain("v_next_version := v_capture.practice_source_version + 1");
    expect(migration).toContain("artifact.capture_id = p_capture_id");
    expect(migration).toContain("artifact.study_scope_snapshot -> 'assignmentReviewSource'");
    expect(migration).toContain("previous_concept.retired_at is not null");
    expect(migration).toContain("and artifact.stale = false");
  });

  it("validates source and applies the frozen first response in one database transaction", () => {
    expect(masteryGuard).toContain("for share");
    expect(masteryGuard).toContain("v_capture.practice_source_version is distinct from v_source_version");
    expect(masteryGuard).toContain("v_artifact.payload -> 'problems' -> 0 ->> 'sourceExcerpt'");
    expect(masteryGuard).toContain("v_apply_result := public.apply_study_concept_result_v2");
    expect(recorder).toContain('reservation.disposition === "boundary-conflict"');
    expect(recorder).toContain('.from("study_result_concept_updates")');
  });

  it("binds generation and grading to the exact confirmed version, hash and concept", () => {
    expect(generator).toContain("captureId: assignmentPracticeBoundary.captureId");
    expect(generator).toContain("practiceSourceVersion: assignmentPracticeBoundary.sourceVersion");
    expect(generator).toContain("practiceSourceHash: assignmentPracticeBoundary.sourceHash");
    expect(generator).toContain("practiceConceptId: assignmentPracticeBoundary.practiceConceptId");
    expect(generator).toContain("The confirmed assignment problem changed while this study set was opening");
    expect(recorder).toContain("capture.practice_source_version !== snapshot.practiceSourceVersion");
    expect(recorder).toContain("capture.practice_source_hash !== snapshot.practiceSourceHash");
    expect(recorder).toContain("conceptId !== capture.practice_concept_id");
    expect(recorder).toContain('sourceExcerpt !== capture.practice_source_text');
  });

  it("does not let recovery steal a live extraction claim", () => {
    expect(processor).toContain("activeClaimStartedAt > Date.now() - CLAIM_MS");
    expect(processor).toContain('.eq("concept_extraction_claim_id", claimId)');
    expect(processor).toContain('.eq("practice_source_status", "processing")');
    expect(processor).toContain('.eq("practice_source_version", expectedPracticeSourceVersion)');
  });
});
