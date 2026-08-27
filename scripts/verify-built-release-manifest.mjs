import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const EXPECTED_KEYS = [
  "canvasConnectEnabled",
  "passkeysEnabled",
  "publicSignupsEnabled",
  "publicSupportEmail",
  "releaseSha",
  "schemaVersion",
  "supabaseProjectId",
];

export function expectedBuiltReleaseManifest(environment) {
  return {
    schemaVersion: 1,
    releaseSha: environment.VITE_RELEASE_SHA?.trim().toLowerCase() ?? "",
    supabaseProjectId: environment.VITE_SUPABASE_PROJECT_ID?.trim() ?? "",
    publicSignupsEnabled: environment.VITE_PUBLIC_SIGNUPS_ENABLED === "true",
    canvasConnectEnabled: environment.VITE_CANVAS_CONNECT_ENABLED === "true",
    passkeysEnabled: environment.VITE_PASSKEYS_ENABLED === "true",
    publicSupportEmail: environment.VITE_PUBLIC_SUPPORT_EMAIL?.trim() ?? "",
  };
}

export function verifyBuiltReleaseManifest(manifest, environment) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(EXPECTED_KEYS)) return false;
  const expected = expectedBuiltReleaseManifest(environment);
  if (!/^[0-9a-f]{40}$/u.test(expected.releaseSha)) return false;
  return EXPECTED_KEYS.every((key) => manifest[key] === expected[key]);
}

async function runCli() {
  try {
    const raw = await readFile(new URL("../dist/release-manifest.json", import.meta.url), "utf8");
    const manifest = JSON.parse(raw);
    if (!verifyBuiltReleaseManifest(manifest, process.env)) throw new Error("mismatch");
    process.stdout.write("Built release manifest matches protected public configuration.\n");
  } catch {
    process.stderr.write("Built release manifest is missing, malformed, or does not match protected public configuration.\n");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await runCli();
}
