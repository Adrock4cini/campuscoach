import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readWorker = (name: "extract-concepts" | "process-capture-images") => readFileSync(resolve(
  process.cwd(),
  `supabase/functions/${name}/index.ts`,
), "utf8");

describe.each(["extract-concepts", "process-capture-images"] as const)(
  "%s canonical concept convergence",
  (worker) => {
    const source = readWorker(worker);

    it("ignores only identity conflicts without overwriting stable concept content", () => {
      const writeStart = source.indexOf('.from("concepts")\n      .upsert(conceptRows, {');
      const writeEnd = source.indexOf(";", writeStart);
      const write = source.slice(writeStart, writeEnd);

      expect(writeStart).toBeGreaterThan(-1);
      expect(write).toContain('onConflict: "user_id,class_id,identity_key"');
      expect(write).toContain("ignoreDuplicates: true");
      expect(write).not.toContain("name:");
      expect(write).not.toContain("definition:");
      expect(source).not.toContain('.from("concepts")\n      .insert(conceptRows)');
    });

    it("re-queries winners and uses canonical ids for mastery and evidence", () => {
      const insert = source.indexOf('.from("concepts")\n      .upsert(conceptRows, {');
      const lookup = source.indexOf('.in("identity_key", canonicalIdentityKeys)', insert);
      const resolved = source.indexOf("const resolvedConceptIds =", lookup);
      const masterySeeds = source.indexOf("resolvedConcepts.map", resolved);
      const mastery = source.indexOf('.from("user_concept_mastery")', resolved);
      const evidence = source.indexOf('.from("concept_capture_evidence")', mastery);

      expect(lookup).toBeGreaterThan(insert);
      expect(source.slice(insert, lookup)).toContain("renew");
      expect(resolved).toBeGreaterThan(lookup);
      expect(masterySeeds).toBeGreaterThan(resolved);
      expect(mastery).toBeGreaterThan(masterySeeds);
      expect(mastery).toBeGreaterThan(resolved);
      expect(evidence).toBeGreaterThan(mastery);
      expect(source.slice(evidence, evidence + 500)).toContain("resolvedConceptIds.map");
    });

    it("makes recovery mastery seeding safe when another capture wins the race", () => {
      const missingStart = source.indexOf("const missingMastery =");
      const writeStart = source.indexOf('.from("user_concept_mastery")', missingStart);
      const writeEnd = source.indexOf(";", writeStart);
      const recoveryWrite = source.slice(writeStart, writeEnd);

      expect(missingStart).toBeGreaterThan(-1);
      expect(writeStart).toBeGreaterThan(missingStart);
      expect(recoveryWrite).toContain(".upsert(missingMastery, {");
      expect(recoveryWrite).toContain('onConflict: "user_id,concept_id"');
      expect(recoveryWrite).toContain("ignoreDuplicates: true");
      expect(source).not.toContain('.from("user_concept_mastery")\n          .insert(missingMastery)');
    });
  },
);
