import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("environment file safety", () => {
  it("does not track a developer .env file", () => {
    const tracked = execFileSync("git", ["ls-files", ".env"], { encoding: "utf8" }).trim();
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(tracked).toBe("");
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });

  it("uses only a clearly fake publishable key in examples and demo CI", () => {
    const example = readFileSync(".env.example", "utf8");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(example).toContain("sb_publishable_replace-with-project-key");
    expect(ci).toContain("sb_publishable_ci-placeholder");
    expect(`${example}\n${ci}`).not.toContain("sb_secret_");
    expect(ci).not.toContain("norsaaoyppctrvxxgjtg");
  });
});
