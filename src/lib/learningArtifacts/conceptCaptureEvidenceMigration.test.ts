import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827100000_concept_capture_evidence.sql",
), "utf8");

describe("concept capture provenance migration", () => {
  it("keeps one stable concept linked to every exact owner-scoped capture", () => {
    expect(migration).toContain("primary key (user_id, concept_id, capture_id)");
    expect(migration).toContain("concept_capture_evidence_owner_select");
    expect(migration).toContain("revoke all on table public.concept_capture_evidence from public, anon, authenticated");
    expect(migration).toContain("grant all on table public.concept_capture_evidence to service_role");
    expect(migration).toContain("for share;");
  });

  it("backfills only direct trusted links and repairs future primary inserts transactionally", () => {
    expect(migration).toContain("join public.captures capture");
    expect(migration).not.toContain("processed_content");
    expect(migration).toContain("mirror_concept_primary_capture_evidence");
    expect(migration).toContain("after insert or update of capture_id on public.concepts");
  });

  it("prevents a later owner or class update from stranding cross-boundary evidence", () => {
    expect(migration).toContain("prevent_concept_capture_evidence_drift");
    expect(migration).toContain("before update of user_id, class_id, client_class_id on public.concepts");
    expect(migration).toContain("before update of user_id, class_id, client_class_id on public.captures");
  });
});
