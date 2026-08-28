import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("captured material is not learned material", () => {
  it.each([
    "supabase/functions/process-capture-images/index.ts",
    "supabase/functions/extract-concepts/index.ts",
  ])("seeds neutral mastery in %s", (path) => {
    const worker = source(path);
    expect(worker).not.toContain("strength: 0.15");
    expect(worker).toContain("strength: 0,");
    expect(worker).toContain("last_seen_at: null");
  });
});
