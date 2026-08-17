import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "@/lib/capture/types";
import {
  persistCaptureResult,
  selectTrustworthyProcessedContent,
} from "./capturePersistence";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  captureInsert: vi.fn(),
  captureUpdate: vi.fn(),
  captureDelete: vi.fn(),
  signalInsert: vi.fn(),
  signalDelete: vi.fn(),
  assignmentDeleteById: vi.fn(),
  assignmentDelete: vi.fn(),
  createAssignment: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  activeOwnerId: "user-1" as string | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  getAnonUserId: () => "user-1",
  getAuthenticatedUserId: () => mocks.activeOwnerId,
  AUTH_OWNER_CHANGED_MESSAGE:
    "Your account changed while this capture was saving. Sign back into the original account and try again.",
}));

vi.mock("@/lib/realData/assignments", () => ({
  createAssignment: mocks.createAssignment,
}));

const result = (): CaptureResult => ({
  id: "local-1",
  kind: "quick-note",
  context: {
    classId: "math",
    date: "2026-07-20",
    topic: "Quadratic Formula",
    text: "The quadratic formula solves equations in standard form.",
  },
  createdAt: "2026-07-20T10:00:00.000Z",
  keyConcepts: [],
  summary: "Note captured",
  flashcardCount: 0,
});

