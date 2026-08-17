import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817110000_backfill_onboarding_completion.sql"),
  "utf8",
);

describe("onboarding completion marker migration", () => {
  it("backfills only pre-existing accounts with durable active classes", () => {
    expect(sql).toMatch(/UPDATE public\.profiles[\s\S]*onboarded_at = now\(\)/i);
    expect(sql).toMatch(/profile\.onboarded_at IS NULL/i);
    expect(sql).toMatch(/course\.user_id = profile\.user_id/i);
    expect(sql).toMatch(/course\.source_archived_at IS NULL/i);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });
});
