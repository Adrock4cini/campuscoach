import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260827133000_browser_learning_evidence_write_guard.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
).toLowerCase();
const strategyOutcomeBase = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819071956_a4f3c6be-0c51-4ed9-b2c0-800ad3618730.sql",
  ),
  "utf8",
).toLowerCase();
const privateSignalBase = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260827123000_private_learning_signal_guard.sql",
  ),
  "utf8",
).toLowerCase();
const campusSignalBase = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260706042214_b01c1cb2-23b8-484e-ae87-45b404bafff0.sql",
  ),
  "utf8",
).toLowerCase();
const campusSignalCreation = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260706041801_ebe135d0-a16c-4a99-8dd3-e32b870a28ca.sql",
  ),
  "utf8",
).toLowerCase();
const campusSignalBrowserWriters = [
  "src/lib/supabase/capturePersistence.ts",
  "src/lib/intelligence/aggregateSignals.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8"));

const insertTables = [
  "study_strategy_outcomes",
  "topic_signals",
  "exam_debriefs",
  "campus_brain_signals",
] as const;
const browserUpdateTables = [
  "topic_signals",
  "exam_debriefs",
  "campus_brain_signals",
] as const;

function policyBlock(policyName: string): string {
  const start = migration.indexOf(`create policy ${policyName}`);
  const end = migration.indexOf(";", start);
  expect(start, `missing ${policyName}`).toBeGreaterThan(-1);
  expect(end, `unterminated ${policyName}`).toBeGreaterThan(start);
  return migration.slice(start, end + 1);
}

function insertPolicyBlock(table: (typeof insertTables)[number]): string {
  return policyBlock(`${table}_launch_insert_guard`);
}

describe("browser learning-evidence write guard", () => {
  it.each(insertTables)(
    "requires owner, current agreement, and an open write gate for %s inserts",
    (table) => {
      const policy = insertPolicyBlock(table);
      expect(policy).toContain(
        `on public.${table} as restrictive for insert to authenticated`,
      );
      expect(policy).toContain("user_id = auth.uid()");
      expect(policy).toContain("public.has_current_family_beta_agreement()");
      expect(policy).toContain("public.study_writes_are_available()");
    },
  );

  it("retains the existing bounded feedback-only strategy-outcome semantics", () => {
    expect(insertPolicyBlock("study_strategy_outcomes")).toContain(
      "outcome_source = 'feedback'",
    );
    expect(strategyOutcomeBase).toContain(
      "auth.uid() = user_id and outcome_source = 'feedback'",
    );
    expect(strategyOutcomeBase).toContain("total > 0 and total <= 100");
    expect(strategyOutcomeBase).toContain("correct >= 0 and correct <= total");
    expect(strategyOutcomeBase).toContain(
      "grant all on public.study_strategy_outcomes to service_role",
    );
    expect(migration).not.toContain("force row level security");
    expect(migration).not.toContain(
      "revoke all on public.study_strategy_outcomes",
    );
  });

  it("retains owner inserts and service-role access for raw learning signals", () => {
    for (const table of ["topic_signals", "exam_debriefs"] as const) {
      expect(privateSignalBase).toContain(
        `create policy ${table}_owner_insert`,
      );
      expect(privateSignalBase).toContain(
        `grant all privileges on table public.${table} to service_role`,
      );
      expect(migration).not.toContain(
        `revoke all privileges on table public.${table}`,
      );
    }

    expect(campusSignalBase).toContain(
      'create policy "brain_signals_owner_insert"',
    );
    expect(campusSignalCreation).toContain(
      "grant all on public.campus_brain_signals to service_role",
    );
    expect(migration).not.toContain(
      "revoke all on public.campus_brain_signals",
    );
  });

  it("guards every authenticated update path kept open for browser-owned rows", () => {
    for (const table of browserUpdateTables) {
      const updatePolicy = policyBlock(`${table}_launch_update_guard`);
      expect(updatePolicy).toContain(
        `on public.${table} as restrictive for update to authenticated`,
      );
      expect(updatePolicy).toContain("using (\n    user_id = auth.uid()");
      expect(updatePolicy).toContain("with check (\n    user_id = auth.uid()");
      expect(
        updatePolicy.match(/public\.has_current_family_beta_agreement\(\)/gu),
      ).toHaveLength(2);
      expect(
        updatePolicy.match(/public\.study_writes_are_available\(\)/gu),
      ).toHaveLength(2);
      expect(migration).not.toContain(`${table}_launch_delete_guard`);
    }

    // Owner deletion stays outside the agreement/pause guard so the reviewed
    // account-erasure path remains available while ordinary evidence writes
    // are paused.
    for (const table of ["topic_signals", "exam_debriefs"] as const) {
      expect(privateSignalBase).toContain(
        `create policy ${table}_owner_update`,
      );
      expect(privateSignalBase).toContain(
        `create policy ${table}_owner_delete`,
      );
    }
    expect(campusSignalBase).toContain(
      'create policy "brain_signals_owner_update"',
    );
    expect(campusSignalBase).toContain(
      'create policy "brain_signals_owner_delete"',
    );
  });

  it("retains the guarded browser upsert path for Campus Brain signals", () => {
    for (const source of campusSignalBrowserWriters) {
      expect(source).toContain('.from("campus_brain_signals")');
      expect(source).toContain(".upsert(");
    }
  });

  it("lands after every helper and table policy it composes", () => {
    const migrations = readdirSync(
      resolve(process.cwd(), "supabase/migrations"),
    ).sort();
    const boundary = migrations.indexOf(migrationName);
    expect(boundary).toBeGreaterThan(
      migrations.indexOf("20260827125500_study_write_maintenance_guard.sql"),
    );
    expect(boundary).toBeGreaterThan(
      migrations.indexOf("20260827126500_family_beta_raw_input_guard.sql"),
    );
    expect(boundary).toBeGreaterThan(
      migrations.indexOf("20260827132000_capture_storage_integrity.sql"),
    );
  });
});
