/**
 * Journey test — Quick Capture pipeline.
 *
 * Locks the two guarantees the capture flow must ship with:
 *   1. commitCapture returns a well-formed CaptureResult.
 *   2. The result is persisted to the local store and immediately
 *      queryable via listCaptures — this is what powers Class Memory
 *      when offline / anon.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { commitCapture, listCaptures } from "@/lib/capture/processor";

describe("capture journey", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("commits a quick note and surfaces it in Class Memory", async () => {
    const result = await commitCapture("quick-note", {
      classId: "psych101",
      date: "2026-01-01",
      text: "Retrieval cues > free recall.",
    });

    expect(result.id).toMatch(/^cap_/);
    expect(result.kind).toBe("quick-note");
    expect(result.summary).toContain("Retrieval cues");
    expect(result.keyConcepts.length).toBeGreaterThan(0);

    const stored = listCaptures();
    expect(stored[0]?.id).toBe(result.id);
  });

  it("produces flashcards for a recorded lecture", async () => {
    const result = await commitCapture("record-lecture", {
      classId: "psych101",
      date: "2026-01-01",
      topic: "Memory Models",
    });
    expect(result.flashcardCount).toBeGreaterThan(0);
    expect(result.summary.toLowerCase()).toContain("memory models");
  });

  it("does not invent concepts or flashcards for a real text capture", async () => {
    const result = await commitCapture(
      "professor-hint",
      {
        classId: "math",
        date: "2026-07-14",
        text: "The quadratic formula will be on the exam.",
      },
      { simulateDerivedContent: false },
    );

    expect(result.summary).toContain("quadratic formula");
    expect(result.keyConcepts).toEqual([]);
    expect(result.flashcardCount).toBe(0);
  });
});
