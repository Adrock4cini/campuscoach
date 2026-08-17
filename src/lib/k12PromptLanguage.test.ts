import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const functionSources = [
  "parse-syllabus",
  "process-capture-images",
  "extract-concepts",
  "generate-artifact",
].map((name) =>
  readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8")
);

describe("age-neutral AI prompt language", () => {
  it("addresses students without assuming they attend college", () => {
    for (const source of functionSources) {
      expect(source).not.toMatch(/college student|college syllabus/i);
    }
  });

  it("keeps extraction and study generation grounded in class materials", () => {
    expect(functionSources[0]).toContain("for a student from class materials such as a syllabus");
    expect(functionSources[1]).toContain("student-friendly definitions and examples grounded only in the pages");
    expect(functionSources[2]).toContain("Never invent content not present in the source");
    expect(functionSources[3]).toContain("grounded ONLY in the concepts provided");
  });

  it("uses teacher-or-instructor language while retaining the stored schema key", () => {
    expect(functionSources[0]).toContain('"professor": string|null,             // teacher or instructor name');
    expect(functionSources[2]).toContain("teacher or instructor flagged this as important");
    expect(functionSources[3]).toContain("Teacher/instructor emphasis:");
  });
});
