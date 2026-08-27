import { describe, expect, it } from "vitest";
import { buildReleaseManifest, releaseManifestPlugin } from "./releaseManifest";

describe("deployed release manifest", () => {
  it("contains only the exact public release identity needed by the canary", () => {
    const manifest = buildReleaseManifest({
      VITE_RELEASE_SHA: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
      VITE_SUPABASE_PROJECT_ID: "norsaaoyppctrvxxgjtg",
      VITE_PUBLIC_SIGNUPS_ENABLED: "false",
      VITE_CANVAS_CONNECT_ENABLED: "false",
      VITE_PASSKEYS_ENABLED: "true",
      VITE_PUBLIC_SUPPORT_EMAIL: "support@campuscompanion.app",
      CANARY_PASSWORD: "must-not-appear",
      VITE_SUPABASE_PUBLISHABLE_KEY: "must-not-appear",
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      releaseSha: "abcdef1234567890abcdef1234567890abcdef12",
      supabaseProjectId: "norsaaoyppctrvxxgjtg",
      publicSignupsEnabled: false,
      canvasConnectEnabled: false,
      passkeysEnabled: true,
      publicSupportEmail: "support@campuscompanion.app",
    });
    expect(JSON.stringify(manifest)).not.toContain("must-not-appear");
  });

  it("emits a fixed same-origin JSON asset during builds", () => {
    const plugin = releaseManifestPlugin({
      VITE_RELEASE_SHA: "abcdef1234567890abcdef1234567890abcdef12",
    });
    expect(plugin.apply).toBe("build");
    expect(plugin.name).toBe("campus-companion-release-manifest");
  });
});
