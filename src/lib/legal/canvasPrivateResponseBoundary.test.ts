import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function edgeSource(name: string): string {
  return readFileSync(
    resolve(process.cwd(), `supabase/functions/${name}/index.ts`),
    "utf8",
  );
}

describe("Canvas private response boundary", () => {
  it.each([
    "canvas-connect",
    "canvas-sync",
    "canvas-calendar-sync",
  ])("keeps every %s JSON response behind the shared boundary", (name) => {
    const source = edgeSource(name);

    expect(source).toContain("withPrivateJsonErrors(req, corsHeaders");
    expect(source).toContain(
      "privateJsonResponse(body, status, corsHeaders, { requestId })",
    );
    expect(source).toContain("privateResponseHeaders(corsHeaders, requestId)");
    expect(source).toContain("logPrivateFailure({");
    expect(source).not.toMatch(/console\.(?:error|warn|log)\s*\(/);
    expect(source).not.toContain("new Response(JSON.stringify(body)");
    expect(source).not.toMatch(/function\s+json\s*\(/);
  });

  it("keeps callback failures as private redirects with a request id", () => {
    const source = edgeSource("canvas-oauth-callback");

    expect(source).toContain(
      'createPrivateRequestId(req.headers.get("X-Request-ID"))',
    );
    expect(source).toContain(
      "headers: privateResponseHeaders({ Location: url.toString() }, requestId)",
    );
    expect(source).toContain(
      'errorClass: "canvas_oauth_callback_unhandled"',
    );
    expect(source).not.toContain("Response.redirect(");
    expect(source).not.toMatch(/console\.(?:error|warn|log)\s*\(/);

    const redirects = source.match(/redirect\([^;\n]+\)/g) ?? [];
    expect(redirects.length).toBeGreaterThan(1);
    for (const call of redirects) expect(call).toContain("requestId");
  });

  it("checks the agreement before Canvas provider network work", () => {
    for (const name of [
      "canvas-connect",
      "canvas-sync",
      "canvas-calendar-sync",
      "canvas-oauth-callback",
    ]) {
      const source = edgeSource(name);
      const agreement = source.indexOf("checkCurrentFamilyBetaAgreement(");
      const requestBody = source.indexOf("await req.json()", agreement);
      const providerFetch = source.indexOf("fetch(", agreement);

      expect(agreement, name).toBeGreaterThan(-1);
      if (requestBody >= 0) expect(agreement, name).toBeLessThan(requestBody);
      if (providerFetch >= 0) expect(agreement, name).toBeLessThan(providerFetch);
    }
  });
});
