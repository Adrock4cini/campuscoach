import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("student-facing study claims", () => {
  it("does not invent test likelihood, lecture time, or highest-yield status", () => {
    const drawer = readFileSync(
      resolve(process.cwd(), "src/components/capture/CaptureDetailDrawer.tsx"),
      "utf8",
    );
    expect(drawer).not.toContain("spent the most time");
    expect(drawer).not.toContain("likely fair game");
    expect(drawer).not.toContain("highest-yield concept here");
    expect(drawer).toContain("without being treated as a guaranteed test question");
    expect(drawer).toContain("rank it with your test scope and mastery");
  });
});
