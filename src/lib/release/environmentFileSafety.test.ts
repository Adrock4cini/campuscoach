import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("environment file safety", () => {
  it("keeps .env deployable and free of privileged credentials", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    // The hosted production build is produced from the repository snapshot, so
    // ignoring .env ships a bundle with undefined Supabase browser config.
    expect(gitignore).not.toMatch(/^\.env$/m);
    expect(gitignore).not.toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^\.env\.local$/m);

    const env = readFileSync(".env", "utf8");
    expect(env).not.toContain("sb_secret_");
    expect(env).not.toContain("SERVICE_ROLE");
    expect(env).not.toContain("service_role");
    for (const variable of [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PROJECT_ID",
    ]) {
      expect(env).toContain(variable);
    }
  });


  it("uses only a clearly fake publishable key in examples and demo CI", () => {
    const example = readFileSync(".env.example", "utf8");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const playwright = readFileSync("playwright.config.ts", "utf8");
    expect(example).toContain("sb_publishable_replace-with-project-key");
    expect(example).toContain('VITE_FAMILY_BETA_STAGING_PROJECT_ID=""');
    expect(ci).toContain("sb_publishable_ci-placeholder");
    expect(playwright).toContain("sb_publishable_e2e-placeholder");
    expect(ci.match(/abcdefghijklmnopqrst/g)).toHaveLength(3);
    expect(`${example}\n${ci}\n${playwright}`).not.toContain("sb_secret_");
    for (const protectedProjectRef of [
      "norsaaoyppctrvxxgjtg",
      "dfpgnmldxphkfmobjbvr",
      "lzwaiobgrhwmywugsgjo",
      "mviunlhhtcjuuburjxbf",
    ]) {
      expect(ci).not.toContain(protectedProjectRef);
      expect(playwright).not.toContain(protectedProjectRef);
    }
  });
});
