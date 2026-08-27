import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CanaryFailure,
  FORBIDDEN_EDGE_FUNCTIONS,
  readCanaryConfiguration,
  REVIEWED_EDGE_FUNCTIONS,
  runPostdeployCanary,
} from "../../../scripts/postdeploy-canary.mjs";

const RELEASE = "abcdef1234567890abcdef1234567890abcdef12";
const ORIGIN = "https://app.campuscompanion.com";
const SUPABASE = "https://norsaaoyppctrvxxgjtg.supabase.co";
const ACCEPTED_EMAIL = "canary@campuscompanion.com";
const UNACCEPTED_EMAIL = "unaccepted-canary@campuscompanion.com";
const ACCEPTED_TOKEN = "accepted-canary-access-token-value";
const UNACCEPTED_TOKEN = "unaccepted-canary-access-token";
const ACCEPTED_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UNACCEPTED_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

function legacyKey(role: "anon" | "service_role") {
  return `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    RELEASE_PRODUCTION_ORIGIN: ORIGIN,
    VITE_SUPABASE_URL: SUPABASE,
    VITE_SUPABASE_PROJECT_ID: "norsaaoyppctrvxxgjtg",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key",
    VITE_PUBLIC_SUPPORT_EMAIL: "support@campuscompanion.app",
    VITE_PUBLIC_SIGNUPS_ENABLED: "false",
    VITE_CANVAS_CONNECT_ENABLED: "false",
    VITE_PASSKEYS_ENABLED: "false",
    VITE_RELEASE_SHA: RELEASE,
    CANARY_EMAIL: ACCEPTED_EMAIL,
    CANARY_PASSWORD: "private-canary-password",
    UNACCEPTED_CANARY_EMAIL: UNACCEPTED_EMAIL,
    UNACCEPTED_CANARY_PASSWORD: "private-unaccepted-canary-password",
    ...overrides,
  };
}

function privateHeaders(
  extra: Record<string, string> = {},
  requestId: string = crypto.randomUUID(),
) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
    ...extra,
  };
}

function originHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; object-src 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
  };
}

function successfulFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const requestId = new Headers(init?.headers).get("x-request-id") ?? crypto.randomUUID();
    if (url === ORIGIN) {
      return new Response('<script type="module" src="/assets/index.js"></script>', {
        status: 200,
        headers: originHeaders(),
      });
    }
    if (url === `${ORIGIN}/dashboard`) {
      return new Response('<script type="module" src="/assets/index.js"></script>', {
        status: 200,
        headers: originHeaders(),
      });
    }
    if (url === `${ORIGIN}/assets/index.js`) return new Response(`const release="${RELEASE}"`, { status: 200 });
    if (url.startsWith(`${ORIGIN}/release-manifest.json?`)) {
      return Response.json({
        schemaVersion: 1,
        releaseSha: RELEASE,
        supabaseProjectId: "norsaaoyppctrvxxgjtg",
        publicSignupsEnabled: false,
        canvasConnectEnabled: false,
        passkeysEnabled: false,
        publicSupportEmail: "support@campuscompanion.app",
      });
    }
    if (url.includes("/auth/v1/token")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { email?: string };
      if (request.email === ACCEPTED_EMAIL) return Response.json({ access_token: ACCEPTED_TOKEN });
      if (request.email === UNACCEPTED_EMAIL) return Response.json({ access_token: UNACCEPTED_TOKEN });
      return Response.json({ error: "unknown account" }, { status: 401 });
    }
    if (url.endsWith("/auth/v1/user")) {
      const token = new Headers(init?.headers).get("authorization");
      if (token === `Bearer ${ACCEPTED_TOKEN}`) {
        return Response.json({ id: ACCEPTED_ID, email: ACCEPTED_EMAIL });
      }
      if (token === `Bearer ${UNACCEPTED_TOKEN}`) {
        return Response.json({ id: UNACCEPTED_ID, email: UNACCEPTED_EMAIL });
      }
      return Response.json({ error: "invalid token" }, { status: 401 });
    }
    if (url.endsWith("/rest/v1/rpc/get_family_beta_agreement_status")) {
      const token = new Headers(init?.headers).get("authorization");
      if (token === `Bearer ${UNACCEPTED_TOKEN}`) {
        return Response.json({
          accepted: false,
          agreementVersion: "2026-08-17",
          acceptedAt: null,
          ownerId: UNACCEPTED_ID,
        });
      }
      return Response.json({
        accepted: true,
        agreementVersion: "2026-08-17",
        acceptedAt: "2026-08-27T12:00:00.000Z",
        ownerId: ACCEPTED_ID,
      });
    }
    if (FORBIDDEN_EDGE_FUNCTIONS.some((name) => url.endsWith(`/functions/v1/${name}`))) {
      return new Response(null, { status: 404 });
    }
    if (url.endsWith("/functions/v1/report-client-error")) {
      return Response.json({ accepted: true, requestId }, {
        status: 202,
        headers: privateHeaders({}, requestId),
      });
    }
    if (url.endsWith("/functions/v1/mcp")) {
      return Response.json({ error: "retired", code: "endpoint_retired" }, {
        status: 410,
        headers: privateHeaders({}, requestId),
      });
    }
    if (
      url.endsWith("/functions/v1/cleanup-abandoned-captures")
      || url.endsWith("/functions/v1/cleanup-abandoned-syllabi")
    ) {
      return Response.json({ error: "Authentication required" }, {
        status: 401,
        headers: privateHeaders({}, requestId),
      });
    }
    if (url.includes("/functions/v1/")) {
      if (new Headers(init?.headers).get("authorization") === `Bearer ${UNACCEPTED_TOKEN}`) {
        return Response.json({
          error: "Accept the current family beta agreement before continuing.",
          reason: "family_beta_agreement_required",
          retryable: false,
        }, { status: 403, headers: privateHeaders({}, requestId) });
      }
      return Response.json({ error: "validation failed" }, {
        status: 400,
        headers: privateHeaders({}, requestId),
      });
    }
    return new Response(null, { status: 404 });
  });
}

describe("post-deploy release canary", () => {
  it("keeps every Edge source in the exact reviewed or forbidden launch inventory", () => {
    expect(REVIEWED_EDGE_FUNCTIONS).toEqual([
      "confirm-assignment-practice-source",
      "extract-concepts",
      "generate-artifact",
      "parse-syllabus",
      "process-capture-images",
      "record-study-result",
      "cleanup-abandoned-captures",
      "cleanup-abandoned-syllabi",
      "mcp",
      "report-client-error",
    ]);
    expect(FORBIDDEN_EDGE_FUNCTIONS).toEqual([
      "seed-beta-user",
      "canvas-connect",
      "canvas-oauth-callback",
      "canvas-sync",
      "canvas-calendar-sync",
    ]);

    const functionsDirectory = resolve(process.cwd(), "supabase/functions");
    const sourceInventory = readdirSync(functionsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(functionsDirectory, name, "index.ts")))
      .sort();
    expect(sourceInventory).toEqual([
      ...REVIEWED_EDGE_FUNCTIONS,
      ...FORBIDDEN_EDGE_FUNCTIONS,
    ].sort());
  });

  it("requires credentials and exact release identity without exposing their values", () => {
    expect(() => readCanaryConfiguration(environment({ CANARY_PASSWORD: undefined })))
      .toThrow("CANARY_PASSWORD is required");
    expect(() => readCanaryConfiguration(environment({ VITE_RELEASE_SHA: "not-a-sha" })))
      .toThrow("VITE_RELEASE_SHA must be a full 40-character git commit SHA");
    expect(() => readCanaryConfiguration(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" })))
      .toThrow("cannot be a secret key");
    expect(() => readCanaryConfiguration(environment({ VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey("service_role") })))
      .toThrow("cannot be a secret key");
    expect(() => readCanaryConfiguration(environment({ UNACCEPTED_CANARY_PASSWORD: undefined })))
      .toThrow("UNACCEPTED_CANARY_PASSWORD is required");
    expect(() => readCanaryConfiguration(environment({ VITE_SUPABASE_PROJECT_ID: "wrong-project" })))
      .toThrow("VITE_SUPABASE_PROJECT_ID must match VITE_SUPABASE_URL");
    expect(() => readCanaryConfiguration(environment({ RELEASE_PRODUCTION_ORIGIN: "https://app.campuscompanion.com:8443" })))
      .toThrow("RELEASE_PRODUCTION_ORIGIN must be an HTTPS origin");
    for (const value of [undefined, "", "true", "TRUE", "0", " false "]) {
      expect(() => readCanaryConfiguration(environment({ VITE_CANVAS_CONNECT_ENABLED: value })))
        .toThrow("VITE_CANVAS_CONNECT_ENABLED must be false for this release");
    }
  });

  it("requires separate accepted and unaccepted canary identities", async () => {
    await expect(runPostdeployCanary(environment({ UNACCEPTED_CANARY_EMAIL: ACCEPTED_EMAIL }), successfulFetch()))
      .rejects.toMatchObject({ name: "CanaryFailure", check: "configuration" });
  });

  it("proves the published bundle and deep-link fallback, auth session, validation contracts, and error ingest", async () => {
    const fetchImpl = successfulFetch();
    await expect(runPostdeployCanary(environment(), fetchImpl)).resolves.toEqual({
      ok: true,
      checks: [
        "published-origin",
        "published-bundle",
        "spa-deep-link",
        "release-manifest",
        "canary-auth",
        "canary-agreement",
        "canary-unaccepted-auth",
        "canary-unaccepted-agreement",
        "edge-function-inventory",
        "edge-agreement-contracts",
        "edge-validation-contracts",
        "cleanup-worker-denials",
        "mcp-retirement",
        "error-report-ingest",
      ],
    });
    const functionCalls = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("/functions/v1/"));
    expect(functionCalls).toHaveLength(21);
    expect(new Set(functionCalls.map((url) => url.split("/functions/v1/")[1]))).toEqual(
      new Set([...REVIEWED_EDGE_FUNCTIONS, ...FORBIDDEN_EDGE_FUNCTIONS]),
    );
    expect(functionCalls).toContain(`${SUPABASE}/functions/v1/cleanup-abandoned-captures`);
    expect(functionCalls).toContain(`${SUPABASE}/functions/v1/cleanup-abandoned-syllabi`);

    for (const name of FORBIDDEN_EDGE_FUNCTIONS) {
      const calls = fetchImpl.mock.calls.filter(([input]) => (
        String(input) === `${SUPABASE}/functions/v1/${name}`
      ));
      expect(calls).toHaveLength(1);
      const init = calls[0]?.[1] as RequestInit;
      expect(init.method).toBe("POST");
      expect(init.body).toBe("{}");
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${ACCEPTED_TOKEN}`);
    }

    for (const name of ["cleanup-abandoned-captures", "cleanup-abandoned-syllabi"]) {
      const call = fetchImpl.mock.calls.find(([input]) => (
        String(input) === `${SUPABASE}/functions/v1/${name}`
      ));
      expect(call).toBeDefined();
      const init = call?.[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get("x-cleanup-secret")).toBeNull();
      expect(headers.get("authorization")).toBe(`Bearer ${ACCEPTED_TOKEN}`);
      expect(init.body).toBe("{}");
    }

    for (const name of [
      "confirm-assignment-practice-source",
      "extract-concepts",
      "generate-artifact",
      "parse-syllabus",
      "process-capture-images",
      "record-study-result",
    ]) {
      const calls = fetchImpl.mock.calls.filter(([input]) => (
        String(input) === `${SUPABASE}/functions/v1/${name}`
      ));
      expect(calls).toHaveLength(2);
      expect(new Headers((calls[0]?.[1] as RequestInit).headers).get("authorization"))
        .toBe(`Bearer ${UNACCEPTED_TOKEN}`);
      expect(new Headers((calls[1]?.[1] as RequestInit).headers).get("authorization"))
        .toBe(`Bearer ${ACCEPTED_TOKEN}`);
    }
  });

  it("fails closed when production security headers are absent", async () => {
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () => new Response("ok", { status: 200 }));
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "published-origin",
    });
  });

  it("fails when a direct SPA deep link does not return the published bundle", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === `${ORIGIN}/dashboard`) {
        return new Response('<script type="module" src="/assets/stale.js"></script>', {
          status: 200,
          headers: originHeaders(),
        });
      }
      return baseFetch(input, init);
    });
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "spa-deep-link",
    });
  });

  it.each([
    ["quoted", '<script src="https://cdn.attacker.invalid/index.js"></script>'],
    ["unquoted", "<script src=https://cdn.attacker.invalid/index.js></script>"],
  ])("rejects %s cross-origin script assets", async (_label, html) => {
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () => new Response(
      html,
      { status: 200, headers: originHeaders() },
    ));
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "published-bundle",
    });
  });

  it("fails when the deployed public release manifest differs from validated configuration", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(`${ORIGIN}/release-manifest.json?`)) {
        return Response.json({
          schemaVersion: 1,
          releaseSha: RELEASE,
          supabaseProjectId: "wrong-project",
          publicSignupsEnabled: true,
          passkeysEnabled: false,
          publicSupportEmail: "support@campuscompanion.app",
        });
      }
      return baseFetch(input, init);
    });
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "release-manifest",
    });
  });

  it("rejects unexpected fields in the public release manifest", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(`${ORIGIN}/release-manifest.json?`)) {
        return Response.json({
          schemaVersion: 1,
          releaseSha: RELEASE,
          supabaseProjectId: "norsaaoyppctrvxxgjtg",
          publicSignupsEnabled: false,
          passkeysEnabled: false,
          publicSupportEmail: "support@campuscompanion.app",
          unexpected: "must fail",
        });
      }
      return baseFetch(input, init);
    });
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "release-manifest",
    });
  });

  it.each([
    ["unsafe HSTS", { "Strict-Transport-Security": "max-age=0" }],
    ["fake HSTS token", { "Strict-Transport-Security": "max-age=31536000; includeSubDomainsX" }],
    ["duplicate HSTS max-age", {
      "Strict-Transport-Security": "max-age=31536000; max-age=0; includeSubDomains",
    }],
    ["unsafe permissions", { "Permissions-Policy": "camera=*" }],
    ["duplicate permissions", {
      "Permissions-Policy": "camera=(), camera=*, microphone=(), geolocation=()",
    }],
    ["unsafe referrer", { "Referrer-Policy": "unsafe-url" }],
    ["expanded frame ancestors", {
      "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none' https://evil.invalid; object-src 'none'",
    }],
    ["expanded object sources", {
      "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; object-src 'none' data:",
    }],
    ["duplicate protected CSP", {
      "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; frame-ancestors https:; object-src 'none'",
    }],
    ["expanded script element policy", {
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; script-src-elem https:; frame-ancestors 'none'; object-src 'none'",
    }],
    ["expanded script attribute policy", {
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; script-src-attr 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'",
    }],
  ])("rejects %s semantics", async (_label, override) => {
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () => new Response(
      '<script src="/assets/index.js"></script>',
      { status: 200, headers: { ...originHeaders(), ...override } },
    ));
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "published-origin",
    });
  });

  it("fails when an expected Edge validation route does not satisfy its response contract", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (
        url.endsWith("/functions/v1/confirm-assignment-practice-source")
        && new Headers(init?.headers).get("authorization") === `Bearer ${ACCEPTED_TOKEN}`
      ) {
        return Response.json({ error: "paused" }, { status: 503, headers: privateHeaders() });
      }
      return baseFetch(input, init);
    });
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toEqual(
      expect.objectContaining<Partial<CanaryFailure>>({ check: "function-confirm-assignment-practice-source" }),
    );
  });

  it("fails if either internal cleanup worker is absent", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/functions/v1/cleanup-abandoned-syllabi")) {
        return Response.json({ error: "not found" }, { status: 404, headers: privateHeaders() });
      }
      return baseFetch(input, init);
    });

    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "function-cleanup-abandoned-syllabi",
    });
  });

  it.each(FORBIDDEN_EDGE_FUNCTIONS)(
    "fails if forbidden Edge Function %s is still deployed",
    async (name) => {
      const fetchImpl = successfulFetch();
      const baseFetch = successfulFetch();
      fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).endsWith(`/functions/v1/${name}`)) {
          return new Response(null, { status: 410 });
        }
        return baseFetch(input, init);
      });

      await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
        name: "CanaryFailure",
        check: `function-${name}-absence`,
        message: `function-${name}-absence: returned HTTP 410; expected 404`,
      });
    },
  );

  it("fails when the password token cannot be verified as a live user session", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/auth/v1/user")) {
        return Response.json({ message: "invalid token" }, { status: 401 });
      }
      return baseFetch(input, init);
    });
    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "canary-auth",
    });
  });

  it("fails before Edge probes when the canary lacks the current durable agreement receipt", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (
        String(input).endsWith("/rest/v1/rpc/get_family_beta_agreement_status")
        && new Headers(init?.headers).get("authorization") === `Bearer ${ACCEPTED_TOKEN}`
      ) {
        return Response.json({
          accepted: false,
          agreementVersion: "2026-08-17",
          acceptedAt: null,
          ownerId: ACCEPTED_ID,
        });
      }
      return baseFetch(input, init);
    });

    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "canary-agreement",
    });
  });

  it("fails if the dedicated unaccepted account has a durable receipt", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (
        String(input).endsWith("/rest/v1/rpc/get_family_beta_agreement_status")
        && new Headers(init?.headers).get("authorization") === `Bearer ${UNACCEPTED_TOKEN}`
      ) {
        return Response.json({
          accepted: true,
          agreementVersion: "2026-08-17",
          acceptedAt: "2026-08-27T12:00:00.000Z",
          ownerId: UNACCEPTED_ID,
        });
      }
      return baseFetch(input, init);
    });

    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "canary-unaccepted-agreement",
    });
  });

  it("requires the exact private agreement-denial reason from every guarded function", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (
        String(input).endsWith("/functions/v1/parse-syllabus")
        && new Headers(init?.headers).get("authorization") === `Bearer ${UNACCEPTED_TOKEN}`
      ) {
        const requestId = new Headers(init?.headers).get("x-request-id") ?? crypto.randomUUID();
        return Response.json({ reason: "validation_failed", retryable: false }, {
          status: 403,
          headers: privateHeaders({}, requestId),
        });
      }
      return baseFetch(input, init);
    });

    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "function-parse-syllabus",
    });
  });

  it("requires a request ID from every Edge response", async () => {
    const fetchImpl = successfulFetch();
    const baseFetch = successfulFetch();
    fetchImpl.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      if (
        String(input).endsWith("/functions/v1/generate-artifact")
        && new Headers(init?.headers).get("authorization") === `Bearer ${UNACCEPTED_TOKEN}`
      ) {
        const headers = privateHeaders();
        delete headers["X-Request-ID"];
        return Response.json({
          reason: "family_beta_agreement_required",
          retryable: false,
        }, { status: 403, headers });
      }
      return baseFetch(input, init);
    });

    await expect(runPostdeployCanary(environment(), fetchImpl)).rejects.toMatchObject({
      name: "CanaryFailure",
      check: "function-generate-artifact",
    });
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
