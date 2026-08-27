import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  checkCurrentFamilyBetaAgreement,
  CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
} from "../../../supabase/functions/_shared/family-beta-agreement";

const USER_ID = "3e8db0db-381c-4829-a921-615c38e63562";

function edgeSource(name: string): string {
  return readFileSync(
    resolve(process.cwd(), `supabase/functions/${name}/index.ts`),
    "utf8",
  );
}

describe("Canvas family beta agreement boundary", () => {
  it.each([
    ["canvas-connect", "await req.json()", 'from("canvas_oauth_states")'],
    ["canvas-sync", "await req.json()", 'from("canvas_connections")'],
    ["canvas-calendar-sync", "await req.json()", "findConnection(admin"],
  ])(
    "checks a durable receipt in %s after verified auth and before input or integration work",
    (name, bodyMarker, integrationMarker) => {
      const source = edgeSource(name);
      const verifiedAuth = source.indexOf("await userClient.auth.getUser()");
      const agreement = source.indexOf("checkCurrentFamilyBetaAgreement(");

      expect(source).toContain('from "../_shared/family-beta-agreement.ts"');
      expect(verifiedAuth).toBeGreaterThan(-1);
      expect(agreement).toBeGreaterThan(verifiedAuth);
      expect(agreement).toBeLessThan(source.indexOf(bodyMarker));
      expect(agreement).toBeLessThan(
        source.indexOf(integrationMarker, agreement),
      );
      expect(source).toContain("FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE, 403");
      expect(source).toContain(
        "FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE, 503",
      );
    },
  );

  it("claims the one-time OAuth state before checking its owner and gates every Canvas side effect", () => {
    const source = edgeSource("canvas-oauth-callback");
    const stateLookup = source.indexOf('from("canvas_oauth_states")');
    const atomicClaim = source.indexOf('.is("used_at", null)');
    const agreement = source.indexOf("checkCurrentFamilyBetaAgreement(");
    const oauthClient = source.indexOf(
      "getCanvasOAuthClient(stateRow.canvas_base_url)",
    );
    const tokenExchange = source.indexOf(
      'fetch(new URL("/login/oauth2/token", oauth.baseUrl)',
    );
    const credentialWrite = source.indexOf('from("canvas_connections").upsert');

    expect(stateLookup).toBeGreaterThan(-1);
    expect(atomicClaim).toBeGreaterThan(stateLookup);
    expect(agreement).toBeGreaterThan(atomicClaim);
    expect(source).toContain("stateRow.user_id");
    expect(agreement).toBeLessThan(oauthClient);
    expect(agreement).toBeLessThan(tokenExchange);
    expect(agreement).toBeLessThan(credentialWrite);
    expect(source).toContain("if (!agreementGate.allowed) {");
    expect(source).toContain('return redirect("error", requestId)');
  });

  it.each([
    ["missing receipt", { data: null, error: null }],
    ["lookup failure", {
      data: null,
      error: new Error("database unavailable"),
    }],
  ])("does not reach Canvas provider work for a %s", async (_label, result) => {
    const providerWork = vi.fn();
    const gate = await checkCurrentFamilyBetaAgreement(
      USER_ID,
      async () => result,
    );

    if (gate.allowed) providerWork();

    expect(gate.allowed).toBe(false);
    expect(providerWork).not.toHaveBeenCalled();
  });

  it("accepts only the current owner-bound receipt before provider work", async () => {
    const providerWork = vi.fn();
    const gate = await checkCurrentFamilyBetaAgreement(USER_ID, async () => ({
      data: {
        user_id: USER_ID,
        accepted_by: USER_ID,
        agreement_version: CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
        accepted_at: "2026-08-27T12:00:00.000Z",
      },
      error: null,
    }));

    if (gate.allowed) providerWork();

    expect(gate.allowed).toBe(true);
    expect(providerWork).toHaveBeenCalledOnce();
  });
});
