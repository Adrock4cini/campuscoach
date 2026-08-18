import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817190000_study_intelligence_v1.sql"),
  "utf8",
);
const lockdown = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817191000_study_intelligence_lockdown.sql"),
  "utf8",
);

describe("Study Intelligence v1 migration contract", () => {
  it("calibrates durable mastery from pre-reveal confidence", () => {
    expect(migration).toContain("apply_study_concept_result_v2");
    expect(migration).toContain("when p_correct and p_confidence = 'high' then 0.18");
    expect(migration).toContain("when p_confidence = 'high' then -0.22");
    expect(migration).toContain("when not p_correct and p_confidence = 'high' then 2");
    expect(migration).toContain("confidence_level text");
    expect(migration).toContain("recovered boolean not null default false");
    expect(migration).toContain("on conflict (user_id, client_attempt_id, concept_id) do nothing");
    expect(migration).toContain("result_request_hash text");
    expect(migration).toContain("study_sessions_result_request_hash_check");
    expect(migration).toContain("least(10, greatest(0, v_resulting_streak - 1))");
  });

  it("records recovery without converting the first miss into mastery credit", () => {
    expect(migration).toContain("Only first-attempt correctness affects mastery");
    expect(migration).toContain("answer_correct");
    expect(migration).toContain("p_recovered");
    expect(migration).not.toMatch(/v_resulting_correct\s*:=.*p_recovered/is);
    expect(migration).not.toMatch(/v_delta\s*:=.*p_recovered/is);
  });

  it("keeps memory feedback private, bounded, and free of student text", () => {
    expect(migration).toContain("create table if not exists public.study_memory_feedback");
    expect(migration).toContain("primary key (user_id, artifact_id, concept_id)");
    expect(migration).toContain("on delete cascade");
    expect(migration).toContain("technique in ('acronym', 'association', 'rhyme', 'story', 'chunking', 'visual', 'other')");
    expect(migration).toContain("revoke all on table public.study_memory_feedback from public, anon, authenticated");
    expect(migration).toContain("security definer");
    expect(migration).toContain("artifact.user_id = v_user_id");
    expect(migration).toContain("concept.user_id = v_user_id");
    expect(migration).toContain("p_concept_id = any(artifact.concept_ids)");
    expect(migration).toContain("artifact.stale is false");
    expect(migration).toContain("item ->> 'technique' = p_technique");
    expect(migration).not.toMatch(/\b(prompt|mnemonic|student_text|free_text)\s+(text|jsonb)/i);
  });

  it("rejects cross-class and forged-time mastery calls", () => {
    expect(migration).toContain("owned_class.user_id = v_user_id");
    expect(migration).toContain("owned_class.source_archived_at is null");
    expect(migration).toContain("Concept does not belong to this class");
    expect(migration).toContain("p_seen_at < now() - interval '10 minutes'");
    expect(migration).toContain("p_seen_at > now() + interval '5 minutes'");
    expect(migration).toContain("p_confidence is null or p_confidence not in");
    expect(migration).toContain("Class does not belong to concept owner");
    expect(migration).toContain("Capture does not belong to concept owner");
    expect(migration).toContain("Capture class cannot diverge from its extracted concepts");
    expect(migration).toContain("where capture.id = new.capture_id\n      for share;");
    expect(migration).toContain("drop trigger if exists captures_enforce_study_boundaries");
    expect(migration).toContain("create trigger captures_enforce_study_boundaries");
    expect(migration).toContain("execute function public.enforce_capture_study_boundaries()");
    expect(migration).toContain("capture.id is not null\n           and capture.class_id is not null");
    expect(migration).toContain("class_id = excluded.class_id");
  });

  it("keeps the authoritative result lease service-only and owner-bound", () => {
    expect(migration).toContain("create table if not exists public.study_result_attempts");
    expect(migration).toContain("primary key (user_id, client_attempt_id)");
    expect(migration).toContain("lease_token uuid not null");
    expect(migration).toContain("lease_started_at timestamptz not null");
    expect(migration).toContain("session_id uuid unique");
    expect(migration).toContain("result_status = 'completed' and result_payload is not null and completed_at is not null and session_id is not null");
    expect(migration).toContain("revoke all on table public.study_result_attempts from public, anon, authenticated");
    expect(migration).not.toContain("guard_artifact_study_session_writes");
  });

  it("exposes only owner-validated RPCs to students", () => {
    expect(migration).toContain(
      "revoke all on function public.record_memory_trick_feedback(uuid, uuid, text, boolean)\n  from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.record_memory_trick_feedback(uuid, uuid, text, boolean)\n  to authenticated, service_role",
    );
    expect(migration).toContain("set search_path = pg_catalog, pg_temp");
    expect(migration).toContain("security definer");
    expect(migration).toContain(") to service_role;");
    expect(migration).toContain(") from public, anon, authenticated;");
  });

  it("locks browser writes only after the compatible Edge functions deploy", () => {
    expect(lockdown).toContain("revoke insert, update, delete on table public.user_concept_mastery from authenticated");
    expect(lockdown).toContain("revoke all on table public.study_result_concept_updates from authenticated");
    expect(lockdown).toContain("revoke insert, update, delete on table public.learning_artifacts from authenticated");
    expect(lockdown).toContain("revoke insert, update, delete on table public.concepts from authenticated");
    expect(lockdown).toContain("grant select on table public.learning_artifacts to authenticated");
    expect(lockdown).toContain("guard_artifact_study_session_writes");
    expect(lockdown).toContain("v_role in ('anon', 'authenticated')");
    expect(lockdown).toContain("old.client_attempt_id is not null");
    expect(lockdown).toContain("new.client_attempt_id is not null");
    expect(lockdown).toContain("return old;");
    expect(lockdown).toContain("return new;");
    expect(lockdown).toContain("function public.apply_study_concept_result(");
    expect(lockdown).toContain("from public, anon, authenticated, service_role");
    expect(lockdown).toContain("only after:");
  });
});
