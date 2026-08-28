import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("learning evidence contract v2", () => {
  const migration = source("supabase/migrations/20260828100000_learning_evidence_ladder.sql");
  const readinessMigration = source("supabase/migrations/20260828110000_full_scope_readiness.sql");
  const recorder = source("supabase/functions/record-study-result/index.ts");
  const generator = source("supabase/functions/generate-artifact/index.ts");
  const appEvidence = source("src/lib/study/strategyEvidence.ts");

  it("keeps legacy rows nullable while constraining and freezing new evidence", () => {
    expect(migration).toContain("add column if not exists evidence_contract_version smallint");
    expect(migration).toContain("evidence_contract_version is null");
    expect(migration).toContain("evidence_contract_version = 2");
    expect(migration).toContain("study attempt evidence contract is immutable");
    expect(migration).toContain("study attempt evidence does not match its artifact contract");
    expect(migration).not.toMatch(/update public\.study_result_attempts[\s\S]*set evidence_contract_version/i);
  });

  it("prevents browser feedback from occupying an authoritative attempt key", () => {
    expect(migration).toContain("outcome_source = 'feedback'\n      and client_attempt_id is null");
    expect(migration).toContain("feedback cannot claim a study attempt or learning evidence");
    expect(migration).toContain("new.client_attempt_id is distinct from old.client_attempt_id");
  });

  it("derives canonical tiers from the artifact and never from the browser", () => {
    expect(migration).toContain("when 'flashcards'::public.artifact_kind then 'recall'");
    expect(migration).toContain("when 'multiple_choice'::public.artifact_kind then 'discrimination'");
    expect(migration).toContain("when 'matching'::public.artifact_kind then 'discrimination'");
    expect(migration).toContain("when 'practice'::public.artifact_kind then 'transfer'");
    expect(recorder).toContain("evidence classification is server-derived");
    expect(recorder).toContain("evidenceTierForArtifact(artifact.kind)");
    expect(recorder).not.toContain("body.evidenceTier");
  });

  it("prevents post-reveal recall and below-task evidence from raising performance mastery", () => {
    expect(migration).toContain("v_evidence_rank >= v_required_rank");
    expect(migration).toContain("v_evidence_tier in ('discrimination', 'application', 'transfer')");
    expect(migration).toContain("when 'discrimination' then 0.74");
    expect(migration).toContain("when 'application' then 0.92");
    expect(migration).toContain("v_resulting_strength := v_previous_strength");
    expect(migration).toContain("v_actual_delta := v_resulting_strength - v_previous_strength");
  });

  it("keeps old RPCs and adds an atomic transfer reservation using v3", () => {
    expect(migration).toContain("create or replace function public.apply_study_concept_result_v3(");
    expect(migration).toContain("create or replace function public.reserve_practice_study_attempt_v2(");
    expect(migration).toContain("v_apply_result := public.apply_study_concept_result_v3(");
    expect(migration).not.toContain("drop function public.apply_study_concept_result_v2");
    expect(migration).not.toContain("drop function public.reserve_practice_study_attempt");
    expect(migration).toContain("to service_role;");
  });

  it("persists actual mastery movement and both evidence readers consume the tier", () => {
    expect(recorder).toContain("resulting - previous");
    expect(recorder).toContain("evidence_tier: evidenceContractVersion");
    expect(appEvidence).toContain("mastery_delta, evidence_tier, outcome_source");
    expect(appEvidence).toContain("evidenceTier: isLearningEvidenceTier(row.evidence_tier)");
    expect(generator).toContain("mastery_delta, evidence_tier, outcome_source");
    expect(generator).toContain("evidenceTier: isLearningEvidenceTier(row.evidence_tier)");
  });

  it("requires a frozen full exam denominator for new results", () => {
    expect(generator).toContain("GRADED_ARTIFACT_KINDS.has(body.kind)");
    expect(generator).toContain("exam_readiness_scope_must_be_complete");
    expect(generator).toContain("readinessScope:");
    expect(generator).toContain("conceptIds: rankedCandidates.map(({ concept }) => concept.id)");
    expect(recorder).toContain("examReadinessScopeFromSnapshot");
    expect(recorder).toContain('"project_study_readiness_v1"');
    expect(recorder).not.toContain("computeScopedReadiness");
    expect(readinessMigration).toContain("require_active_exam_for_study_update_v2");
    expect(readinessMigration).toContain("order by concept.id\n  for share");
    expect(readinessMigration).toContain("coalesce(mastery.strength, 0::real)");
    expect(recorder).toContain("This exam study set must be refreshed");
  });

  it("keeps the immutable attempt denominator separate from current exam cache scope", () => {
    expect(readinessMigration).toContain("v_exam_scope_ids");
    expect(readinessMigration).toContain("v_exam_cache_scope_ids");
    expect(readinessMigration).toContain("latest.study_scope_snapshot -> 'readinessScope'");
    expect(readinessMigration).toContain("The attempt's older");
    expect(readinessMigration).toContain("used solely for its frozen response");
  });
});
