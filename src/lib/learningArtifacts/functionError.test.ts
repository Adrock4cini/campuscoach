import { describe, expect, it } from "vitest";
import { describeFunctionError, readFunctionErrorDetails } from "./functionError";

describe("describeFunctionError", () => {
  it("reads the edge-function response body instead of showing non-2xx", async () => {
    const context = new Response(
      JSON.stringify({ error: "No concepts found for this request" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    await expect(describeFunctionError({ message: "Edge Function returned a non-2xx status code", context }))
      .resolves.toContain("Add a quick note or teacher hint");
  });

  it("preserves an existing set when a server error occurs", async () => {
    const context = new Response(
      JSON.stringify({ error: "generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );

    await expect(describeFunctionError({ context }))
      .resolves.toContain("existing study set is still safe");
  });
});

describe("readFunctionErrorDetails", () => {
  it("exposes machine-readable retry guidance without matching error prose", async () => {
    const context = new Response(JSON.stringify({
      error: "Build a fresh check.",
      reason: "challenge_unavailable",
      retryable: false,
    }), { status: 409, headers: { "Content-Type": "application/json" } });

    await expect(readFunctionErrorDetails({ message: "non-2xx", context })).resolves.toEqual({
      message: "Build a fresh check.",
      reason: "challenge_unavailable",
      retryable: false,
      status: 409,
    });
  });
});

describe("rate limited generation", () => {
  it("offers a wait-and-retry path instead of a dead end", async () => {
    const message = await describeFunctionError({
      message: "non-2xx",
      context: new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    });
    expect(message).toMatch(/wait about 2 minutes/i);
    expect(message).toMatch(/still saved/i);
  });

  it("falls back to a generic wait when no retry-after header is sent", async () => {
    const message = await describeFunctionError({
      message: "non-2xx",
      context: new Response("{}", { status: 429 }),
    });
    expect(message).toMatch(/wait a minute/i);
  });
});
