import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827126000_family_beta_agreement_acceptance.sql"),
  "utf8",
);
const rawInputGuardMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827126500_family_beta_raw_input_guard.sql"),
  "utf8",
);
const rawInputGuardSql = rawInputGuardMigration.toLowerCase();
const maintenanceGuardMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827125500_study_write_maintenance_guard.sql"),
  "utf8",
);
const maintenanceGuardSql = maintenanceGuardMigration.toLowerCase();

const launchFunctions = [
  "generate-artifact",
  "record-study-result",
  "extract-concepts",
  "process-capture-images",
  "confirm-assignment-practice-source",
  "parse-syllabus",
];

describe("family beta agreement backend boundary", () => {
  it("stores a versioned, timestamped, owner-bound audit receipt without metadata backfill", () => {
    expect(migration).toContain("create table if not exists public.family_beta_agreement_acceptances");
    expect(migration).toContain("primary key (user_id, agreement_version)");
    expect(migration).toContain("accepted_at timestamptz not null");
    expect(migration).toContain("check (accepted_by = user_id)");
    expect(migration).not.toContain("raw_user_meta_data");
  });

  it("makes receipts append-only while retaining service deletion for account erasure", () => {
    expect(migration).toContain("before update on public.family_beta_agreement_acceptances");
    expect(migration).toContain("family beta agreement receipts are append-only");
    expect(migration).toContain("grant select, insert, delete on table public.family_beta_agreement_acceptances");
    expect(migration).not.toContain("grant all privileges on table public.family_beta_agreement_acceptances");
  });

  it("exposes only authenticated status and idempotent current-version acceptance RPCs", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("on conflict (user_id, agreement_version) do nothing");
    expect(migration).toContain("grant execute on function public.get_family_beta_agreement_status()");
    expect(migration).toContain("grant execute on function public.accept_family_beta_agreement(text)");
    expect(migration).toContain("to authenticated");
  });

  it("server-gates authenticated raw and derived capture-table writes on the durable receipt", () => {
    expect(rawInputGuardSql).toContain("create or replace function public.has_current_family_beta_agreement()");
    expect(rawInputGuardSql).toContain("from public.family_beta_agreement_acceptances receipt");
    expect(rawInputGuardSql).toContain("receipt.user_id = auth.uid()");
    expect(rawInputGuardSql).toContain("receipt.accepted_by = auth.uid()");
    expect(rawInputGuardSql).toContain("receipt.agreement_version = '2026-08-17'");
    expect(rawInputGuardSql).not.toContain("user_metadata");

    for (const table of ["captures", "materials", "processed_content"]) {
      for (const operation of ["insert", "update"]) {
        expect(rawInputGuardSql).toContain(`${table}_current_agreement_${operation}`);
      }
      expect(rawInputGuardSql).toContain(`on public.${table} as restrictive for insert to authenticated`);
      expect(rawInputGuardSql).toContain(`on public.${table} as restrictive for update to authenticated`);
    }
    expect(rawInputGuardSql).not.toMatch(/(?:captures|materials|processed_content)_current_agreement_delete/iu);
  });

  it("server-gates direct capture and syllabus Storage inserts without changing other buckets", () => {
    expect(rawInputGuardSql).toContain("student_sources_current_agreement_insert");
    expect(rawInputGuardSql).toContain("on storage.objects as restrictive for insert to authenticated");
    expect(rawInputGuardSql).toContain("bucket_id not in ('capture-sources', 'syllabus-sources')");
    expect(rawInputGuardSql).toContain("or public.has_current_family_beta_agreement()");
    expect(rawInputGuardSql).not.toMatch(/for delete to authenticated/iu);
    expect(rawInputGuardSql).toContain("to authenticated, service_role");
  });

  it("fail-closes all browser raw-input writes during the coordinated rollout pause", () => {
    expect(maintenanceGuardSql).toContain("create or replace function public.study_writes_are_available()");
    expect(maintenanceGuardSql).toContain("from private.study_write_runtime_control control");
    expect(maintenanceGuardSql).toContain("for share");
    expect(maintenanceGuardSql).toContain("return not coalesce(v_paused, true)");

    for (const table of ["captures", "materials", "processed_content"]) {
      for (const operation of ["insert", "update"]) {
        expect(maintenanceGuardSql).toContain(`${table}_study_writes_available_${operation}`);
      }
      expect(maintenanceGuardSql).toContain(`on public.${table} as restrictive for insert to authenticated`);
      expect(maintenanceGuardSql).toContain(`on public.${table} as restrictive for update to authenticated`);
    }

    for (const bucket of ["capture", "syllabus"]) {
      expect(maintenanceGuardSql).toContain(`${bucket}_sources_study_writes_available_insert`);
      expect(maintenanceGuardSql).toContain(`bucket_id <> '${bucket}-sources'`);
    }

    expect(maintenanceGuardSql).toContain("to authenticated, service_role");
    expect(maintenanceGuardSql).not.toMatch(/study_writes_available_delete/iu);
    expect(maintenanceGuardSql).not.toMatch(/for delete to authenticated/iu);
  });

  it.each(launchFunctions)("fails closed at the %s Edge boundary", (name) => {
    const source = readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8");
    expect(source).toContain('from "../_shared/family-beta-agreement.ts"');
    expect(source).toContain("checkCurrentFamilyBetaAgreement(");
    expect(source).toContain('errorClass: "agreement_check_unavailable"');
    expect(source).toContain("FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE, 403");
    expect(source.indexOf("checkCurrentFamilyBetaAgreement(")).toBeLessThan(source.indexOf("await req.json()"));
  });

  it("does not let Auth user_metadata satisfy the frontend route gate", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const agreement = readFileSync(resolve(process.cwd(), "src/lib/legal/familyBeta.ts"), "utf8");
    expect(app).not.toContain("user_metadata");
    expect(agreement).not.toContain("user_metadata");
  });
});