describe("real capture processing integrity", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.captureInsert.mockReset();
    mocks.captureUpdate.mockReset().mockResolvedValue({ error: null });
    mocks.captureDelete.mockReset().mockResolvedValue({ error: null });
    mocks.signalInsert.mockReset().mockResolvedValue({ error: null });
    mocks.signalDelete.mockReset().mockResolvedValue({ error: null });
    mocks.assignmentDeleteById.mockReset();
    mocks.assignmentDelete.mockReset().mockResolvedValue({ error: null });
    mocks.createAssignment.mockReset();
    mocks.activeOwnerId = "user-1";
    mocks.getSession.mockReset().mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-1" } } },
      error: null,
    });
    mocks.invoke.mockReset();

    mocks.captureInsert.mockImplementation(() => ({
      select: () => ({
        maybeSingle: async () => ({ data: { id: "capture-1" }, error: null }),
      }),
    }));

    mocks.from.mockImplementation((table: string) => {
      if (table === "captures") {
        return {
          upsert: mocks.captureInsert,
          update: (value: unknown) => ({
            eq: () => ({
              eq: async () => mocks.captureUpdate(value),
            }),
          }),
          delete: () => ({
            eq: () => ({ eq: mocks.captureDelete }),
          }),
        };
      }
      if (table === "campus_brain_signals") {
        return {
          insert: mocks.signalInsert,
          upsert: mocks.signalInsert,
          delete: () => ({
            eq: () => ({ eq: mocks.signalDelete }),
          }),
        };
      }
      if (table === "assignments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({ data: { id: "assignment-new" }, error: null }),
                  }),
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: (column: string, value: string) => {
              mocks.assignmentDeleteById(column, value);
              return { eq: mocks.assignmentDelete };
            },
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
  });

  it("marks the durable capture failed when the extractor returns an error", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error("Edge Function returned a non-2xx status code"),
    });
    const capture = result();

    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBe("capture-1");

    expect(mocks.captureInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_status: "processing",
        captured_on: "2026-07-20",
      }),
      { onConflict: "user_id,local_id" },
    );
    expect(mocks.captureUpdate).toHaveBeenCalledWith({ processing_status: "failed" });
    expect(capture.processingStatus).toBe("failed");
    expect(capture.processingMessage).toMatch(/note is safe/i);
  });

  it("only reports ready after the extractor confirms success", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const capture = result();

    await persistCaptureResult(capture, [], "user-1");

    expect(capture.processingStatus).toBe("ready");
    expect(mocks.captureUpdate).not.toHaveBeenCalledWith({ processing_status: "failed" });
  });

  it("keeps the capture processing when another extraction already owns it", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, processing: true }, error: null });
    const capture = result();

    await persistCaptureResult(capture, [], "user-1");

    expect(capture.processingStatus).toBe("processing");
    expect(capture.processingMessage).toMatch(/already working/i);
    expect(mocks.captureUpdate).not.toHaveBeenCalledWith({ processing_status: "failed" });
  });

  it("rolls back a just-created assignment when its photo upload cannot start", async () => {
    mocks.createAssignment.mockResolvedValue({ id: "assignment-new" });
    const capture = result();
    capture.kind = "scan-assignment";
    capture.context.assignmentTitle = "Chapter 4 flash cards";
    const photo = new File(["page"], "flash-cards.jpg", { type: "image/jpeg" });

    await expect(persistCaptureResult(capture, [photo], "user-1")).rejects.toThrow(/couldn't upload these photos/i);

    expect(mocks.createAssignment).toHaveBeenCalledWith("user-1", expect.objectContaining({
      title: "Chapter 4 flash cards",
      clientClassId: "math",
    }));
    expect(mocks.captureDelete).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.signalDelete).toHaveBeenCalledWith("source_id", "capture-1");
    expect(mocks.assignmentDeleteById).toHaveBeenCalledWith("id", "assignment-new");
    expect(mocks.assignmentDelete).toHaveBeenCalledWith("user_id", "user-1");
    expect(capture.context.assignmentId).toBeUndefined();
  });

  it("rolls back a just-created assignment when the capture row is not saved", async () => {
    mocks.createAssignment.mockResolvedValue({ id: "assignment-new" });
    mocks.captureInsert.mockImplementationOnce(() => ({
      select: () => ({
        maybeSingle: async () => ({ data: null, error: new Error("offline") }),
      }),
    }));
    const capture = result();
    capture.kind = "scan-assignment";
    capture.context.assignmentTitle = "Chapter 5 questions";

    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBeNull();

    expect(mocks.assignmentDelete).toHaveBeenCalledWith("user_id", "user-1");
    expect(capture.context.assignmentId).toBeUndefined();
  });

  it("keeps a just-created assignment linked after the capture is durable", async () => {
    mocks.createAssignment.mockResolvedValue({ id: "assignment-new" });
    const capture = result();
    capture.kind = "scan-assignment";
    capture.context.assignmentTitle = "Chapter 6 review";
    capture.context.text = undefined;

    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBe("capture-1");

    expect(capture.context.assignmentId).toBe("assignment-new");
    expect(mocks.assignmentDeleteById).not.toHaveBeenCalled();
  });

  it("reconciles a dropped capture response with the same assignment and local ids", async () => {
    mocks.createAssignment.mockResolvedValue({ id: "local-1" });
    mocks.captureInsert
      .mockImplementationOnce(() => ({
        select: () => ({
          maybeSingle: async () => ({ data: null, error: new Error("response dropped") }),
        }),
      }))
      .mockImplementationOnce(() => ({
        select: () => ({
          maybeSingle: async () => ({ data: { id: "capture-1" }, error: null }),
        }),
      }));
    const capture = result();
    capture.kind = "scan-assignment";
    capture.context.text = undefined;
    capture.context.assignmentTitle = "Chapter 7 review";

    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBeNull();
    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBe("capture-1");

    expect(mocks.createAssignment).toHaveBeenCalledTimes(2);
    expect(mocks.createAssignment).toHaveBeenNthCalledWith(1, "user-1", expect.objectContaining({
      id: "local-1",
      title: "Chapter 7 review",
    }));
    expect(mocks.createAssignment).toHaveBeenNthCalledWith(2, "user-1", expect.objectContaining({
      id: "local-1",
      title: "Chapter 7 review",
    }));
    expect(mocks.captureInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ user_id: "user-1", local_id: "local-1" }),
      { onConflict: "user_id,local_id" },
    );
    expect(mocks.captureInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ user_id: "user-1", local_id: "local-1" }),
      { onConflict: "user_id,local_id" },
    );
  });

  it("fails closed before signals when the active account changes after capture persistence", async () => {
    mocks.captureInsert.mockImplementationOnce(() => ({
      select: () => ({
        maybeSingle: async () => {
          mocks.activeOwnerId = "user-2";
          return { data: { id: "capture-a" }, error: null };
        },
      }),
    }));

    await expect(persistCaptureResult(result(), [], "user-1")).rejects.toThrow("Your account changed");

    expect(mocks.captureInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", local_id: "local-1" }),
      { onConflict: "user_id,local_id" },
    );
    expect(mocks.signalInsert).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("prefers real AI output over an older mock row", () => {
    expect(selectTrustworthyProcessedContent([
      {
        summary: "Mock summary",
        key_concepts: ["Core concepts"],
        model: "mock-v1",
        created_at: "2026-07-20T10:00:00.000Z",
      },
      {
        summary: "Grounded summary",
        key_concepts: ["Quadratic Formula"],
        model: "google/gemini-2.5-flash",
        created_at: "2026-07-20T10:01:00.000Z",
      },
    ])?.summary).toBe("Grounded summary");
  });
});
