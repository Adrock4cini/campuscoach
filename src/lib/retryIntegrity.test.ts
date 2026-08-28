import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { studyAttemptDisposition } from "../../supabase/functions/_shared/retry-integrity";

describe("study result retry integrity", () => {
  const now = Date.parse("2026-07-21T14:00:00.000Z");

  it("returns a completed attempt instead of applying mastery twice", () => {
    expect(studyAttemptDisposition("completed", "2026-07-21T13:00:00.000Z", now))
      .toBe("return-cached");
  });

  it("waits for an active request and safely resumes an abandoned one", () => {
    expect(studyAttemptDisposition("processing", "2026-07-21T13:59:50.000Z", now))
      .toBe("wait");
    expect(studyAttemptDisposition("processing", "2026-07-21T13:58:00.000Z", now))
      .toBe("resume");
    expect(studyAttemptDisposition("processing", "2026-07-21T13:59:00.000Z", now))
      .toBe("wait");
  });

  it("resumes a failed attempt through the idempotent concept ledger", () => {
    expect(studyAttemptDisposition("failed", "2026-07-21T13:59:50.000Z", now))
      .toBe("resume");
  });

  it("ships the database ledger and routes mastery through its atomic RPC", () => {
    const retryMigration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260721143000_add_retry_integrity.sql",
    ), "utf8");
    const intelligenceMigration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260817190000_study_intelligence_v1.sql",
    ), "utf8");
    const practiceGuard = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260827120000_assignment_tutor_mastery_guard.sql",
    ), "utf8");
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");
    const readinessMigration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260828110000_full_scope_readiness.sql",
    ), "utf8");

    expect(retryMigration).toContain("primary key (user_id, client_attempt_id, concept_id)");
    expect(retryMigration).toContain("for update;");
    expect(retryMigration).toContain("function public.apply_study_concept_result");
    expect(intelligenceMigration).toContain("create table if not exists public.study_result_attempts");
    expect(intelligenceMigration).toContain("primary key (user_id, client_attempt_id)");
    expect(intelligenceMigration).toContain("session_id uuid unique");
    expect(intelligenceMigration).toContain("revoke all on table public.study_result_attempts from public, anon, authenticated");
    expect(practiceGuard).toContain("add column if not exists challenge_fingerprint text");
    expect(practiceGuard).toContain("add column if not exists client_request_hash text");
    expect(practiceGuard).toContain("add column if not exists verified_grading_snapshot jsonb");
    expect(practiceGuard).toContain("create table if not exists public.practice_challenge_consumptions");
    expect(practiceGuard).toContain("primary key (user_id, challenge_fingerprint)");
    expect(practiceGuard).toContain("revoke all on table public.practice_challenge_consumptions from public, anon, authenticated");
    expect(practiceGuard).toContain("function public.reserve_practice_study_attempt(");
    expect(practiceGuard).toContain("readiness_scores_attempt_uidx");
    expect(practiceGuard).toContain("study_strategy_outcomes_attempt_uidx");
    expect(practiceGuard).toContain("consumption.client_attempt_id = p_client_attempt_id");
    expect(practiceGuard).toContain("pg_advisory_xact_lock");
    expect(practiceGuard).toContain("to service_role;");
    expect(practiceGuard).not.toContain("artifact_id uuid not null references public.learning_artifacts");
    expect(edgeFunction).toContain('"apply_study_concept_result_v3"');
    expect(edgeFunction).toContain(': "apply_study_concept_result_v2"');
    expect(edgeFunction).toContain("evidence classification is server-derived");
    expect(edgeFunction).toContain('adminClient\n    .from("study_result_attempts")');
    expect(edgeFunction).toContain("result_request_hash: requestHash");
    expect(edgeFunction).toContain("priorAttempt.result_request_hash !== requestHash");
    expect(edgeFunction).toContain('artifact.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION');
    expect(edgeFunction).toContain("perConcept must score every submitted item");
    expect(edgeFunction).toContain("body.total > itemConceptIds.length");
    expect(edgeFunction).toContain("const scoredConceptIds = [...perMap.keys()]");
    expect(edgeFunction).toContain("correct and perConcept results do not match");
    expect(edgeFunction).not.toContain('.upsert(rows, { onConflict: "user_id,concept_id" })');
    expect(edgeFunction).toContain("const shouldWriteDerivedEvidence = appliedAny || Boolean(priorAttempt)");
    expect(edgeFunction).toContain('"project_study_readiness_v1"');
    expect(readinessMigration).toContain("on conflict (user_id, source_attempt_id) do update");
    expect(readinessMigration).toContain("study attempt lease was superseded");
    expect(edgeFunction).toContain('onConflict: "user_id,client_attempt_id"');
  });

  it("rejects malformed confidence results before reserving a durable session", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    expect(edgeFunction).toContain("durationSeconds must be between 0 and 86400");
    expect(edgeFunction).toContain("const confidence = p.confidence ?? \"medium\"");
    expect(edgeFunction).toContain("p.recovered === true && p.correct === true");
    const rawValidation = edgeFunction.indexOf("practice response must include valid first and final selections");
    const attemptLookup = edgeFunction.indexOf("const { data: priorAttemptData");
    const canonicalBuilder = edgeFunction.indexOf("const transfer = canonicalPracticeTransfer(artifact)");
    expect(rawValidation).toBeGreaterThan(-1);
    expect(attemptLookup).toBeGreaterThan(-1);
    expect(attemptLookup).toBeLessThan(rawValidation);
    expect(canonicalBuilder).toBeGreaterThan(rawValidation);
    expect(edgeFunction).toContain('.eq("lease_token", priorAttempt.lease_token)');
    expect(edgeFunction).toContain('.eq("lease_started_at", priorAttempt.lease_started_at)');
  });

  it("fences stale reclaimers and repairs presentation history only from the trusted ledger", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    const priorLookupStart = edgeFunction.indexOf("const { data: priorAttemptData");
    const priorLookupEnd = edgeFunction.indexOf("if (priorErr)", priorLookupStart);
    const priorLookup = edgeFunction.slice(priorLookupStart, priorLookupEnd);
    expect(priorLookupStart).toBeGreaterThan(-1);
    expect(priorLookup).toContain("await adminClient");
    expect(priorLookup).toContain('.from("study_result_attempts")');
    expect(priorLookup).not.toContain('.from("study_sessions")');

    expect(edgeFunction).toContain("const leaseToken = crypto.randomUUID()");
    expect(edgeFunction).toContain("studyAttemptDisposition(\n      priorAttempt.result_status,\n      priorAttempt.lease_started_at");
    expect(edgeFunction).toContain("const repairCompletedSession = async (");
    expect(edgeFunction.match(/repairCompletedSession\(/g)?.length).toBe(3);
    expect(edgeFunction).toContain(".update({ lease_started_at: renewedAt, updated_at: renewedAt })");
    expect(edgeFunction).toContain('.eq("lease_token", attempt.lease_token)');
    expect(edgeFunction).toContain('.select("lease_token, lease_started_at")');
    expect(edgeFunction).toContain('.eq("result_status", "completed")');
    expect(edgeFunction).toContain('.eq("result_request_hash", requestHash)');
    expect(edgeFunction).toContain("return json(repaired.payload)");
    expect(edgeFunction).not.toContain('.from("study_sessions")\n    .select("id, artifact_id, result_status');
  });

  it("rejects null bodies and null per-concept entries before property access", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    const bodyGuard = edgeFunction.indexOf("JSON body must be an object");
    const firstBodyAccess = edgeFunction.indexOf("body.artifactId");
    expect(bodyGuard).toBeGreaterThan(-1);
    expect(bodyGuard).toBeLessThan(firstBodyAccess);

    const perConceptGuard = edgeFunction.indexOf("if (!isRecord(rawResult))");
    const confidenceAccess = edgeFunction.indexOf("const confidence = p.confidence");
    expect(perConceptGuard).toBeGreaterThan(-1);
    expect(perConceptGuard).toBeLessThan(confidenceAccess);
  });

  it("server-grades one-item practice transfer results without trusting client scores", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    expect(edgeFunction).toContain(
      'new Set(["flashcards", "multiple_choice", "matching", "practice"])',
    );
    expect(edgeFunction).toContain('kind === "practice"\n          ? "problems"');
    expect(edgeFunction).toContain(
      'artifact.kind === "practice" ? 1 : 8',
    );
    expect(edgeFunction).toContain(
      'artifact.kind === "practice" && artifact.concept_ids.length !== 1',
    );
    expect(edgeFunction).toContain("const transfer = canonicalPracticeTransfer(artifact)");
    expect(edgeFunction).toContain("firstCorrect = firstSelectedIndex === transfer.answerIndex");
    expect(edgeFunction).toContain("correct = firstCorrect ? 1 : 0");
    expect(edgeFunction).toContain("confidence: practiceConfidence");
    expect(edgeFunction).toContain("correct: correct === 1");
    expect(edgeFunction).toContain('artifact.model !== "deterministic-assignment-tutor-v1"');
    expect(edgeFunction).toContain("canonicalJsonStringify(problem) !== canonicalJsonStringify(canonical.problem)");

    const practiceStart = edgeFunction.indexOf('if (artifact.kind === "practice")');
    const legacyStart = edgeFunction.indexOf("} else {", practiceStart);
    const practiceBranch = edgeFunction.slice(practiceStart, legacyStart);
    expect(practiceStart).toBeGreaterThan(-1);
    expect(legacyStart).toBeGreaterThan(practiceStart);
    expect(practiceBranch).not.toContain("body.correct");
    expect(practiceBranch).not.toContain("body.total");
  });

  it("keeps practice recovery as a first-attempt miss and binds retries to the selection", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    expect(edgeFunction).toContain("body.selectedIndex !== body.firstSelectedIndex");
    expect(edgeFunction).toContain("recovered: false");
    expect(edgeFunction).toContain("if (selectedIndex !== undefined) canonicalResult.selectedIndex = selectedIndex");
    expect(edgeFunction).toContain("canonicalResult.firstSelectedIndex = firstSelectedIndex");
    expect(edgeFunction).toContain("p_correct: perMap.get(conceptId)?.correct ?? false");
    expect(edgeFunction).toContain("p_recovered: perMap.get(conceptId)?.recovered ?? false");
    expect(edgeFunction).not.toContain("body.recovered");
  });

  it("replays stale exact attempts but blocks regenerated challenge credit", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");
    const priorLookup = edgeFunction.indexOf("const { data: priorAttemptData");
    const freshnessGate = edgeFunction.indexOf("Freshness is a gate for new evidence only");
    const canonicalBuilder = edgeFunction.indexOf("const transfer = canonicalPracticeTransfer(artifact)");
    const atomicReservation = edgeFunction.indexOf('"reserve_practice_study_attempt"');

    expect(priorLookup).toBeGreaterThan(-1);
    expect(freshnessGate).toBeGreaterThan(priorLookup);
    expect(canonicalBuilder).toBeGreaterThan(priorLookup);
    expect(atomicReservation).toBeGreaterThan(canonicalBuilder);
    expect(edgeFunction).toContain("if (!priorAttempt && (");
    expect(edgeFunction).toContain("priorAttempt.challenge_fingerprint !== practiceChallengeFingerprint");
    expect(edgeFunction).toContain("parseVerifiedPracticeGradingSnapshot");
    expect(edgeFunction).toContain("priorAttempt.client_request_hash !== practiceClientRequestHash");
    expect(edgeFunction).toContain("verifyPracticeArtifactBoundary(supabase, userId, artifact)");
    expect(edgeFunction).toContain('.from("concept_capture_evidence")');
    expect(edgeFunction).toContain('.eq("concept_id", conceptId)');
    expect(edgeFunction).toContain('.eq("capture_id", artifact.capture_id)');
    expect(edgeFunction).toContain("capture.practice_source_version !== snapshot.practiceSourceVersion");
    expect(edgeFunction).not.toContain("concepts[0]?.capture_id !== artifact.capture_id");
    expect(edgeFunction).not.toContain("reservePracticeChallenge(");
    expect(edgeFunction).not.toContain('.from("practice_challenge_consumptions")');
  });
});
