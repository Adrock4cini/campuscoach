import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkCaptureConceptReadiness } from "./captureReadiness";

const state = vi.hoisted(() => ({
  conceptCount: 0 as number | null,
  conceptError: null as unknown,
  captureStatus: "ready" as string | null,
  captureError: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "concepts") {
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve({ count: state.conceptCount, error: state.conceptError }),
        };
        return chain;
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({
          data: state.captureStatus === null ? null : { processing_status: state.captureStatus },
          error: state.captureError,
        }),
      };
      return chain;
    },
  },
}));

describe("checkCaptureConceptReadiness", () => {
  beforeEach(() => {
    state.conceptCount = 0;
    state.conceptError = null;
    state.captureStatus = "ready";
    state.captureError = null;
  });

  it("reports ready once concepts exist for the capture", async () => {
    state.conceptCount = 3;
    await expect(checkCaptureConceptReadiness("capture-1"))
      .resolves.toEqual({ state: "ready", conceptCount: 3 });
  });

  it("reports processing while extraction is still running", async () => {
    state.captureStatus = "processing";
    await expect(checkCaptureConceptReadiness("capture-1"))
      .resolves.toEqual({ state: "processing" });
  });

  it("treats a not-yet-visible capture row as processing, never as empty", async () => {
    state.captureStatus = null;
    await expect(checkCaptureConceptReadiness("capture-1"))
      .resolves.toEqual({ state: "processing" });
  });

  it("reports empty when processing finished with no concepts", async () => {
    state.captureStatus = "ready";
    await expect(checkCaptureConceptReadiness("capture-1"))
      .resolves.toEqual({ state: "empty" });
  });

  it("falls back to unknown when the probe itself fails", async () => {
    state.conceptError = { message: "network" };
    await expect(checkCaptureConceptReadiness("capture-1"))
      .resolves.toEqual({ state: "unknown" });
  });
});
