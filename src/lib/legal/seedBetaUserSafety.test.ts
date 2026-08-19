import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/seed-beta-user/index.ts"),
  "utf8",
);

describe("invited beta account provisioning boundary", () => {
  it("never resets or enumerates an existing student's account", () => {
    expect(source).not.toContain("listUsers");
    expect(source).not.toContain("updateUserById");
    expect(source).toContain("provisioning endpoint is retired");
  });

  it("does not bypass agreement and onboarding with a seeded profile", () => {
    expect(source).not.toMatch(/from\(["']profiles["']\)/);
    expect(source).not.toContain("onboarded_at");
    expect(source).not.toContain('learner_type: "visual"');
  });

  it("returns a terminal response without creating any account", () => {
    expect(source).toContain("status: 410");
    expect(source).not.toContain("createUser");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
