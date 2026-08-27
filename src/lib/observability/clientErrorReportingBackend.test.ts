import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/report-client-error/index.ts", "utf8");

describe("client error reporting backend boundary", () => {
  it("requires an authenticated account and validates a tiny exact payload", () => {
    expect(source).toContain('authHeader?.startsWith("Bearer ")');
    expect(source).toContain("supabase.auth.getClaims");
    expect(source).toContain("Object.keys(report).some");
    expect(source).toContain("rawBody.length > 4_096");
  });

  it("uses private non-cacheable JSON responses", () => {
    expect(source).toContain('"Cache-Control": "private, no-store"');
    expect(source).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("logs only the approved operational fields", () => {
    const safeLog = source.slice(source.indexOf('console.error("[client-error]"'));
    expect(safeLog).not.toContain("claims.claims.sub");
    expect(safeLog).not.toContain("rawBody,");
    expect(safeLog).not.toContain("message:");
    expect(safeLog).not.toContain("stack:");
  });
});
