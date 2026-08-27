import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260827123000_private_learning_signal_guard.sql";
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations",
  migrationName,
), "utf8");
const mcpTombstone = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/mcp/index.ts",
), "utf8");
const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

function policyBlock(name: string, nextMarker: string): string {
  const start = migration.indexOf(`create policy ${name}`);
  const end = migration.indexOf(nextMarker, start + 1);
  expect(start, `missing policy ${name}`).toBeGreaterThan(-1);
  expect(end, `missing marker after ${name}: ${nextMarker}`).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("private learning-signal launch boundary", () => {
  it("removes every legacy policy before installing the launch policy set", () => {
    expect(migration).toContain("from pg_catalog.pg_policies");
    expect(migration).toContain("tablename in ('topic_signals', 'exam_debriefs', 'topic_scores')");
    expect(migration).toContain("drop policy if exists %I on public.%I");
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it.each(["topic_signals", "exam_debriefs"])(
    "makes every %s operation authenticated and owner-only",
    (table) => {
      const policies = ["select", "insert", "update", "delete"] as const;
      for (const [index, operation] of policies.entries()) {
        const next = index < policies.length - 1
          ? `create policy ${table}_owner_${policies[index + 1]}`
          : table === "topic_signals"
            ? "create policy exam_debriefs_owner_select"
            : "-- Table grants are a second boundary";
        const block = policyBlock(`${table}_owner_${operation}`, next);
        expect(block).toContain(`for ${operation}`);
        expect(block).toContain("to authenticated");
        if (operation !== "insert") {
          expect(block).toContain("using (auth.uid() = user_id)");
        }
        if (operation === "insert" || operation === "update") {
          expect(block).toContain("with check (auth.uid() = user_id)");
        }
      }
    },
  );

  it("removes anonymous grants while retaining owner CRUD and service access", () => {
    for (const table of ["topic_signals", "exam_debriefs"]) {
      expect(migration).toContain(
        `revoke all privileges on table public.${table}\n  from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant select, insert, update, delete on table public.${table}\n  to authenticated`,
      );
      expect(migration).toContain(
        `grant all privileges on table public.${table} to service_role`,
      );
    }
  });

  it("keeps topic scores service-only for launch", () => {
    expect(migration).toContain(
      "revoke all privileges on table public.topic_scores\n  from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant all privileges on table public.topic_scores to service_role",
    );
    expect(migration).not.toContain("create policy topic_scores");
  });

  it("retires the demo MCP endpoint instead of exposing static coursework", () => {
    expect(mcpTombstone).toContain("endpoint_retired");
    expect(mcpTombstone).toContain("410");
    expect(mcpTombstone).not.toContain("@lovable.dev/mcp-js");
    expect(mcpTombstone).not.toContain("list_classes");
    expect(viteConfig).not.toContain("mcpPlugin");
    expect(
      existsSync(resolve(process.cwd(), ".lovable/mcp/manifest.json")),
    ).toBe(false);
  });

  it("lands after the pause boundary and before stable course-map seeding", () => {
    const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(migrations.indexOf(migrationName)).toBeGreaterThan(
      migrations.indexOf("20260827122500_study_write_pause_control.sql"),
    );
    expect(migrations.indexOf(migrationName)).toBeLessThan(
      migrations.indexOf("20260827124000_course_map_stable_guard.sql"),
    );
  });
});
