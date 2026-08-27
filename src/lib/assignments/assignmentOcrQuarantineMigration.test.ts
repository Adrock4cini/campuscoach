import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const initialQuarantine = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827110000_assignment_practice_source_confirmation.sql",
), "utf8");
const postWorkerLockdown = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827130000_capture_mutation_lockdown.sql",
), "utf8");
const mirrorRetirement = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827127500_retire_concept_evidence_mirror.sql",
), "utf8");
const assignmentMigrationFiles = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((name) => name.startsWith("20260827"))
  .sort();

function statementBetween(sql: string, start: string, next: string) {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(next, startIndex + start.length);

  expect(startIndex, `missing statement start: ${start}`).toBeGreaterThan(-1);
  expect(endIndex, `missing statement boundary: ${next}`).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
}

describe("assignment OCR quarantine migrations", () => {
  it("removes every historical assignment OCR occurrence but retires only concepts with no trusted evidence", () => {
    const retirement = statementBetween(
      initialQuarantine,
      "update public.concepts concept\nset retired_at = now()",
      "update public.learning_artifacts artifact",
    );

    expect(initialQuarantine).toContain("create temporary table assignment_ocr_quarantine on commit drop as");
    expect(initialQuarantine).toContain("where capture.kind = 'scan-assignment';");
    expect(initialQuarantine).toContain("delete from public.concept_capture_evidence evidence");
    expect(retirement).toContain("and not exists (");
    expect(retirement).toContain("from public.concept_capture_evidence evidence");
  });

  it("stales every direct assignment artifact without staling shared-concept artifacts", () => {
    const artifactCleanup = statementBetween(
      initialQuarantine,
      "update public.learning_artifacts artifact\nset stale = true",
      "update public.user_concept_mastery mastery",
    );

    expect(artifactCleanup).toContain("concept.retired_at is not null");
    expect(artifactCleanup).toContain("capture.id = artifact.capture_id");
    expect(artifactCleanup).toContain("capture.kind = 'scan-assignment'");
  });

  it("resets and deletes concept-wide learning only for retired assignment-only concepts", () => {
    const masteryReset = statementBetween(
      initialQuarantine,
      "update public.user_concept_mastery mastery",
      "delete from public.study_strategy_outcomes outcome",
    );
    const outcomeCleanup = statementBetween(
      initialQuarantine,
      "delete from public.study_strategy_outcomes outcome",
      "delete from public.topic_signals signal",
    );
    const signalCleanup = statementBetween(
      initialQuarantine,
      "delete from public.topic_signals signal",
      "delete from public.processed_content processed",
    );

    for (const statement of [masteryReset, outcomeCleanup, signalCleanup]) {
      expect(statement).toContain("join public.concepts concept");
      expect(statement).toContain("concept.retired_at is not null");
    }
    expect(outcomeCleanup).toContain("capture.id = artifact.capture_id");
    expect(signalCleanup).toContain("capture.id = artifact.capture_id");
  });

  it("recomputes class readiness from active mastery after quarantine", () => {
    const readinessRepair = statementBetween(
      initialQuarantine,
      "update public.classes class",
      "update public.exams exam",
    );

    expect(readinessRepair).toContain("join public.user_concept_mastery mastery");
    expect(readinessRepair).toContain("concept.retired_at is null");
    expect(readinessRepair).not.toContain("set readiness = 0");
  });

  it("drains legacy writers and reconciles after the additive-schema window", () => {
    const resultGate = postWorkerLockdown.indexOf(
      "lock table public.study_result_attempts in exclusive mode",
    );
    const captureLock = postWorkerLockdown.indexOf(
      "lock table public.captures in exclusive mode",
    );
    const reconciliation = postWorkerLockdown.indexOf(
      "create temporary table late_assignment_ocr_quarantine on commit drop as",
    );
    const browserLockdown = postWorkerLockdown.indexOf(
      "revoke update on table public.captures from anon, authenticated",
    );

    expect(resultGate).toBeGreaterThan(-1);
    expect(captureLock).toBeGreaterThan(resultGate);
    expect(reconciliation).toBeGreaterThan(captureLock);
    expect(browserLockdown).toBeGreaterThan(reconciliation);
    expect(postWorkerLockdown).not.toContain(
      "lock table public.concept_capture_evidence in share row exclusive mode",
    );
    expect(postWorkerLockdown).toContain("lock table public.learning_artifacts in share row exclusive mode");
  });

  it("quarantines late unconfirmed or mismatched evidence while preserving the pinned confirmed occurrence", () => {
    const quarantineSelection = statementBetween(
      postWorkerLockdown,
      "create temporary table late_assignment_ocr_quarantine on commit drop as",
      "delete from public.concept_capture_evidence evidence",
    );

    expect(quarantineSelection).toContain("capture.practice_source_status <> 'confirmed'");
    expect(quarantineSelection).toContain(
      "capture.practice_concept_id is distinct from evidence.concept_id",
    );
  });

  it("preserves only a fully current confirmed Tutor artifact during handoff reconciliation", () => {
    const artifactCleanup = statementBetween(
      postWorkerLockdown,
      "update public.learning_artifacts artifact\nset stale = true",
      "update public.user_concept_mastery mastery",
    );

    expect(artifactCleanup).toContain("concept.retired_at is not null");
    expect(artifactCleanup).toContain("and not exists (");
    expect(artifactCleanup).toContain("capture.practice_source_status = 'confirmed'");
    expect(artifactCleanup).toContain("artifact.kind = 'practice'");
    expect(artifactCleanup).toContain("artifact.study_scope_snapshot ->> 'captureId' = capture.id::text");
    expect(artifactCleanup).toContain("artifact.study_scope_snapshot ->> 'practiceSourceVersion' = capture.practice_source_version::text");
    expect(artifactCleanup).toContain("artifact.study_scope_snapshot ->> 'practiceSourceHash' = capture.practice_source_hash");
    expect(artifactCleanup).toContain("artifact.payload -> 'problems' -> 0 ->> 'sourceExcerpt' = capture.practice_source_text");
  });

  it("keeps late shared-concept mastery and artifacts while discarding legacy OCR derivatives", () => {
    const masteryReset = statementBetween(
      postWorkerLockdown,
      "update public.user_concept_mastery mastery",
      "delete from public.study_strategy_outcomes outcome",
    );

    expect(masteryReset).toContain("concept.retired_at is not null");
    expect(postWorkerLockdown).toContain("delete from public.processed_content processed");
    expect(postWorkerLockdown).toContain("delete from public.flashcards card");
    expect(postWorkerLockdown).toContain("delete from public.quizzes quiz");
    expect(postWorkerLockdown).toContain("concept.retired_at is null");
  });

  it("drops only unfinished reservations for unsafe artifacts and preserves completed audit history", () => {
    for (const migration of [initialQuarantine, postWorkerLockdown]) {
      expect(migration).toContain("from public.study_result_attempts attempt");
      expect(migration).toContain("where attempt.result_status <> 'completed'");
      expect(migration).toContain("delete from public.study_sessions session");
      expect(migration).toContain("session.result_status in ('processing', 'failed')");
      expect(migration).toContain("delete from public.study_result_attempts attempt");
      expect(migration).not.toContain("attempt.result_status = 'completed'");
      expect(migration).not.toContain("session.result_status = 'completed'");
    }
  });

  it("narrows source-correction invalidation to this capture and a truly retired previous concept", () => {
    const correctionCleanup = statementBetween(
      initialQuarantine,
      "-- Invalidate only derivatives of this exact assignment source.",
      "-- A corrected source can retire or reactivate a class concept.",
    );

    expect(correctionCleanup).toContain("artifact.capture_id = p_capture_id");
    expect(correctionCleanup).toContain(
      "artifact.study_scope_snapshot -> 'assignmentReviewSource' ->> 'captureId'",
    );
    expect(correctionCleanup).toContain("v_previous_concept_id = any(artifact.concept_ids)");
    expect(correctionCleanup).toContain("previous_concept.retired_at is not null");
    expect(correctionCleanup).not.toContain("v_practice_concept_id = any");
    expect(correctionCleanup).toContain("attempt.result_status <> 'completed'");
    expect(correctionCleanup).toContain("session.result_status in ('processing', 'failed')");
  });

  it("retires the compatibility mirror in a committed pre-lockdown drain step", () => {
    expect(mirrorRetirement).toContain("POST-WORKER DRAIN PREREQUISITE");
    expect(mirrorRetirement).toContain("Pause capture ingestion/processing");
    expect(mirrorRetirement).toContain("Keep that write quiescence in place through 20260827130000");
    expect(mirrorRetirement).toContain(
      "drop trigger if exists concept_primary_capture_evidence_mirror on public.concepts",
    );
    expect(mirrorRetirement).toContain(
      "drop function if exists public.mirror_concept_primary_capture_evidence()",
    );
    expect(postWorkerLockdown).not.toContain("concept_primary_capture_evidence_mirror");
    expect(postWorkerLockdown).not.toContain("mirror_concept_primary_capture_evidence");
    expect(postWorkerLockdown).toContain("writes must remain paused until this");
    expect(postWorkerLockdown).toContain("not a substitute");
  });

  it("orders one strengthened review-artifact guard before drain and lockdown", () => {
    expect(assignmentMigrationFiles.filter((name) => (
      name.endsWith("_assignment_review_artifact_guard.sql")
    ))).toEqual(["20260827125000_assignment_review_artifact_guard.sql"]);

    const masteryGuard = assignmentMigrationFiles.indexOf(
      "20260827120000_assignment_tutor_mastery_guard.sql",
    );
    const reviewGuard = assignmentMigrationFiles.indexOf(
      "20260827125000_assignment_review_artifact_guard.sql",
    );
    const mirrorDrain = assignmentMigrationFiles.indexOf(
      "20260827127500_retire_concept_evidence_mirror.sql",
    );
    const lockdown = assignmentMigrationFiles.indexOf(
      "20260827130000_capture_mutation_lockdown.sql",
    );

    expect(reviewGuard).toBeGreaterThan(masteryGuard);
    expect(mirrorDrain).toBeGreaterThan(reviewGuard);
    expect(lockdown).toBeGreaterThan(mirrorDrain);
  });

  it("allows nested ownership cascades without allowing direct linked deletes", () => {
    const captureDeleteGuard = statementBetween(
      postWorkerLockdown,
      "create or replace function public.protect_capture_deletion()",
      "drop trigger if exists captures_protect_deletion",
    );
    const parentDeleteGuard = statementBetween(
      postWorkerLockdown,
      "create or replace function public.protect_capture_parent_deletion()",
      "create or replace function public.protect_capture_parent_reparenting()",
    );

    for (const guard of [captureDeleteGuard, parentDeleteGuard]) {
      expect(guard).toContain("pg_catalog.pg_trigger_depth() > 1");
      expect(guard).toContain("return old;");
    }
    expect(captureDeleteGuard).toContain("processed captures require server-side cleanup");
    expect(parentDeleteGuard).toContain("assignment has a saved capture");
    expect(parentDeleteGuard).toContain("exam has a saved capture");
    expect(parentDeleteGuard).toContain("class has a saved capture");
  });

  it("blocks only linked parent identity reparenting, leaving archive and status edits alone", () => {
    const reparentGuard = statementBetween(
      postWorkerLockdown,
      "create or replace function public.protect_capture_parent_reparenting()",
      "drop trigger if exists assignments_protect_capture_parent",
    );

    expect(reparentGuard).toContain("old.user_id is distinct from new.user_id");
    expect(reparentGuard).toContain("old.class_id is distinct from new.class_id");
    expect(reparentGuard).toContain("old.client_class_id is distinct from new.client_class_id");
    expect(postWorkerLockdown).toContain(
      "before update of user_id, class_id, client_class_id on public.assignments",
    );
    expect(postWorkerLockdown).toContain(
      "before update of user_id, class_id, client_class_id on public.exams",
    );
    expect(postWorkerLockdown).toContain(
      "before update of user_id, client_class_id on public.classes",
    );
    expect(postWorkerLockdown).not.toContain("before update of source_archived_at");
    expect(postWorkerLockdown).not.toContain("before update of status");
  });
});
