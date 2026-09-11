import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("study concept evidence trigger forward fix", () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260831203500_fix_study_concept_evidence_trigger.sql",
    ),
    "utf8",
  );

  it("keeps evidence-contract fields immutable without referencing a nonexistent outcome_source column", () => {
    expect(migration).toContain(
      "create or replace function public.freeze_study_concept_update_evidence_contract_v2()",
    );
    expect(migration).toContain(
      "new.client_attempt_id is distinct from old.client_attempt_id",
    );
    expect(migration).toContain(
      "new.evidence_contract_version is distinct from old.evidence_contract_version",
    );
    expect(migration).toContain(
      "new.evidence_tier is distinct from old.evidence_tier",
    );
    expect(migration).toContain(
      "new.target_task_kind is distinct from old.target_task_kind",
    );
    expect(migration).not.toContain("new.outcome_source");
    expect(migration).not.toContain("old.outcome_source");
  });
});
