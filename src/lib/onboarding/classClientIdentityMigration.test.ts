import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260827134000_class_client_identity_owner_scope.sql",
), "utf8").toLowerCase();

describe("class client identity owner scope migration", () => {
  it("changes both constraints atomically", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*\nbegin;/u);
    expect(migration.trimEnd()).toMatch(/commit;$/u);
  });

  it("preserves the per-owner conflict target before dropping global uniqueness", () => {
    const ownerConstraint = migration.indexOf(
      "add constraint classes_user_client_class_id_unique",
    );
    const globalDrop = migration.indexOf(
      "drop constraint if exists classes_client_class_id_unique",
    );

    expect(ownerConstraint).toBeGreaterThan(-1);
    expect(migration).toContain("unique (user_id, client_class_id)");
    expect(globalDrop).toBeGreaterThan(ownerConstraint);
  });

  it("does not remove the owner-scoped constraint", () => {
    expect(migration).not.toContain(
      "drop constraint if exists classes_user_client_class_id_unique",
    );
  });
});
