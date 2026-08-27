import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPrivateRequestId,
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "./private-json-response";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("private JSON responses", () => {
  it("marks successful JSON as private and non-sniffable", async () => {
    const response = privateJsonResponse(
      { ok: true },
      200,
      { "Access-Control-Allow-Origin": "*" },
      { requestId: "request-123" },
    );

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Request-ID")).toBe("request-123");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("replaces raw 5xx details with a stable safe body", async () => {
    const response = privateJsonResponse(
      {
        error: "provider returned OCR source text",
        details: "password=secret; source=private assignment",
        providerBody: { prompt: "student content" },
        retryable: true,
      },
      500,
      {},
      { requestId: "request-500" },
    );

    expect(await response.json()).toEqual({
      error: "The study service could not complete the request. Please try again.",
      code: "internal_error",
      requestId: "request-500",
      retryable: true,
    });
  });

  it("preserves only the allowlisted pause reason on a 503", async () => {
    const response = privateJsonResponse(
      { error: "raw database error", reason: "study_writes_paused", details: "private" },
      503,
      {},
      { requestId: "pause-1" },
    );

    expect(await response.json()).toEqual({
      error: "Study writes are temporarily paused. Please try again shortly.",
      code: "study_writes_paused",
      requestId: "pause-1",
      retryable: true,
      reason: "study_writes_paused",
    });
  });

  it("rejects request ids that could inject log lines", () => {
    expect(createPrivateRequestId("safe:id-1")).toBe("safe:id-1");
    expect(createPrivateRequestId("unsafe\nprivate-content")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("logs only the error class, status, and request id", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logPrivateFailure({
      errorClass: "database_lookup_failed",
      status: 503,
      requestId: "request-log-1",
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(JSON.stringify({
      errorClass: "database_lookup_failed",
      status: 503,
      requestId: "request-log-1",
    }));
  });

  it("catches unhandled failures without exposing their message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("https://example.test", {
      headers: { "X-Request-ID": "request-catch-1" },
    });
    const response = await withPrivateJsonErrors(request, {}, async () => {
      throw new Error("private OCR text and provider body");
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The study service could not complete the request. Please try again.",
      code: "internal_error",
      requestId: "request-catch-1",
    });
    expect(spy).toHaveBeenCalledWith(JSON.stringify({
      errorClass: "unhandled_exception",
      status: 500,
      requestId: "request-catch-1",
    }));
    expect(spy.mock.calls.flat().join(" ")).not.toContain("private OCR text");
  });

  it("adds private headers to non-JSON preflight responses", () => {
    const headers = privateResponseHeaders({}, "preflight-1");
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Request-ID")).toBe("preflight-1");
  });

  it.each([
    "../generate-artifact/index.ts",
    "../record-study-result/index.ts",
    "../confirm-assignment-practice-source/index.ts",
    "../extract-concepts/index.ts",
    "../parse-syllabus/index.ts",
    "../process-capture-images/index.ts",
  ])("keeps %s behind the private response boundary", (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");

    expect(source).toContain("withPrivateJsonErrors(req, corsHeaders");
    expect(source).toContain("privateJsonResponse(body, status, corsHeaders");
    expect(source).toContain("privateResponseHeaders(corsHeaders, requestId)");
    expect(source).not.toMatch(/console\.(?:error|warn|log)\s*\(/);
    expect(source).not.toContain("new Response(JSON.stringify(body)");
    expect(source).not.toMatch(/details\s*:\s*\w+(?:\.message)?/);
  });
});
