import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatReleaseEnvironmentIssues,
  validateReleaseEnvironment,
} from "../../../scripts/validate-release-env.mjs";

const PRODUCTION_REF = "norsaaoyppctrvxxgjtg";
const STAGING_REF = "dfpgnmldxphkfmobjbvr";

function validEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
    VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key",
    VITE_PUBLIC_SUPPORT_EMAIL: "support@campuscompanion.app",
    VITE_PUBLIC_SIGNUPS_ENABLED: "false",
    VITE_PASSKEYS_ENABLED: "false",
    VITE_RELEASE_SHA: "abcdef1234567890abcdef1234567890abcdef12",
    RELEASE_PRODUCTION_ORIGIN: "https://app.campuscompanion.com",
    ...overrides,
  };
}

function issueCodes(environment: Record<string, string | undefined>) {
  return validateReleaseEnvironment(environment).issues.map((issue) => issue.code);
}

function legacyKey(role: "anon" | "service_role") {
  return `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
}

describe("production release environment validation", () => {
  it("accepts a production environment with signups and passkeys explicitly disabled", () => {
    expect(validateReleaseEnvironment(validEnvironment())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ["missing", undefined, "required"],
    ["blank", "   ", "required"],
    ["HTTP", `http://${PRODUCTION_REF}.supabase.co`, "https_required"],
    ["non-Supabase host", "https://database.example.edu", "invalid_supabase_host"],
    ["URL path", `https://${PRODUCTION_REF}.supabase.co/rest/v1`, "origin_required"],
  ])("rejects a %s Supabase URL", (_label, value, expectedCode) => {
    expect(issueCodes(validEnvironment({ VITE_SUPABASE_URL: value }))).toContain(expectedCode);
  });

  it.each([undefined, "", "   "])("rejects a missing or blank publishable key", (value) => {
    expect(issueCodes(validEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: value }))).toContain(
      "required",
    );
  });

  it.each(["sb_secret_private", legacyKey("service_role")])(
    "rejects a Supabase secret key in the public browser-key variable",
    (key) => {
      expect(issueCodes(validEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: key })))
        .toContain("secret_key_forbidden");
    },
  );

  it("rejects a browser key whose role cannot be verified", () => {
    expect(issueCodes(validEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: "looks-public-but-is-not" })))
      .toContain("unclassified_public_key");
  });

  it("requires an exact release SHA and production origin for deployment identity", () => {
    expect(issueCodes(validEnvironment({ VITE_RELEASE_SHA: undefined }))).toContain("required");
    expect(issueCodes(validEnvironment({ VITE_RELEASE_SHA: "latest" }))).toContain("invalid_release_sha");
    expect(issueCodes(validEnvironment({ RELEASE_PRODUCTION_ORIGIN: undefined }))).toContain("required");
    expect(issueCodes(validEnvironment({ RELEASE_PRODUCTION_ORIGIN: "http://app.campuscompanion.com" })))
      .toContain("https_required");
  });

  it("requires the project ID to exactly match the URL project ref", () => {
    expect(
      issueCodes(validEnvironment({ VITE_SUPABASE_PROJECT_ID: "anotherprojectref123" })),
    ).toContain("project_ref_mismatch");
  });

  it("rejects the known family-beta staging project from either project field", () => {
    expect(
      issueCodes(
        validEnvironment({
          VITE_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
          VITE_SUPABASE_PROJECT_ID: STAGING_REF,
        }),
      ),
    ).toContain("staging_project_forbidden");

    expect(issueCodes(validEnvironment({ VITE_SUPABASE_PROJECT_ID: STAGING_REF }))).toContain(
      "staging_project_forbidden",
    );
  });

  it.each([undefined, "", "help@example.com", "not-an-email"])(
    "requires a real monitored public support email",
    (value) => {
      const codes = issueCodes(validEnvironment({ VITE_PUBLIC_SUPPORT_EMAIL: value }));
      expect(codes).toSatisfy((items: string[]) =>
        items.includes("required") || items.includes("monitored_support_email_required"),
      );
    },
  );

  it.each([undefined, "", "true", "FALSE", "0"])(
    "requires public signups to be explicitly false",
    (value) => {
      expect(issueCodes(validEnvironment({ VITE_PUBLIC_SIGNUPS_ENABLED: value }))).toContain(
        "public_signups_must_be_disabled",
      );
    },
  );

  it("keeps passkeys release-safe by requiring an explicit state", () => {
    expect(issueCodes(validEnvironment({ VITE_PASSKEYS_ENABLED: undefined }))).toContain(
      "explicit_passkey_state_required",
    );
  });

  it("allows enabled passkeys only with a matching HTTPS production hostname", () => {
    const enabled = validEnvironment({
      VITE_PASSKEYS_ENABLED: "true",
      VITE_PASSKEY_RP_ID: "app.campuscompanion.com",
      RELEASE_PRODUCTION_ORIGIN: "https://app.campuscompanion.com",
    });
    expect(validateReleaseEnvironment(enabled)).toEqual({ ok: true, issues: [] });

    expect(
      issueCodes({ ...enabled, VITE_PASSKEY_RP_ID: "other.campuscompanion.com" }),
    ).toContain("passkey_domain_mismatch");
    expect(issueCodes({ ...enabled, RELEASE_PRODUCTION_ORIGIN: undefined })).toContain("required");
    expect(
      issueCodes({ ...enabled, RELEASE_PRODUCTION_ORIGIN: "http://app.campuscompanion.com" }),
    ).toContain("https_required");
  });

  it("never includes environment values in validation output", () => {
    const secretSentinel = "do-not-print-this-value";
    const result = validateReleaseEnvironment(
      validEnvironment({
        VITE_SUPABASE_PUBLISHABLE_KEY: ` ${secretSentinel} `,
        VITE_PUBLIC_SUPPORT_EMAIL: secretSentinel,
      }),
    );
    const output = formatReleaseEnvironmentIssues(result.issues);

    expect(output).not.toContain(secretSentinel);
  });

  it("validates process environment values through the CLI without printing secrets", () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/validate-release-env.mjs");
    const secretSentinel = "cli-secret-sentinel";
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        ...validEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: ` ${secretSentinel} ` }),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretSentinel);
  });
});
