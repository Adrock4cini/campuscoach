import { afterEach, describe, expect, it, vi } from "vitest";

const REF = "abcdefghijklmnopqrst";
const PROTECTED_REFS = [
  "norsaaoyppctrvxxgjtg",
  "dfpgnmldxphkfmobjbvr",
  "lzwaiobgrhwmywugsgjo",
  "mviunlhhtcjuuburjxbf",
];

async function load(env: Record<string, string | boolean | undefined>) {
  vi.resetModules();
  const projectId = typeof env.projectId === "string" ? env.projectId : "";
  vi.stubEnv("DEV", env.development === true);
  vi.stubEnv(
    "VITE_FAMILY_BETA_STAGING_PROJECT_ID",
    "stagingProjectId" in env
      ? (typeof env.stagingProjectId === "string" ? env.stagingProjectId : "")
      : REF,
  );
  vi.stubEnv("VITE_SUPABASE_PROJECT_ID", projectId);
  vi.stubEnv("VITE_SUPABASE_URL", typeof env.url === "string" ? env.url : (projectId ? `https://${projectId}.supabase.co` : ""));
  vi.stubEnv("VITE_PUBLIC_SIGNUPS_ENABLED", typeof env.flag === "string" ? env.flag : "");
  vi.stubEnv("VITE_OPEN_BETA_SIGNUPS", typeof env.openBeta === "string" ? env.openBeta : "false");
  return import("./familyBeta");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("family beta self-serve signup gate", () => {
  it("opens account creation only with an explicit true flag on the family beta backend", async () => {
    const mod = await load({ projectId: REF, flag: "true" });
    expect(mod.isFamilyBetaStaging()).toBe(true);
    expect(mod.publicSignupsEnabled()).toBe(true);
    expect(mod.demoModeEnabled()).toBe(true);
  });

  it("fails closed when the staging signup flag is missing or false", async () => {
    const stagingMissing = await load({ projectId: REF });
    expect(stagingMissing.publicSignupsEnabled()).toBe(false);
    expect(stagingMissing.demoModeEnabled()).toBe(false);

    const stagingClosed = await load({ projectId: REF, flag: "false" });
    expect(stagingClosed.publicSignupsEnabled()).toBe(false);
    expect(stagingClosed.demoModeEnabled()).toBe(false);
  });

  it("fails closed when the separate staging project authority is missing or malformed", async () => {
    const missing = await load({ projectId: REF, stagingProjectId: undefined, flag: "true" });
    expect(missing.isFamilyBetaStaging()).toBe(false);
    expect(missing.publicSignupsEnabled()).toBe(false);

    const malformed = await load({
      projectId: REF,
      stagingProjectId: "not-a-project-ref",
      flag: "true",
    });
    expect(malformed.isFamilyBetaStaging()).toBe(false);
    expect(malformed.publicSignupsEnabled()).toBe(false);
  });

  it.each(PROTECTED_REFS)("never accepts protected project %s as staging authority", async (projectRef) => {
    const mod = await load({
      projectId: projectRef,
      stagingProjectId: projectRef,
      flag: "true",
    });
    expect(mod.isFamilyBetaStaging()).toBe(false);
    expect(mod.publicSignupsEnabled()).toBe(false);
    expect(mod.demoModeEnabled()).toBe(false);
  });

  it("does not let the staging flag unlock another backend", async () => {
    const closed = await load({ projectId: "norsaaoyppctrvxxgjtg", flag: "false" });
    expect(closed.isFamilyBetaStaging()).toBe(false);
    expect(closed.publicSignupsEnabled()).toBe(false);

    const stillClosed = await load({ projectId: "norsaaoyppctrvxxgjtg", flag: "true" });
    expect(stillClosed.isFamilyBetaStaging()).toBe(false);
    expect(stillClosed.publicSignupsEnabled()).toBe(false);
  });

  it("stays closed when the claimed staging project does not match the Supabase URL", async () => {
    const mod = await load({
      projectId: REF,
      url: "https://norsaaoyppctrvxxgjtg.supabase.co",
      flag: "true",
    });
    expect(mod.isFamilyBetaStaging()).toBe(false);
    expect(mod.publicSignupsEnabled()).toBe(false);
  });

  it("keeps the sample tour available during local development without opening signups", async () => {
    const mod = await load({
      projectId: "norsaaoyppctrvxxgjtg",
      flag: "false",
      development: true,
    });

    expect(mod.publicSignupsEnabled()).toBe(false);
    expect(mod.demoModeEnabled()).toBe(true);
  });
});
