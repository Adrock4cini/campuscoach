import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "@/lib/capture/types";
import {
  persistCaptureResult,
  retryCaptureConcepts,
  retryCaptureProcessing,
  selectTrustworthyProcessedContent,
} from "./capturePersistence";
import { EDGE_FUNCTION_TIMEOUT_MS } from "./invokeEdgeFunction";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  captureInsert: vi.fn(),
  captureRecover: vi.fn(),
  captureUpdate: vi.fn(),
  captureDelete: vi.fn(),
  signalInsert: vi.fn(),
  signalDelete: vi.fn(),
  assignmentDeleteById: vi.fn(),
  assignmentDelete: vi.fn(),
  createAssignment: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  materialInsert: vi.fn(),
  materialRecover: vi.fn(),
  materialDelete: vi.fn(),
  lastCaptureValues: null as Record<string, unknown> | null,
  activeOwnerId: "user-1" as string | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
    storage: { from: mocks.storageFrom },
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
  createAssignmentAttempt: async (...args: unknown[]) => {
    const value = await mocks.createAssignment(...args);
    return value && typeof value === "object" && "assignment" in value
      ? value
      : { assignment: value ?? null, created: !!value, conflict: false };
  },
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

const PHOTO_OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PHOTO_CAPTURE_ID = "22222222-2222-4222-8222-222222222222";

function usePhotoUuidIdentity() {
  mocks.activeOwnerId = PHOTO_OWNER_ID;
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "token", user: { id: PHOTO_OWNER_ID } } },
    error: null,
  });
  mocks.captureInsert.mockImplementation(() => ({
    select: () => ({
      maybeSingle: async () => ({ data: { id: PHOTO_CAPTURE_ID }, error: null }),
    }),
  }));
}

function hashablePhoto(contents: string, name: string): File {
  const bytes = new TextEncoder().encode(contents);
  const file = new File([bytes], name, { type: "image/jpeg" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  });
  return file;
}

