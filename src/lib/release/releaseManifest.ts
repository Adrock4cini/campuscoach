import type { Plugin } from "vite";

export const RELEASE_MANIFEST_PATH = "release-manifest.json";

export interface DeployedReleaseManifest {
  schemaVersion: 1;
  releaseSha: string;
  supabaseProjectId: string;
  publicSignupsEnabled: boolean;
  passkeysEnabled: boolean;
  publicSupportEmail: string;
}

export function buildReleaseManifest(
  environment: Record<string, string | undefined>,
): DeployedReleaseManifest {
  return {
    schemaVersion: 1,
    releaseSha: environment.VITE_RELEASE_SHA?.trim().toLowerCase() ?? "",
    supabaseProjectId: environment.VITE_SUPABASE_PROJECT_ID?.trim() ?? "",
    publicSignupsEnabled: environment.VITE_PUBLIC_SIGNUPS_ENABLED === "true",
    passkeysEnabled: environment.VITE_PASSKEYS_ENABLED === "true",
    publicSupportEmail: environment.VITE_PUBLIC_SUPPORT_EMAIL?.trim() ?? "",
  };
}

/** Emit only nonsecret public release identity; never add credentials or keys. */
export function releaseManifestPlugin(
  environment: Record<string, string | undefined>,
): Plugin {
  return {
    name: "campus-companion-release-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: RELEASE_MANIFEST_PATH,
        source: `${JSON.stringify(buildReleaseManifest(environment))}\n`,
      });
    },
  };
}
