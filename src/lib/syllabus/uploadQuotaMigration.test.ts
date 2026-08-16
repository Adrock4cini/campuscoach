import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816110000_syllabus_upload_quota.sql"),
  "utf8",
);

describe("syllabus upload quota migration contract", () => {
  it("enforces quota through the function already referenced by the Storage insert policy", () => {
    expect(migration).toContain("source_object.bucket_id = 'syllabus-sources'");
    expect(migration).toContain("FROM pg_catalog.pg_policies policy");
    expect(migration).toContain("policy.policyname = 'syllabus_sources_owner_insert'");
    expect(migration).toContain("policy.cmd = 'INSERT'");
    expect(migration).toContain("policy.permissive = 'PERMISSIVE'");
    expect(migration).toContain("'authenticated' = ANY(policy.roles)");
    expect(migration).toContain(
      "position('owns_active_syllabus_storage_path' IN v_insert_check) = 0",
    );
    expect(migration).toContain("position('syllabus-sources' IN v_insert_check) = 0");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.owns_active_syllabus_storage_path(p_path text)",
    );
    expect(migration).toContain("RETURN public.can_upload_uncommitted_syllabus_source(p_path)");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.can_upload_uncommitted_syllabus_source(p_path text)",
    );
    expect(migration).toMatch(/LANGUAGE plpgsql[\s\S]*?VOLATILE[\s\S]*?SECURITY DEFINER/);
    expect(migration).toContain("v_max_uncommitted_per_user constant integer := 12");
    expect(migration).toContain("v_max_uncommitted_per_class constant integer := 3");
    expect(migration).toContain("v_user_uncommitted_count < v_max_uncommitted_per_user");
    expect(migration).toContain("v_class_uncommitted_count < v_max_uncommitted_per_class");
  });

  it("keeps strict class ownership and serializes concurrent quota checks", () => {
    expect(migration).toContain("public.owns_syllabus_storage_path(p_path)");
    expect(migration).toContain("owned_class.source_archived_at IS NULL");
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

  it("does not alter the Supabase-managed Storage schema", () => {
    expect(migration).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*\sON\s+storage\.objects/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+storage\.objects/i);
    expect(migration).not.toMatch(/(?:CREATE|DROP)\s+POLICY[^;]*\sON\s+storage\.objects/i);
  });
});
