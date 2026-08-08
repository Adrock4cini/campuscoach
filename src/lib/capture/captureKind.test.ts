import { describe, expect, it } from "vitest";
import { resolveCaptureKind } from "../../../supabase/functions/_shared/capture-kind.ts";

describe("resolveCaptureKind", () => {
  it("keeps a stored quick note from being relabeled as professor emphasis", () => {
    expect(resolveCaptureKind("quick-note", "professor-hint")).toBe("quick-note");
  });

  it("uses the request kind only when there is no durable capture kind", () => {
    expect(resolveCaptureKind(null, "scan-assignment")).toBe("scan-assignment");
  });
});
