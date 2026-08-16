import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816110000_syllabus_upload_quota.sql"),
  "utf8",
);

describe("syllabus upload quota migration contract", () => {
  it("enforces the quota in the authenticated Storage insert policy", () => {
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS syllabus_sources_owner_class_lookup");
    expect(migration).toContain("WHERE bucket_id = 'syllabus-sources'");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.can_upload_uncommitted_syllabus_source(p_path text)",
    );
    expect(migration).toMatch(/LANGUAGE plpgsql[\s\S]*?VOLATILE[\s\S]*?SECURITY DEFINER/);
    expect(migration).toContain("v_max_uncommitted_per_user constant integer := 12");
    expect(migration).toContain("v_max_uncommitted_per_class constant integer := 3");
    expect(migration).toContain("v_user_uncommitted_count < v_max_uncommitted_per_user");
    expect(migration).toContain("v_class_uncommitted_count < v_max_uncommitted_per_class");
    expect(migration).toContain("DROP POLICY IF EXISTS syllabus_sources_owner_insert ON storage.objects");
    expect(migration).toContain("public.can_upload_uncommitted_syllabus_source(name)");
  });

  it("keeps strict class ownership and serializes concurrent quota checks", () => {
    expect(migration).toContain("public.owns_active_syllabus_storage_path(p_path)");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(migration).toContain("'syllabus-upload:' || v_user_id::text");
    expect(migration).toContain("split_part(source_object.name, '/', 1) = v_user_id::text");
    expect(migration).toContain("split_part(source_object.name, '/', 2) = v_class_id::text");
  });

  it("counts only unfinished sources so saved revisions and exact retries remain usable", () => {
    expect(migration).toContain("FROM public.class_syllabi AS committed_syllabus");
    expect(migration).toContain("committed_syllabus.storage_path = source_object.name");
    expect(migration).toMatch(
      /AND NOT EXISTS \([\s\S]*committed_syllabus\.storage_path = source_object\.name[\s\S]*\);/,
    );
    expect(migration).not.toContain("DELETE FROM storage.objects");
  });

  it("does not expose the security-definer helper to anonymous callers", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.can_upload_uncommitted_syllabus_source(text)",
    );
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated, service_role");
    expect(migration).toContain("SET search_path = pg_catalog, pg_temp");
  });
});
