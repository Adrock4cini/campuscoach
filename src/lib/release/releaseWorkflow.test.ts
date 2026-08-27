import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-readiness.yml", "utf8");

describe("production release-readiness workflow", () => {
  it("runs only as an explicit production-environment gate", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it("validates and builds the exact commit before checking the deployed origin", () => {
    const validate = workflow.indexOf("npm run validate:release-env");
    const build = workflow.indexOf("npm run build");
    const canary = workflow.indexOf("npm run canary:release");
    expect(workflow).toContain("VITE_RELEASE_SHA: ${{ github.sha }}");
    expect(validate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(validate);
    expect(canary).toBeGreaterThan(build);
  });

  it("uses protected environment secrets for the canary account", () => {
    expect(workflow).toContain("PRODUCTION_CANARY_EMAIL");
    expect(workflow).toContain("PRODUCTION_CANARY_PASSWORD");
    expect(workflow).not.toMatch(/CANARY_PASSWORD:\s*["']?[^$\s]/);
  });
});
