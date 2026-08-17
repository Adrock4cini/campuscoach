import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DEMO_DASHBOARD_FILES = [
  "src/lib/demo/dashboardSampleAdapter.ts",
  "src/components/dashboard/DemoCoachHero.tsx",
  "src/components/dashboard/DemoTodaysPlan.tsx",
];

describe("demo dashboard write boundary", () => {
  it("keeps sample adapters free of authenticated data and write seams", () => {
    const source = DEMO_DASHBOARD_FILES
      .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/integrations\/supabase|realData\/hooks|CaptureContext|useCoachFunction/);
    expect(source).not.toMatch(/\.from\(|\.rpc\(|functions\.invoke|\.insert\(|\.update\(|\.delete\(/);
  });
});
