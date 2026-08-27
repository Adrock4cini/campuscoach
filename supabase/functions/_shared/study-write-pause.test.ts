import { describe, expect, it, vi } from "vitest";
import {
  checkStudyWritesPaused,
  STUDY_WRITES_PAUSED_REASON,
  STUDY_WRITES_PAUSED_RESPONSE,
} from "./study-write-pause";

describe("study-write rollout pause", () => {
  it("allows a request only when the private control explicitly says open", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { paused: false, reason: null },
      error: null,
    });

    await expect(checkStudyWritesPaused(invoke)).resolves.toEqual({
      blocked: false,
      lookupFailed: false,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("blocks a request while the operator pause is active", async () => {
    await expect(checkStudyWritesPaused(async () => ({
      data: { paused: true, reason: "assignment-source rollout" },
      error: null,
    }))).resolves.toEqual({ blocked: true, lookupFailed: false });
  });

  it.each([
    { label: "RPC error", value: { data: null, error: { message: "offline" } } },
    { label: "missing row", value: { data: null, error: null } },
    { label: "malformed state", value: { data: { paused: "false" }, error: null } },
  ])("fails closed on $label", async ({ value }) => {
    await expect(checkStudyWritesPaused(async () => value)).resolves.toEqual({
      blocked: true,
      lookupFailed: true,
    });
  });

  it("fails closed when the RPC throws", async () => {
    await expect(checkStudyWritesPaused(async () => {
      throw new Error("network failed");
    })).resolves.toEqual({ blocked: true, lookupFailed: true });
  });

  it("exports one stable retryable 503 reason for every blocked call", () => {
    expect(STUDY_WRITES_PAUSED_REASON).toBe("study_writes_paused");
    expect(STUDY_WRITES_PAUSED_RESPONSE).toEqual({
      error: "Study writes are temporarily paused. Please try again shortly.",
      reason: "study_writes_paused",
      retryable: true,
    });
  });
});
