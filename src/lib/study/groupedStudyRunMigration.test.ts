import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260828100000_learning_evidence_ladder.sql",
), "utf8").toLowerCase();
const edge = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/record-study-result/index.ts",
), "utf8");

describe("grouped incremental study-run schema", () => {
  it("uses one service-only parent ledger to freeze owner and artifact identity", () => {
    expect(migration).toContain("create table if not exists public.study_runs");
    expect(migration).toContain("constraint study_runs_owner_artifact_identity unique (id, user_id, artifact_id)");
    expect(migration).toContain("alter table public.study_runs enable row level security");
    expect(migration).toContain("revoke all on table public.study_runs from public, anon, authenticated");
    expect(migration).toContain("foreign key (study_run_id, user_id, artifact_id)");
    expect(migration).toContain("references public.study_runs (id, user_id, artifact_id)");
    expect(migration).toContain("study run artifact owner does not match");
  });

  it("allows many immutable attempts to reference one presentation session", () => {
    expect(migration).toContain("drop constraint if exists study_result_attempts_session_id_key");
    expect(migration).toContain("add column if not exists study_run_id uuid");
    expect(migration).toContain("study_run_segment integer");
    expect(migration).toContain("study_run_final boolean");
    expect(migration).toContain("study_run_correct integer");
    expect(migration).toContain("study_run_total integer");
    expect(migration).toContain("study_run_concept_ids uuid[]");
    expect(migration).toContain("study run attempt metadata is immutable");
    expect(migration).toContain("create unique index if not exists study_sessions_study_run_uidx");
    expect(migration).toContain("foreign key (session_id, study_run_id)");
    expect(migration).toContain("references public.study_sessions (id, study_run_id)");
    expect(migration).toContain("evidence_contract_version is not distinct from 2");
    expect(migration).toContain("study_run_correct is not null");
    expect(migration).toContain("study_run_total is not null");
    expect(migration).toContain("cardinality(study_run_concept_ids) = study_run_total");
  });

  it("serializes segment reservations and rejects gaps, duplicates, and post-final work", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(new.study_run_id::text, 0))");
    expect(migration).toContain("create unique index if not exists study_result_attempts_run_segment_uidx");
    expect(migration).toContain("create unique index if not exists study_result_attempts_run_final_uidx");
    expect(migration).toContain("if v_run.result_status = 'completed' then");
    expect(migration).toContain("if tg_op = 'insert' and v_run.final_segment_index is not null then");
    expect(migration).toContain("v_previous_status <> 'completed'");
    expect(migration).toContain("study run segments must be contiguous and acknowledged");
    expect(migration).toContain("completed study run segment is immutable");
    expect(migration).toContain("sibling.study_run_concept_ids && new.study_run_concept_ids");
    expect(migration).toContain("final study run segment must cover every artifact concept exactly once");
    expect(migration).toContain("complete artifact coverage must be marked as the final study run segment");
  });

  it("binds the sole grouped session to the same run owner and artifact", () => {
    expect(migration).toContain("create or replace function public.enforce_study_session_run_identity_v2()");
    expect(migration).toContain("new.id is distinct from v_run.id");
    expect(migration).toContain("new.user_id is distinct from v_run.user_id");
    expect(migration).toContain("new.artifact_id is distinct from v_run.artifact_id");
    expect(migration).toContain("new.client_attempt_id is distinct from v_run.id");
    expect(migration).toContain("before insert or update of id, study_run_id");
    expect(migration).toContain("study run cannot complete before every segment and session are complete");
    expect(migration).toContain("study_run_has_exact_concept_evidence_v2(new.id)");
    expect(migration).toContain("study session cannot complete before exact artifact concept coverage");
    expect(migration).toContain("study run concept evidence cannot appear in multiple segments");
    expect(migration).toContain("constraint study_runs_session_identity_check");
  });

  it("groups the Edge contract into one aggregate history and derived signal", () => {
    expect(edge).toContain("parseStudyRunContract(parsedBody)");
    expect(edge).toContain("study_run_segment: studyRunContract.segmentIndex");
    expect(edge).toContain("study_run_concept_ids: [...scoredConceptIds].sort()");
    expect(edge).toContain("aggregateStudyRunSegments(runAttempts)");
    expect(edge).toContain('client_attempt_id: studyRunContract.kind === "grouped"');
    expect(edge).toContain('source_id: runId');
    expect(edge).toContain('client_attempt_id: finalAttempt!.clientAttemptId');
    expect(edge).toContain('studyRunContract.kind !== "grouped"');
    expect(edge).toContain("summarizeAuthoritativeStudyRunEvidence(");
    expect(edge).toContain("studyRunContract.segmentFinal !== exactArtifactCoverage");
    expect(edge).toContain('reason: "study_run_coverage_conflict"');
  });
});
