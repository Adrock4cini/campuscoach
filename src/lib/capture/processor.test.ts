/**
 * Journey test — Quick Capture pipeline.
 *
 * Locks the two guarantees the capture flow must ship with:
 *   1. commitCapture returns a well-formed CaptureResult.
 *   2. The result is persisted to the local store and immediately
 *      queryable via listCaptures — this is what powers Class Memory
 *      when offline / anon.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitCapture, listCaptures } from "@/lib/capture/processor";

const mocks = vi.hoisted(() => ({
  persistCaptureResult: vi.fn(),
}));

vi.mock("@/lib/supabase/capturePersistence", () => ({
  persistCaptureResult: mocks.persistCaptureResult,
}));

describe("capture journey", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.persistCaptureResult.mockReset().mockResolvedValue("remote-capture-id");
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

  it("confirms a signed-in capture remotely without putting it in the demo store", async () => {
    const result = await commitCapture(
      "quick-note",
      {
        classId: "math",
        date: "2026-07-20",
        text: "The quadratic formula will be on the exam.",
      },
      {
        simulateDerivedContent: false,
        requireRemotePersistence: true,
      },
    );

    expect(mocks.persistCaptureResult).toHaveBeenCalledWith(result);
    expect(listCaptures()).toEqual([]);
  });

  it("keeps a saved note successful while surfacing a failed AI handoff", async () => {
    mocks.persistCaptureResult.mockImplementationOnce(async (result) => {
      result.processingStatus = "failed";
      result.processingMessage = "Your note is safe, but Campus Brain couldn't finish processing it.";
      return "remote-capture-id";
    });

    const result = await commitCapture(
      "quick-note",
      {
        classId: "math",
        date: "2026-07-20",
        text: "The quadratic formula will be on the exam.",
      },
      { simulateDerivedContent: false, requireRemotePersistence: true },
    );

    expect(result.processingStatus).toBe("failed");
    expect(result.processingMessage).toMatch(/note is safe/i);
    expect(listCaptures()).toEqual([]);
  });

  it("does not report success when a required remote save fails", async () => {
    mocks.persistCaptureResult.mockResolvedValueOnce(null);

    await expect(
      commitCapture(
        "quick-note",
        {
          classId: "math",
          date: "2026-07-20",
          text: "Keep this note visible for retry.",
        },
        { requireRemotePersistence: true },
      ),
    ).rejects.toThrow("couldn't save this capture");

    expect(listCaptures()).toEqual([]);
  });
});
