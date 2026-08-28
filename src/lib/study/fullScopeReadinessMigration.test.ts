import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260828110000_full_scope_readiness.sql",
), "utf8");

describe("full-scope readiness migration", () => {
  it("neutralizes captured-but-unattempted mastery and invalidates legacy artifacts", () => {
    expect(migration).toContain("lock table public.learning_artifacts");
    expect(migration).toContain("public.readiness_scores\nin share row exclusive mode");
    expect(migration).toContain("where attempts = 0");
    expect(migration).toContain("set strength = 0");
    expect(migration).toContain("last_seen_at = null");
    expect(migration).toContain("v11-evidence-ladder");
  });

  it("closes the nullable rollout window before writes resume", () => {
    expect(migration).toContain("require_current_study_attempt_contract_v2");
    expect(migration).toContain("current study attempt evidence contract is required");
    expect(migration).toContain("before insert on public.study_result_attempts");
    // Browser roles stay closed, while service-role execution remains available
    // only so the Edge function can finish an already-existing NULL-contract
    // ledger attempt exactly once through its idempotent concept rows.
    expect(migration).toMatch(
      /grant execute on function public\.apply_study_concept_result_v2\([\s\S]*?\) to service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.reserve_practice_study_attempt\([\s\S]*?\) to service_role;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.apply_study_concept_result_v2\([\s\S]*?\) to (?:anon|authenticated);/,
    );
    expect(migration).toContain("require_bounded_legacy_study_update_v2");
    expect(migration).toContain("attempt.evidence_contract_version is null");
    expect(migration).toContain("attempt.result_status = 'processing'");
    expect(migration).toContain("new.concept_id = any(artifact.concept_ids)");
    expect(migration).toContain("legacy study update requires an existing bounded attempt");
  });

  it("guards the first exam mastery update with the complete active denominator", () => {
    expect(migration).toContain("require_active_exam_for_study_update_v2");
    expect(migration).toContain("active owned exam not found");
    expect(migration).toContain("v_artifact.concept_ids <@ v_exam_scope_ids");
    expect(migration).toContain("order by concept.id\n  for share");
    expect(migration).toContain("get diagnostics v_active_scope_count = row_count");
    expect(migration).toContain("active owned exam denominator not found");
  });

  it("projects readiness atomically and freezes an idempotent attempt response", () => {
    expect(migration).toContain("create or replace function public.project_study_readiness_v1(");
    expect(migration).toContain("for update;");
    expect(migration).toContain("study attempt lease was superseded");
    expect(migration).toContain("study_result_attempts_freeze_readiness_projection_v1");
    expect(migration).toContain("classCacheReadiness");
    expect(migration).toContain("responseReadiness");
    expect(migration).toContain("source_attempt_id");
    expect(migration).toContain("on conflict (user_id, source_attempt_id) do update");
    expect(migration).toContain("latest.study_scope_snapshot -> 'readinessScope'");
    expect(migration).toContain("latest.stale = false");
    expect(migration).toContain("to service_role;");
  });

  it("lets an exact applied attempt finish if its class is archived mid-save", () => {
    expect(migration).toContain("or v_attempt_has_updates");
    expect(migration).toContain("v_class_is_active := v_class.source_archived_at is null");
    expect(migration).toContain("if v_class_is_active then");
  });

  it("rebuilds class readiness with missing mastery included as zero", () => {
    expect(migration).toContain("left join public.concepts concept");
    expect(migration).toContain("left join public.user_concept_mastery mastery");
    // PostgreSQL LEAST/GREATEST ignore NULL arguments, so the missing row must
    // be converted to zero before clamping or it would incorrectly become 1.
    expect(migration).toContain("greatest(0::real, coalesce(mastery.strength, 0::real))");
    expect(migration).toContain("insert into public.readiness_scores");
    expect(migration).toContain("update public.exams");
    expect(migration).toContain("set readiness = 0");
  });

  it("exposes only the non-secret final evidence contract canary", () => {
    expect(migration).toContain("create or replace function public.get_learning_evidence_contract_status()");
    expect(migration).toContain("'artifactPromptVersion', 'v11-evidence-ladder'");
    expect(migration).toContain("'contractVersion', 2");
    expect(migration).toContain("'legacyWritesClosed', true");
    expect(migration).toContain("'readinessScopeVersion', 1");
    expect(migration).toMatch(
      /revoke all on function public\.get_learning_evidence_contract_status\(\)[\s\S]*?from public, anon;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_learning_evidence_contract_status\(\)[\s\S]*?to authenticated, service_role;/,
    );
  });
});
