import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260810120000_class_owned_syllabi.sql"),
  "utf8",
);

describe("class-owned syllabus migration contract", () => {
  it("keeps the source private, class-owned, and transaction-only", () => {
    expect(migration).toContain("'syllabus-sources'");
    expect(migration).toContain("false,\n  15000000");
    expect(migration).toContain("REVOKE ALL ON public.class_syllabi FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.commit_class_syllabus");
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = pg_catalog, pg_temp");
    expect(migration).toContain("source IN ('manual', 'canvas', 'syllabus')");
    expect(migration).toContain("class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT");
  });

  it("scopes reconciliation and preserves non-syllabus schedule entries", () => {
    expect(migration).toContain("row.source = 'syllabus'");
    expect(migration).toContain("row.class_id = p_class_id");
    expect(migration).toContain("coalesce(existing_item->>'source', '') <> 'syllabus'");
    expect(migration).toContain("'sourceKey', item->>'key'");
    expect(migration).toContain("'syllabusId', v_syllabus.id");
    expect(migration).toContain("detached_from_syllabus_at");
    expect(migration).toContain("legacy_syllabus_edit_preserved");
    expect(migration).toContain("meta->>'source_key' IS DISTINCT FROM concat");
    expect(migration).toContain("OR OLD.syllabus_id IS NOT NULL");
  });

  it("records exact retries and rejects untrusted oversized review data", () => {
    expect(migration).toContain("public.class_syllabus_requests");
    expect(migration).toContain("octet_length(p_parsed_data::text) > 2000000");
    expect(migration).toContain("octet_length(p_reviewed_data::text) > 1000000");
    expect(migration).toContain("A syllabus request id cannot be reused with different input");
    expect(migration).toContain("'cleanupPath'");
    expect(migration).not.toContain("DELETE FROM storage.objects");
  });
});
