import { describe, expect, it } from "vitest";
import {
  expectedBuiltReleaseManifest,
  verifyBuiltReleaseManifest,
} from "../../../scripts/verify-built-release-manifest.mjs";

const environment = {
  VITE_RELEASE_SHA: "abcdef1234567890abcdef1234567890abcdef12",
  VITE_SUPABASE_PROJECT_ID: "norsaaoyppctrvxxgjtg",
  VITE_PUBLIC_SIGNUPS_ENABLED: "false",
  VITE_PASSKEYS_ENABLED: "false",
  VITE_PUBLIC_SUPPORT_EMAIL: "support@campuscompanion.app",
};

describe("built release manifest verification", () => {
  it("accepts only the exact nonsecret public build identity", () => {
    const manifest = expectedBuiltReleaseManifest(environment);
    expect(verifyBuiltReleaseManifest(manifest, environment)).toBe(true);
  });

  it("rejects extra keys, abbreviated SHAs, and configuration mismatches", () => {
    const manifest = expectedBuiltReleaseManifest(environment);
    expect(verifyBuiltReleaseManifest({ ...manifest, unexpected: "value" }, environment)).toBe(false);
    expect(verifyBuiltReleaseManifest(manifest, {
      ...environment,
      VITE_RELEASE_SHA: "abcdef1",
    })).toBe(false);
    expect(verifyBuiltReleaseManifest({ ...manifest, publicSignupsEnabled: true }, environment)).toBe(false);
  });
});
