import { describe, expect, it, vi } from "vitest";
import {
  CanaryFailure,
  readCanaryConfiguration,
  runPostdeployCanary,
} from "../../../scripts/postdeploy-canary.mjs";

const RELEASE = "abcdef1234567890";
const ORIGIN = "https://app.campuscompanion.com";
const SUPABASE = "https://norsaaoyppctrvxxgjtg.supabase.co";

function legacyKey(role: "anon" | "service_role") {
  return `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    RELEASE_PRODUCTION_ORIGIN: ORIGIN,
    VITE_SUPABASE_URL: SUPABASE,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key",
    VITE_RELEASE_SHA: RELEASE,
    CANARY_EMAIL: "canary@campuscompanion.com",
    CANARY_PASSWORD: "private-canary-password",
    ...overrides,
  };
}

function privateHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function originHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; object-src 'none'",
    "Permissions-Policy": "camera=(), microphone=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
  };
}

function successfulFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === ORIGIN) {
      return new Response('<script type="module" src="/assets/index.js"></script>', {
        status: 200,
        headers: originHeaders(),
      });
    }
    if (url === `${ORIGIN}/assets/index.js`) return new Response(`const release="${RELEASE}"`, { status: 200 });
    if (url.includes("/auth/v1/token")) {
      return Response.json({ access_token: "a-valid-access-token-for-the-canary" });
    }
    if (url.endsWith("/functions/v1/report-client-error")) {
      return Response.json({ accepted: true }, { status: 202, headers: privateHeaders() });
    }
    if (url.includes("/functions/v1/")) {
      return Response.json({ error: "validation failed" }, { status: 400, headers: privateHeaders() });
    }
    return new Response(null, { status: 404 });
  });
}

describe("post-deploy release canary", () => {
  it("requires credentials and exact release identity without exposing their values", () => {
    expect(() => readCanaryConfiguration(environment({ CANARY_PASSWORD: undefined })))
      .toThrow("CANARY_PASSWORD is required");
    expect(() => readCanaryConfiguration(environment({ VITE_RELEASE_SHA: "not-a-sha" })))
      .toThrow("VITE_RELEASE_SHA must be a git commit SHA");
    expect(() => readCanaryConfiguration(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" })))
      .toThrow("cannot be a secret key");
    expect(() => readCanaryConfiguration(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey("service_role") })))
      .toThrow("cannot be a secret key");
  });

  it("proves the published bundle, auth, zero-AI validation paths, and error signal", async () => {
    const fetchImpl = successfulFetch();
    await expect(runPostdeployCanary(environment(), fetchImpl)).resolves.toEqual({
      ok: true,
      checks: ["published-origin", "published-bundle", "canary-auth", "edge-functions", "error-signal"],
    });
    const functionCalls = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("/functions/v1/"));
    expect(functionCalls).toHaveLength(7);
  });

  it("fails closed when production security headers are absent", async () => {
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () => new Response("ok", { status: 200 }));
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "published-origin",
    });
  });

  it("fails when the deployed function inventory or migration state is unhealthy", async () => {
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === ORIGIN) {
        return new Response('<script src="/assets/index.js"></script>', { status: 200, headers: originHeaders() });
      }
      if (url === `${ORIGIN}/assets/index.js`) return new Response(RELEASE, { status: 200 });
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "a-valid-access-token-for-the-canary" });
      return Response.json({ error: "paused" }, { status: 503, headers: privateHeaders() });
    });
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toEqual(
      expect.objectContaining<Partial<CanaryFailure>>({ check: "function-confirm-assignment-practice-source" }),
    );
  });

  it("never includes canary credentials in a safe failure message", async () => {
    const secret = "never-print-this-canary-secret";
    const fetchImpl = vi.fn().mockRejectedValue(new Error(secret));
    try {
      await runPostdeployCanary(environment({ CANARY_PASSWORD: secret }), fetchImpl);
      throw new Error("expected failure");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
