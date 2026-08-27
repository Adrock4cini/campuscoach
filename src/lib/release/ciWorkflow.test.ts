import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const denoConfig = readFileSync("deno.json", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: string;
  engines?: { node?: string; npm?: string };
  scripts?: Record<string, string>;
};

describe("required CI workflow", () => {
  it("checks the event's real base-to-head range for whitespace errors", () => {
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).toContain("PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
    expect(workflow).toContain("PUSH_BEFORE_SHA: ${{ github.event.before }}");
    expect(workflow).toContain('git diff --check "$base_sha" "$head_sha"');
  });

  it("publishes one fail-closed result after frontend and Edge verification", () => {
    expect(workflow).toContain("required-ci:");
    expect(workflow).toContain("name: Required CI");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("needs: [edge-functions, verify]");
    expect(workflow).toContain('test "$EDGE_FUNCTIONS_RESULT" = "success"');
    expect(workflow).toContain('test "$FRONTEND_VERIFY_RESULT" = "success"');
  });

  it("uses the frozen Edge lock and audits production plus developer tooling", () => {
    expect(denoConfig).toContain('"frozen": true');
    expect(denoConfig).toContain("--lock=deno.lock --frozen");
    expect(workflow).toContain("deno task verify:edge");
    expect(workflow).toContain("npm run audit:prod");
    expect(workflow).toContain("npm run audit:tooling");
    expect(workflow).toContain('VITE_CANVAS_CONNECT_ENABLED: "false"');
  });

  it("pins the same Node and npm runtime in source and CI", () => {
    expect(packageJson.packageManager).toBe("npm@11.9.0");
    expect(packageJson.engines).toEqual({ node: "24.19.0", npm: "11.9.0" });
    expect(workflow).toContain("node-version-file: .nvmrc");
    expect(workflow).toContain("npm install --global npm@11.9.0");
  });

  it("pins every third-party action to a reviewed immutable commit", () => {
    expect(workflow).not.toMatch(/^\s*uses:\s*[^\s#]+@(v\d+|main|master)(?:\s*#.*)?$/m);
    expect(workflow).toContain("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2");
    expect(workflow).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0");
    expect(workflow).toContain("denoland/setup-deno@e95548e56dfa95d4e1a28d6f422fafe75c4c26fb # v2.0.3");
    expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2");
  });
});
