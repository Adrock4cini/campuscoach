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
  contributeStudySignal: vi.fn(),
  updateCampusBrainAggregate: vi.fn(),
  activeOwnerId: "user-1" as string | null,
}));

vi.mock("@/lib/supabase/capturePersistence", () => ({
  persistCaptureResult: mocks.persistCaptureResult,
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  contributeStudySignal: mocks.contributeStudySignal,
  getAuthenticatedUserId: () => mocks.activeOwnerId,
  AUTH_OWNER_CHANGED_MESSAGE:
    "Your account changed while this capture was saving. Sign back into the original account and try again.",
}));

vi.mock("@/lib/intelligence/aggregateSignals", () => ({
  extractAggregateSignalFromCapture: vi.fn((capture: { id: string }) => ({
    classId: "psych101",
    sourceId: capture.id,
  })),
  updateCampusBrainAggregate: mocks.updateCampusBrainAggregate,
}));

describe("capture journey", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.activeOwnerId = "user-1";
    mocks.persistCaptureResult.mockReset().mockResolvedValue("remote-capture-id");
    mocks.contributeStudySignal.mockReset().mockResolvedValue(undefined);
    mocks.updateCampusBrainAggregate.mockReset().mockResolvedValue(undefined);
  });

  it("commits a quick note and surfaces it in Class Memory", async () => {
    const result = await commitCapture("quick-note", {
      classId: "psych101",
      date: "2026-01-01",
      text: "Retrieval cues > free recall.",
    });

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(result.kind).toBe("quick-note");
    expect(result.summary).toContain("Retrieval cues");
    expect(result.keyConcepts.length).toBeGreaterThan(0);

    const stored = listCaptures();
    expect(stored[0]?.id).toBe(result.id);
    expect(mocks.persistCaptureResult).not.toHaveBeenCalled();
    expect(mocks.contributeStudySignal).not.toHaveBeenCalled();
    expect(mocks.updateCampusBrainAggregate).not.toHaveBeenCalled();
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

  it("uses truthful neutral copy for a real class that is absent from demo data", async () => {
    const result = await commitCapture(
      "scan-material",
      {
        classId: "b4ae9358-ccbf-4308-9561-f1dc5ad19b6e",
        date: "2026-08-17",
        topic: "Vocabulary review",
      },
      { simulateDerivedContent: false },
    );

    expect(result.summary).toBe("Photos saved — concepts are being added to Class Memory.");
    expect(result.summary).not.toContain("undefined");
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
        ownerId: "user-1",
      },
    );

    expect(mocks.persistCaptureResult).toHaveBeenCalledWith(result, [], "user-1");
    expect(listCaptures()).toEqual([]);
    expect(mocks.contributeStudySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: "math",
        sourceType: "capture:quick-note",
        sourceId: result.id,
        ownerId: "user-1",
        idempotent: true,
      }),
    );
    await vi.waitFor(() => {
      expect(mocks.updateCampusBrainAggregate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: result.id }),
        "user-1",
      );
    });
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
      { simulateDerivedContent: false, requireRemotePersistence: true, ownerId: "user-1" },
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
        { requireRemotePersistence: true, ownerId: "user-1" },
      ),
    ).rejects.toThrow("couldn't save this capture");

    expect(listCaptures()).toEqual([]);
  });

  it("preserves a safe photo-upload recovery message for the retry screen", async () => {
    mocks.persistCaptureResult.mockRejectedValueOnce(
      new Error("We couldn't upload these photos. They are still on this screen—check your connection and try again."),
    );

    await expect(commitCapture(
      "scan-material",
      { classId: "math", date: "2026-08-17", topic: "Flash cards" },
      {
        requireRemotePersistence: true,
        attachments: [new File(["image"], "card.jpg", { type: "image/jpeg" })],
        ownerId: "user-1",
      },
    )).rejects.toThrow("They are still on this screen");
  });

  it("reuses one attempt id when a dropped response is retried", async () => {
    const attemptId = "4b233d3f-b032-4b40-9692-eab19c57b3e4";
    const context = {
      classId: "math",
      date: "2026-08-17",
      text: "Retained draft",
    };

    const first = await commitCapture("quick-note", context, {
      attemptId,
      ownerId: "user-1",
      requireRemotePersistence: true,
      simulateDerivedContent: false,
    });
    const retry = await commitCapture("quick-note", context, {
      attemptId,
      ownerId: "user-1",
      requireRemotePersistence: true,
      simulateDerivedContent: false,
    });

    expect(first.id).toBe(attemptId);
    expect(retry.id).toBe(attemptId);
    expect(mocks.persistCaptureResult).toHaveBeenNthCalledWith(1, first, [], "user-1");
    expect(mocks.persistCaptureResult).toHaveBeenNthCalledWith(2, retry, [], "user-1");
  });

  it("stops before events or signals when the account switches during persistence", async () => {
    mocks.persistCaptureResult.mockImplementationOnce(async () => {
      mocks.activeOwnerId = "user-2";
      return "capture-1";
    });

    await expect(commitCapture(
      "quick-note",
      { classId: "math", date: "2026-08-17", text: "Owner A note" },
      { requireRemotePersistence: true, ownerId: "user-1", simulateDerivedContent: false },
    )).rejects.toThrow("Your account changed");

    expect(mocks.contributeStudySignal).not.toHaveBeenCalled();
    expect(mocks.updateCampusBrainAggregate).not.toHaveBeenCalled();
  });
});
