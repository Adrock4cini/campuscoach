import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeEdgeFunction } = vi.hoisted(() => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({ data: { accepted: true }, error: null }),
}));

vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction }));

import {
  buildClientErrorReport,
  installGlobalErrorReporting,
  reportClientError,
  resetClientErrorReportLimitForTests,
  sanitizeErrorRoute,
} from "./clientErrorReporter";

describe("client error reporting", () => {
  beforeEach(() => {
    resetClientErrorReportLimitForTests();
    invokeEdgeFunction.mockClear();
    vi.stubEnv("VITE_RELEASE_SHA", "abcdef1234567890");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("redacts UUID and opaque route segments and removes query data", () => {
    expect(sanitizeErrorRoute("/assignments/123e4567-e89b-42d3-a456-426614174000?student=private"))
      .toBe("/assignments/:id");
    expect(sanitizeErrorRoute("/captures/averylongopaqueidentifier12345"))
      .toBe("/captures/:id");
  });

  it("builds a payload without messages, stacks, content, or user identifiers", () => {
    const report = buildClientErrorReport({
      kind: "render",
      errorName: "TypeError",
      route: "/study-lab?answer=private",
    });
    expect(report).toMatchObject({
      eventKind: "render",
      errorName: "TypeError",
      release: "abcdef1234567890",
      route: "/study-lab",
    });
    expect(Object.keys(report).sort()).toEqual([
      "errorName",
      "eventId",
      "eventKind",
      "release",
      "route",
    ]);
  });

  it("sends a bounded report through the authenticated Edge client", async () => {
    reportClientError({ kind: "render", errorName: "TypeError", route: "/dashboard" });
    await vi.waitFor(() => expect(invokeEdgeFunction).toHaveBeenCalledOnce());
    expect(invokeEdgeFunction).toHaveBeenCalledWith("report-client-error", expect.objectContaining({
      timeoutMs: 4_000,
      body: expect.objectContaining({ route: "/dashboard" }),
    }));
  });

  it("installs global error and rejection listeners", async () => {
    const uninstall = installGlobalErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("private message") }));
    const rejection = new Event("unhandledrejection");
    Object.defineProperty(rejection, "reason", { value: new RangeError("private rejection") });
    window.dispatchEvent(rejection);
    await vi.waitFor(() => expect(invokeEdgeFunction).toHaveBeenCalledTimes(2));
    expect(invokeEdgeFunction.mock.calls.map((call) => call[1].body.errorName)).toEqual([
      "TypeError",
      "RangeError",
    ]);
    uninstall();
  });
});