describe("real capture processing integrity", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.captureInsert.mockReset();
    mocks.captureRecover.mockReset().mockImplementation(async () => ({
      data: { id: "capture-1", meta: mocks.lastCaptureValues?.meta ?? {} },
      error: null,
    }));
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
    mocks.upload.mockReset().mockResolvedValue({ error: new Error("offline") });
    mocks.remove.mockReset().mockResolvedValue({ error: null });
    mocks.storageFrom.mockReset().mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
    });
    mocks.materialInsert.mockReset();
    mocks.materialRecover.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.materialDelete.mockReset().mockResolvedValue({ error: null });
    mocks.lastCaptureValues = null;

    mocks.captureInsert.mockImplementation(() => ({
      select: () => ({
        maybeSingle: async () => ({ data: { id: "capture-1" }, error: null }),
      }),
    }));

    mocks.from.mockImplementation((table: string) => {
      if (table === "classes") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: { id: "class-uuid-1" }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "captures") {
        return {
          insert: (value: Record<string, unknown>) => {
            mocks.lastCaptureValues = value;
            return mocks.captureInsert(value);
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mocks.captureRecover,
              }),
            }),
          }),
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
        // Chainable filter stub: the ownership query shape may change without
        // breaking every unrelated capture test.
        const chain = () => {
          const node: Record<string, unknown> = {
            maybeSingle: async () => mocks.assignmentOwnershipLookup(),
          };
          node.eq = () => chain();
          node.is = () => chain();
          return node;
        };
        return {
          select: () => chain(),
          delete: () => ({
            eq: (column: string, value: string) => {
              mocks.assignmentDeleteById(column, value);
              return { eq: mocks.assignmentDelete };
            },
          }),
        };
      }

      if (table === "materials") {
        return {
          insert: mocks.materialInsert,
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: mocks.materialRecover }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: () => ({ in: mocks.materialDelete }),
            }),
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
  });

  it("reports failure locally while the server owns durable capture status", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error("Edge Function returned a non-2xx status code"),
    });
    const capture = result();

    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBe("capture-1");

    expect(mocks.captureInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        class_id: "class-uuid-1",
        processing_status: "processing",
        captured_on: "2026-07-20",
      }),
    );
    expect(mocks.captureUpdate).not.toHaveBeenCalled();
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

  it("keeps the durable assignment and capture retryable when photo upload cannot start", async () => {
    usePhotoUuidIdentity();
    mocks.createAssignment.mockResolvedValue({ id: "assignment-new" });
    const capture = result();
    capture.kind = "scan-assignment";
    capture.context.assignmentTitle = "Chapter 4 flash cards";
    const photo = hashablePhoto("page", "flash-cards.jpg");

    await expect(persistCaptureResult(capture, [photo], PHOTO_OWNER_ID)).rejects.toThrow(/couldn't upload these photos/i);

    expect(mocks.createAssignment).toHaveBeenCalledWith(PHOTO_OWNER_ID, expect.objectContaining({
      title: "Chapter 4 flash cards",
      clientClassId: "math",
      classUuid: "class-uuid-1",
    }));
    expect(mocks.captureDelete).not.toHaveBeenCalled();
    expect(mocks.signalDelete).not.toHaveBeenCalled();
    expect(mocks.assignmentDeleteById).not.toHaveBeenCalled();
    expect(mocks.assignmentDelete).not.toHaveBeenCalled();
    expect(capture.captureId).toBe(PHOTO_CAPTURE_ID);
    expect(capture.context.assignmentId).toBeUndefined();
  });

  it("reconciles an exact immutable photo retry without overwriting the Storage object", async () => {
    usePhotoUuidIdentity();
    let attemptedMaterial: Record<string, unknown> | null = null;
    mocks.upload.mockResolvedValue({
      error: { statusCode: "409", message: "The resource already exists" },
    });
    mocks.materialInsert.mockImplementation((value: Record<string, unknown>) => {
      attemptedMaterial = value;
      return {
        select: () => ({
          maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
        }),
      };
    });
    mocks.materialRecover.mockImplementation(async () => ({
      data: { id: "material-1", ...attemptedMaterial },
      error: null,
    }));
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const capture = result();
    capture.kind = "scan-material";
    const photo = hashablePhoto("same page", "page.jpg");

    await expect(persistCaptureResult(capture, [photo], PHOTO_OWNER_ID)).resolves.toBe(PHOTO_CAPTURE_ID);

    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${PHOTO_OWNER_ID}/${PHOTO_CAPTURE_ID}/[0-9a-f]{64}\\.jpg$`)),
      photo,
      expect.objectContaining({ upsert: false }),
    );
    expect(mocks.invoke).toHaveBeenCalledWith("process-capture-images", expect.objectContaining({
      body: { captureId: PHOTO_CAPTURE_ID, materialIds: ["material-1"] },
    }));
    expect(mocks.captureDelete).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects a changed page retry without deleting the first durable capture", async () => {
    usePhotoUuidIdentity();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.materialInsert.mockImplementation(() => ({
      select: () => ({
        maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
      }),
    }));
    mocks.materialRecover.mockResolvedValue({
      data: {
        id: "material-first",
        capture_id: PHOTO_CAPTURE_ID,
        user_id: PHOTO_OWNER_ID,
        kind: "image",
        storage_path: `${PHOTO_OWNER_ID}/${PHOTO_CAPTURE_ID}/${"a".repeat(64)}.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 10,
        content_hash: "a".repeat(64),
        original_name: "first.jpg",
        page_index: 0,
        visibility: "private",
        anonymized: false,
      },
      error: null,
    });
    const capture = result();
    capture.kind = "scan-material";
    const changedPhoto = hashablePhoto("changed page", "changed.jpg");

    await expect(persistCaptureResult(capture, [changedPhoto], PHOTO_OWNER_ID))
      .rejects.toThrow(/already saved with different photos/i);

    expect(mocks.captureDelete).not.toHaveBeenCalled();
    expect(mocks.signalDelete).not.toHaveBeenCalled();
    expect(mocks.materialDelete).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
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

  it("returns the server review candidate for a typed assignment capture", async () => {
    mocks.createAssignment.mockResolvedValue({ id: "assignment-new" });
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        concepts: [],
        practiceSourceStatus: "needs_review",
        practiceSourceText: "What is 14% of 50?",
        practiceSourceVersion: 1,
      },
      error: null,
    });
    const capture = result();
    capture.kind = "scan-assignment";
    capture.context.assignmentTitle = "Percent practice";
    capture.context.text = "What is 14% of 50?";

    await expect(persistCaptureResult(capture, [], "user-1")).resolves.toBe("capture-1");

    expect(mocks.invoke).toHaveBeenCalledWith("extract-concepts", expect.objectContaining({
      body: expect.objectContaining({
        captureId: "capture-1",
        kind: "scan-assignment",
        rawText: "What is 14% of 50?",
      }),
      signal: expect.any(AbortSignal),
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    }));
    expect(capture.practiceSource).toEqual(expect.objectContaining({
      status: "needs_review",
      text: "What is 14% of 50?",
      version: 1,
    }));
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
          maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
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
    );
    expect(mocks.captureInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ user_id: "user-1", local_id: "local-1" }),
    );
  });

  it("rejects a changed local-id retry before mutating the saved capture", async () => {
    mocks.captureInsert.mockImplementationOnce(() => ({
      select: () => ({
        maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
      }),
    }));
    mocks.captureRecover.mockResolvedValueOnce({
      data: {
        id: "capture-existing",
        meta: { captureRequestFingerprint: "f".repeat(64) },
      },
      error: null,
    });
    const capture = result();
    capture.context.topic = "Changed topic";

    await expect(persistCaptureResult(capture, [], "user-1"))
      .rejects.toThrow(/retry no longer matches the saved capture/i);

    expect(mocks.signalInsert).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.captureDelete).not.toHaveBeenCalled();
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

  it("treats fingerprinted mock-v1 rows as mock output", () => {
    expect(selectTrustworthyProcessedContent([
      {
        summary: "Grounded summary",
        key_concepts: ["Quadratic Formula"],
        model: "google/gemini-2.5-flash:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        created_at: "2026-07-20T10:01:00.000Z",
      },
      {
        summary: "Newer mock summary",
        key_concepts: ["Core concepts"],
        model: "mock-v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        created_at: "2026-07-20T10:02:00.000Z",
      },
    ])?.summary).toBe("Grounded summary");
  });

  it("retries every assignment photo through image processing even when OCR text exists", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "captures") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "capture-assignment",
                    kind: "scan-assignment",
                    raw_text: "What is 14% of 50?",
                    client_class_id: "math",
                    topic: "Percents",
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: (value: unknown) => ({
            eq: () => ({
              eq: async () => mocks.captureUpdate(value),
            }),
          }),
        };
      }
      if (table === "materials") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ id: "material-1" }, { id: "material-2" }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        practiceSourceStatus: "needs_review",
        practiceSourceText: "What is 14% of 50?",
        practiceSourceVersion: 2,
      },
      error: null,
    });

    await expect(retryCaptureProcessing("capture-assignment")).resolves.toBe("ready");

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("process-capture-images", expect.objectContaining({
      body: {
        captureId: "capture-assignment",
        materialIds: ["material-1", "material-2"],
      },
      signal: expect.any(AbortSignal),
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    }));
    expect(mocks.invoke).not.toHaveBeenCalledWith("extract-concepts", expect.anything());
  });

  it("keeps non-assignment text retries on concept extraction", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table !== "captures") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "capture-note",
                  kind: "quick-note",
                  raw_text: "A debit increases Cash.",
                  client_class_id: "accounting",
                  topic: "Debits",
                },
                error: null,
              }),
            }),
          }),
        }),
        update: (value: unknown) => ({
          eq: () => ({
            eq: async () => mocks.captureUpdate(value),
          }),
        }),
      };
    });
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(retryCaptureProcessing("capture-note")).resolves.toBe("ready");

    expect(mocks.invoke).toHaveBeenCalledWith("extract-concepts", expect.objectContaining({
      body: expect.objectContaining({
        captureId: "capture-note",
        kind: "quick-note",
        rawText: "A debit increases Cash.",
      }),
    }));
    expect(mocks.invoke).not.toHaveBeenCalledWith("process-capture-images", expect.anything());
  });

  it("routes typed assignments without images through the safe text review branch", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "captures") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "capture-typed-assignment",
                    kind: "scan-assignment",
                    raw_text: "What is 14% of 50?",
                    client_class_id: "math",
                    topic: "Percents",
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: (value: unknown) => ({
            eq: () => ({
              eq: async () => mocks.captureUpdate(value),
            }),
          }),
        };
      }
      if (table === "materials") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        concepts: [],
        practiceSourceStatus: "needs_review",
        practiceSourceText: "What is 14% of 50?",
        practiceSourceVersion: 2,
      },
      error: null,
    });

    await expect(retryCaptureProcessing("capture-typed-assignment")).resolves.toBe("ready");

    expect(mocks.invoke).toHaveBeenCalledWith("extract-concepts", expect.objectContaining({
      body: expect.objectContaining({
        captureId: "capture-typed-assignment",
        kind: "scan-assignment",
        rawText: "What is 14% of 50?",
      }),
    }));
    expect(mocks.invoke).not.toHaveBeenCalledWith("process-capture-images", expect.anything());
  });

  it("allows direct assignment text retries only through the server review endpoint", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        concepts: [],
        practiceSourceStatus: "needs_review",
        practiceSourceText: "What is 14% of 50?",
        practiceSourceVersion: 2,
      },
      error: null,
    });

    await expect(retryCaptureConcepts({
      id: "capture-assignment",
      kind: "scan-assignment",
      clientClassId: "math",
      rawText: "What is 14% of 50?",
    })).resolves.toBe("ready");

    expect(mocks.invoke).toHaveBeenCalledWith("extract-concepts", expect.objectContaining({
      body: expect.objectContaining({
        captureId: "capture-assignment",
        kind: "scan-assignment",
      }),
    }));
  });
});
