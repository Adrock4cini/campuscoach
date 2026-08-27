import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-readiness.yml", "utf8");

describe("production release-readiness workflow", () => {
  it("runs only as an explicit production-environment gate", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).toContain("RELEASE_PRODUCTION_ORIGIN: ${{ vars.PRODUCTION_ORIGIN }}");
    expect(workflow).toContain('VITE_CANVAS_CONNECT_ENABLED: "false"');
    expect(workflow).not.toContain("inputs.release_origin");
  });

  it("validates and builds the exact commit before checking the deployed origin", () => {
    const validate = workflow.indexOf("npm run validate:release-env");
    const build = workflow.indexOf("npm run build");
    const canary = workflow.indexOf("node scripts/postdeploy-canary.mjs");
    expect(workflow).toContain("VITE_RELEASE_SHA: ${{ github.sha }}");
    expect(validate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(validate);
    expect(canary).toBeGreaterThan(build);
    expect(workflow.indexOf("node scripts/verify-built-release-manifest.mjs"))
      .toBeGreaterThan(build);
  });

  it("uses protected environment secrets for distinct accepted and unaccepted canary accounts", () => {
    expect(workflow).toContain("PRODUCTION_CANARY_EMAIL");
    expect(workflow).toContain("PRODUCTION_CANARY_PASSWORD");
    expect(workflow).toContain("PRODUCTION_UNACCEPTED_CANARY_EMAIL");
    expect(workflow).toContain("PRODUCTION_UNACCEPTED_CANARY_PASSWORD");
    expect(workflow).not.toMatch(/CANARY_PASSWORD:\s*["']?[^$\s]/);
    const finalStep = workflow.indexOf("- name: Verify published origin and backend canary");
    for (const secret of [
      "PRODUCTION_CANARY_EMAIL",
      "PRODUCTION_CANARY_PASSWORD",
      "PRODUCTION_UNACCEPTED_CANARY_EMAIL",
      "PRODUCTION_UNACCEPTED_CANARY_PASSWORD",
    ]) {
      expect(workflow.indexOf(secret)).toBeGreaterThan(finalStep);
    }
  });

  it("fails closed unless the protected workflow runs from reviewed main", () => {
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
    expect(workflow.indexOf("Require the reviewed main branch"))
      .toBeLessThan(workflow.indexOf("actions/checkout@"));
  });

  it("requires the exact commit's completed GitHub Actions CI gate", () => {
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("/actions/workflows/ci.yml/runs");
    expect(workflow).toContain('-f head_sha="$GITHUB_SHA"');
    expect(workflow).toContain('-f branch="main"');
    expect(workflow).toContain('-f event="push"');
    expect(workflow).toContain('-f status="success"');
    expect(workflow).toContain('test "$ci_head_sha" = "$GITHUB_SHA"');
    expect(workflow).toContain("/actions/runs/$required_ci_run_id/jobs");
    expect(workflow).toContain('select(.name == "Required CI")');
    expect(workflow).toContain('test "$required_ci_conclusion" = "success"');
  });

  it("pins every third-party action to an immutable commit", () => {
    expect(workflow).not.toMatch(/^\s*uses:\s*[^\s]+@(v\d+|main|master)\s*$/mu);
    for (const line of workflow.split("\n").filter((value) => value.trim().startsWith("uses:"))) {
      expect(line).toMatch(/@[0-9a-f]{40}(?:\s+#.*)?$/iu);
    }
  });
});
