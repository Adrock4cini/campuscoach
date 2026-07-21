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
  signalInsert: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
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
    mocks.signalInsert.mockReset().mockResolvedValue({ error: null });
    mocks.getSession.mockReset().mockResolvedValue({
      data: { session: { access_token: "token" } },
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
          insert: mocks.captureInsert,
          update: (value: unknown) => ({
            eq: () => ({
              eq: async () => mocks.captureUpdate(value),
            }),
          }),
        };
      }
      if (table === "campus_brain_signals") return { insert: mocks.signalInsert };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
  });

  it("marks the durable capture failed when the extractor returns an error", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error("Edge Function returned a non-2xx status code"),
    });
    const capture = result();

    await expect(persistCaptureResult(capture)).resolves.toBe("capture-1");

    expect(mocks.captureInsert).toHaveBeenCalledWith(expect.objectContaining({
      processing_status: "processing",
    }));
    expect(mocks.captureUpdate).toHaveBeenCalledWith({ processing_status: "failed" });
    expect(capture.processingStatus).toBe("failed");
    expect(capture.processingMessage).toMatch(/note is safe/i);
  });

  it("only reports ready after the extractor confirms success", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const capture = result();

    await persistCaptureResult(capture);

    expect(capture.processingStatus).toBe("ready");
    expect(mocks.captureUpdate).not.toHaveBeenCalledWith({ processing_status: "failed" });
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
