import { afterEach, describe, expect, it, vi } from "vitest";

const REF = "dfpgnmldxphkfmobjbvr";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_PROJECT_ID", env.projectId ?? "");
  vi.stubEnv("VITE_SUPABASE_URL", env.url ?? (env.projectId ? `https://${env.projectId}.supabase.co` : ""));
  vi.stubEnv("VITE_PUBLIC_SIGNUPS_ENABLED", env.flag ?? "");
  return import("./familyBeta");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("family beta self-serve signup gate", () => {
  it("opens account creation on the family beta staging backend", async () => {
    const mod = await load({ projectId: REF });
    expect(mod.isFamilyBetaStaging()).toBe(true);
    expect(mod.publicSignupsEnabled()).toBe(true);
  });

  it("lets operators close staging without making the flag a production unlock", async () => {
    const stagingClosed = await load({ projectId: REF, flag: "false" });
    expect(stagingClosed.publicSignupsEnabled()).toBe(false);

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
});
