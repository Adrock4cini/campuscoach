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
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    expect(retryMigration).toContain("primary key (user_id, client_attempt_id, concept_id)");
    expect(retryMigration).toContain("for update;");
    expect(retryMigration).toContain("function public.apply_study_concept_result");
    expect(intelligenceMigration).toContain("create table if not exists public.study_result_attempts");
    expect(intelligenceMigration).toContain("primary key (user_id, client_attempt_id)");
    expect(intelligenceMigration).toContain("session_id uuid unique");
    expect(intelligenceMigration).toContain("revoke all on table public.study_result_attempts from public, anon, authenticated");
    expect(edgeFunction).toContain('adminClient.rpc(\n      "apply_study_concept_result_v2"');
    expect(edgeFunction).toContain('adminClient\n    .from("study_result_attempts")');
    expect(edgeFunction).toContain("result_request_hash: requestHash");
    expect(edgeFunction).toContain("priorAttempt.result_request_hash !== requestHash");
    expect(edgeFunction).toContain('artifact.prompt_version !== CURRENT_PROMPT_VERSION');
    expect(edgeFunction).toContain("perConcept must score every item in this study set");
    expect(edgeFunction).toContain("correct and perConcept results do not match");
    expect(edgeFunction).not.toContain('.upsert(rows, { onConflict: "user_id,concept_id" })');
  });

  it("rejects malformed confidence results before reserving a durable session", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    expect(edgeFunction).toContain("durationSeconds must be between 0 and 86400");
    expect(edgeFunction).toContain("const confidence = p.confidence ?? \"medium\"");
    expect(edgeFunction).toContain("p.recovered === true && p.correct === true");
    const validation = edgeFunction.indexOf("Validate all student-supplied result details");
    const requestHash = edgeFunction.indexOf("const requestHash = await studyResultRequestHash");
    const attemptReservation = edgeFunction.indexOf("const { data: priorAttempt");
    expect(validation).toBeGreaterThan(-1);
    expect(requestHash).toBeGreaterThan(validation);
    expect(attemptReservation).toBeGreaterThan(requestHash);
    expect(edgeFunction).toContain('.eq("lease_token", priorAttempt.lease_token)');
    expect(edgeFunction).toContain('.eq("lease_started_at", priorAttempt.lease_started_at)');
  });

  it("fences stale reclaimers and repairs presentation history only from the trusted ledger", () => {
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    const priorLookupStart = edgeFunction.indexOf("const { data: priorAttempt");
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
});
