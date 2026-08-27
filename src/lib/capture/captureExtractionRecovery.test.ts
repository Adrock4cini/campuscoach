/**
 * P0 — a capture must never stay "processing" forever.
 *
 * Covers the client half of the repair (single extraction per capture, stuck
 * capture retry by id, terminal failure) plus the extractor guarantees that
 * live in the edge function source (bounded stale claim, claim released on
 * every failure branch including unexpected throws).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  captureRow: null as Record<string, unknown> | null,
  materialRows: [] as Array<{ id: string }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const captureSelect = () => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: mocks.captureRow, error: null }),
      }),
    }),
  });
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: null } }) },
      functions: { invoke: mocks.invoke },
      from: (table: string) => ({
        select: (_cols?: string) => (table === "captures"
          ? captureSelect()
          : {
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: mocks.materialRows, error: null }),
              }),
            }),
          }),
        update: (values: Record<string, unknown>) => {
          mocks.updates.push(values);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      }),
    },
  };
});

vi.mock("@/hooks/useClassIntelligence", () => ({
  getAnonUserId: () => "user-1",
  getAuthenticatedUserId: () => "user-1",
  AUTH_OWNER_CHANGED_MESSAGE: "Your account changed",
}));

const extractorSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/extract-concepts/index.ts"),
  "utf8",
);

describe("extract-concepts claim lifecycle", () => {
  it("uses a bounded stale window so an orphaned claim is reclaimable quickly", () => {
    expect(extractorSource).toMatch(/const EXTRACTION_CLAIM_MS = 90 \* 1000;/);
  });

  it("releases the claim as failed when any branch throws unexpectedly", () => {
    expect(extractorSource).toMatch(/await guard\.release\?\.\(\)/);
    expect(extractorSource).toMatch(/if \(claimId\) guard\.release = releaseClaimAsFailed;/);
    expect(extractorSource).toMatch(/processing_status: "failed",[\s\S]{0,120}concept_extraction_claim_id: null/);
  });

  it("repairs an already-extracted capture to ready without calling the AI again", () => {
    const reuseBlock = extractorSource.slice(
      extractorSource.indexOf("if (existingConcepts?.length)"),
      extractorSource.indexOf("// Only one request may process and persist this capture"),
    );
    expect(reuseBlock).toMatch(/processing_status: "ready"/);
    expect(reuseBlock).toMatch(/concept_extraction_claim_id: null/);
    expect(reuseBlock).not.toMatch(/ai\.gateway\.lovable\.dev/);
  });
});

describe("client capture recovery", () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
    mocks.updates.length = 0;
    mocks.materialRows = [];
    mocks.captureRow = {
      id: "capture-1",
      kind: "quick-note",
      raw_text: "The quadratic formula solves equations in standard form.",
      client_class_id: "biol",
      topic: "Quadratics",
    };
  });

  it("retries a stuck text capture exactly once and reaches ready", async () => {
    const { retryCaptureProcessing } = await import("@/lib/supabase/capturePersistence");
    const status = await retryCaptureProcessing("capture-1");

    expect(status).toBe("ready");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      "extract-concepts",
      expect.objectContaining({ body: expect.objectContaining({ captureId: "capture-1" }) }),
    );
  });

  it("leaves the capture processing (never ready) while the extractor still owns the claim", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, processing: true }, error: null });
    const { retryCaptureProcessing } = await import("@/lib/supabase/capturePersistence");

    await expect(retryCaptureProcessing("capture-1")).resolves.toBe("processing");
  });

  it("leaves terminal failure ownership to the server when the extractor errors", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("boom") });
    const { retryCaptureProcessing } = await import("@/lib/supabase/capturePersistence");

    await expect(retryCaptureProcessing("capture-1")).rejects.toThrow();
    // Browser capture UPDATE is intentionally revoked. The Edge worker owns
    // the processing claim and is responsible for releasing it as failed.
    expect(mocks.updates).toEqual([]);
  });

  it("retries an image capture through the OCR function instead of the extractor", async () => {
    mocks.captureRow = {
      id: "capture-2",
      kind: "scan-material",
      raw_text: null,
      client_class_id: "biol",
      topic: null,
    };
    mocks.materialRows = [{ id: "material-1" }];
    const { retryCaptureProcessing } = await import("@/lib/supabase/capturePersistence");

    await retryCaptureProcessing("capture-2");
    expect(mocks.invoke).toHaveBeenCalledWith(
      "process-capture-images",
      expect.objectContaining({ body: expect.objectContaining({ captureId: "capture-2" }) }),
    );
  });
});
