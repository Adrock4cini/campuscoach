import { afterEach, describe, expect, it, vi } from "vitest";

const REF = "dfpgnmldxphkfmobjbvr";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_PROJECT_ID", env.projectId ?? "");
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

  it("stays closed on any other backend unless explicitly enabled", async () => {
    const closed = await load({ projectId: "norsaaoyppctrvxxgjtg", flag: "false" });
    expect(closed.isFamilyBetaStaging()).toBe(false);
    expect(closed.publicSignupsEnabled()).toBe(false);

    const opened = await load({ projectId: "norsaaoyppctrvxxgjtg", flag: "true" });
    expect(opened.isFamilyBetaStaging()).toBe(false);
    expect(opened.publicSignupsEnabled()).toBe(true);
  });
});
