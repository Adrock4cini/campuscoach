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
  });

  it("resumes a failed attempt through the idempotent concept ledger", () => {
    expect(studyAttemptDisposition("failed", "2026-07-21T13:59:50.000Z", now))
      .toBe("resume");
  });

  it("ships the database ledger and routes mastery through its atomic RPC", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260721143000_add_retry_integrity.sql",
    ), "utf8");
    const edgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");

    expect(migration).toContain("primary key (user_id, client_attempt_id, concept_id)");
    expect(migration).toContain("for update;");
    expect(migration).toContain("function public.apply_study_concept_result");
    expect(edgeFunction).toContain('supabase.rpc(\n      "apply_study_concept_result"');
    expect(edgeFunction).not.toContain('.upsert(rows, { onConflict: "user_id,concept_id" })');
  });
});
