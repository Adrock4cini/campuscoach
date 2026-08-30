import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const runner = readFileSync(path.resolve(process.cwd(), "src/components/study/RealStudyRunner.tsx"), "utf8");

describe("Make It Stick surfacing", () => {
  it("offers the verified memory trick panel in flashcards and multiple choice", () => {
    expect(runner.match(/<MemoryTrickPanel/g)?.length).toBe(2);
  });

  it("uses the shared verified-trick infrastructure, not a parallel system", () => {
    expect(runner).toContain('import { MemoryTrickPanel } from "@/components/study/MemoryTrickPanel"');
    expect(runner.match(/recordMemoryTrickFeedback\(/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
