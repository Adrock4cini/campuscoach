import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260827122500_study_write_pause_control.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const maintenanceMigrationPath = "supabase/migrations/20260827125500_study_write_maintenance_guard.sql";
const maintenanceMigration = readFileSync(
  resolve(process.cwd(), maintenanceMigrationPath),
  "utf8",
).toLowerCase();
const rollout = readFileSync(resolve(
  process.cwd(),
  "docs/study-intelligence-rollout.md",
), "utf8");
const functionRoot = resolve(process.cwd(), "supabase/functions");
const protectedFunctions = [
  "confirm-assignment-practice-source",
  "extract-concepts",
  "generate-artifact",
  "parse-syllabus",
  "process-capture-images",
  "record-study-result",
].sort();

describe("repository-controlled study-write pause boundary", () => {
  it("keeps the control private behind service-role-only read and set RPCs", () => {
    expect(migration).toContain("create schema if not exists private");
    expect(migration).toContain("private.study_write_runtime_control");
    expect(migration).toContain("create or replace function public.get_study_write_pause()");
    expect(migration).toContain("create or replace function public.set_study_writes_paused(");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("'paused', true");
    expect(migration).toContain("'reason', 'control_missing'");
  });

  it("blocks new authenticated browser capture inserts but permits service recovery", () => {
    expect(migration).toContain("prevent_browser_capture_insert_while_study_paused");
    expect(migration).toContain("before insert on public.captures");
    expect(migration).toContain("auth.role()");
    expect(migration).toContain("not in ('anon', 'authenticated')");
    expect(migration).toContain("message = 'study_writes_paused'");
    expect(migration).toContain("coalesce(v_paused, true)");
    expect(migration).toContain("where control.singleton\n  for share;");
  });

  it("extends the lock-coordinated pause to every direct browser raw-input boundary", () => {
    expect(maintenanceMigration).toContain("create or replace function public.study_writes_are_available()");
    expect(maintenanceMigration).toContain("from private.study_write_runtime_control control");
    expect(maintenanceMigration).toContain("for share");
    expect(maintenanceMigration).toContain("return not coalesce(v_paused, true)");

    for (const table of ["captures", "materials", "processed_content"]) {
      expect(maintenanceMigration).toContain(`on public.${table} as restrictive for insert to authenticated`);
      expect(maintenanceMigration).toContain(`on public.${table} as restrictive for update to authenticated`);
    }
    for (const bucket of ["capture", "syllabus"]) {
      expect(maintenanceMigration).toContain(`${bucket}_sources_study_writes_available_insert`);
      expect(maintenanceMigration).toContain(`bucket_id <> '${bucket}-sources'`);
    }

    expect(maintenanceMigration).toContain("to authenticated, service_role");
    expect(maintenanceMigration).not.toMatch(/for delete to authenticated/iu);
  });

  it("gates exactly the six study, capture, and syllabus Edge Functions before parsing a body", () => {
    const gatedFunctions = readdirSync(functionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .filter((entry) => {
        const path = resolve(functionRoot, entry.name, "index.ts");
        try {
          return readFileSync(path, "utf8").includes("checkStudyWritesPaused");
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name)
      .sort();

    expect(gatedFunctions).toEqual(protectedFunctions);
    for (const name of protectedFunctions) {
      const source = readFileSync(resolve(functionRoot, name, "index.ts"), "utf8");
      const gate = source.indexOf("await checkStudyWritesPaused(");
      const bodyParse = Math.min(
        ...[source.indexOf("let parsedBody: unknown"), source.indexOf("let parsed: unknown")]
          .filter((index) => index >= 0),
      );
      expect(source).toContain('rpc("get_study_write_pause")');
      expect(source).toContain("STUDY_WRITES_PAUSED_RESPONSE, 503");
      expect(gate).toBeGreaterThan(-1);
      expect(bodyParse).toBeGreaterThan(gate);
    }
  });

  it("orders the pause control before the review guard and the drained lockdown", () => {
    const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
      .filter((name) => name.startsWith("20260827"))
      .sort();

    expect(migrations.indexOf("20260827122500_study_write_pause_control.sql"))
      .toBeGreaterThan(migrations.indexOf("20260827120000_assignment_tutor_mastery_guard.sql"));
    expect(migrations.indexOf("20260827122500_study_write_pause_control.sql"))
      .toBeLessThan(migrations.indexOf("20260827125000_assignment_review_artifact_guard.sql"));
    expect(migrations.indexOf("20260827125000_assignment_review_artifact_guard.sql"))
      .toBeLessThan(migrations.indexOf("20260827125500_study_write_maintenance_guard.sql"));
    expect(migrations.indexOf("20260827125500_study_write_maintenance_guard.sql"))
      .toBeLessThan(migrations.indexOf("20260827126000_family_beta_agreement_acceptance.sql"));
    expect(migrations.indexOf("20260827126000_family_beta_agreement_acceptance.sql"))
      .toBeLessThan(migrations.indexOf("20260827127500_retire_concept_evidence_mirror.sql"));
  });

  it("documents operator pause, drain, lockdown and explicit resume in that order", () => {
    const normalizedRollout = rollout.replace(/\s+/g, " ");
    const pause = normalizedRollout.indexOf("set_study_writes_paused(true");
    const drain = normalizedRollout.indexOf(
      "wait for every invocation of the previous revisions to drain",
      pause,
    );
    const mirror = normalizedRollout.indexOf(
      "20260827127500_retire_concept_evidence_mirror.sql",
      drain,
    );
    const resume = normalizedRollout.indexOf("set_study_writes_paused(false", mirror);

    expect(pause).toBeGreaterThan(-1);
    expect(drain).toBeGreaterThan(pause);
    expect(mirror).toBeGreaterThan(drain);
    expect(resume).toBeGreaterThan(mirror);
  });
});
