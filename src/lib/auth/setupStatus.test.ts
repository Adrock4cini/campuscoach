import { describe, expect, it } from "vitest";
import { classifySetupError, resolveSetupStatus, setupErrorCopy } from "./setupStatus";

describe("setup status resolution", () => {
  it("treats a completed profile row as onboarded", () => {
    expect(resolveSetupStatus({ ok: true, hasRow: true, onboardedAt: "2026-01-01T00:00:00Z" }))
      .toEqual({ status: "onboarded", error: null });
  });

  it("treats a row without onboarded_at as a terminal needs_onboarding", () => {
    expect(resolveSetupStatus({ ok: true, hasRow: true, onboardedAt: null }))
      .toEqual({ status: "needs_onboarding", error: null });
  });

  it("treats a missing profile row as a terminal needs_onboarding", () => {
    expect(resolveSetupStatus({ ok: true, hasRow: false, onboardedAt: null }))
      .toEqual({ status: "needs_onboarding", error: null });
  });

  it("treats a failed query as a recoverable error, never as checking", () => {
    expect(resolveSetupStatus({ ok: false, hasRow: false, onboardedAt: null, errorKind: "query" }))
      .toEqual({ status: "error", error: "query" });
    expect(resolveSetupStatus({ ok: false, hasRow: false, onboardedAt: null, errorKind: "timeout" }))
      .toEqual({ status: "error", error: "timeout" });
  });
});

describe("setup error honesty", () => {
  it("only blames the connection for real network failures", () => {
    expect(classifySetupError(new Error("Failed to fetch"))).toBe("network");
    expect(classifySetupError("permission denied for table profiles")).toBe("query");
    expect(setupErrorCopy("query").description).not.toMatch(/offline/i);
    expect(setupErrorCopy("network").description).toMatch(/offline/i);
    expect(setupErrorCopy("timeout").title).toMatch(/too long/i);
  });
});
