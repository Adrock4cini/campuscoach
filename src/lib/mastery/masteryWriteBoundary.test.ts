import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const extractConcepts = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/extract-concepts/index.ts",
), "utf8");
const processCaptureImages = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/process-capture-images/index.ts",
), "utf8");

function masteryClients(source: string): string[] {
  return [...source.matchAll(
    /await\s+([A-Za-z][A-Za-z0-9]*)\s*\n\s*\.from\("user_concept_mastery"\)/g,
  )].map((match) => match[1]);
}

function conceptInsertClient(source: string): string | undefined {
  return source.match(
    /await\s+([A-Za-z][A-Za-z0-9]*)\s*\n\s*\.from\("concepts"\)\s*\n\s*\.insert\(/,
  )?.[1];
}

describe("server-only mastery write boundary", () => {
  it("creates extract-concepts' admin client only after verifying the JWT owner", () => {
    expect(extractConcepts).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(extractConcepts).toContain('return json({ error: "Service unavailable" }, 503)');
    expect(extractConcepts.indexOf("claims.claims.sub as string")).toBeLessThan(
      extractConcepts.indexOf("const adminClient = createClient(supabaseUrl, serviceRoleKey"),
    );
  });

  it("routes every mastery read and write through the admin client", () => {
    expect(masteryClients(extractConcepts)).toEqual([
      "adminClient",
      "adminClient",
      "adminClient",
      // Reinforcement upsert for concepts that already existed (dedupe path).
      "adminClient",
    ]);

    expect(masteryClients(processCaptureImages)).toEqual([
      "adminClient",
      "adminClient",
      "adminClient",
    ]);
  });

  it("keeps explicit authenticated-user scoping on mastery recovery and seeds", () => {
    for (const source of [extractConcepts, processCaptureImages]) {
      expect(source).toContain('.eq("user_id", userId)');
      expect(source.match(/user_id: userId/g)?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses the admin client only after explicit class/capture ownership checks", () => {
    expect(conceptInsertClient(extractConcepts)).toBe("adminClient");
    expect(conceptInsertClient(processCaptureImages)).toBe("adminClient");
    expect(extractConcepts).toContain('ownedClassQuery.eq("id", resolvedClassId)');
    expect(extractConcepts).toContain('.eq("user_id", userId)');
    expect(processCaptureImages).toContain('.eq("client_class_id", capture.client_class_id)');
    expect(processCaptureImages).toContain("existing.some((concept) => concept.class_id !== ownedClass.id)");
  });
});
