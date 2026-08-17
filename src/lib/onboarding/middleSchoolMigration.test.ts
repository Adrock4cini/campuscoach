import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817100000_middle_school_learner_type.sql"),
  "utf8",
);

describe("middle-school learner type migration", () => {
  it("adds middle school without dropping the existing learner options", () => {
    for (const value of ["middle_school", "high_school", "college", "certification", "other"]) {
      expect(sql).toContain(`'${value}'`);
    }
    expect(sql).toMatch(/profiles_learner_type_check/i);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });
});
