import { describe, expect, it } from "vitest";
import { academicTermOptions, canonicalizeSchoolName } from "./options";

describe("onboarding options", () => {
  it("normalizes common school aliases", () => {
    expect(canonicalizeSchoolName("USU")).toBe("Utah State University");
    expect(canonicalizeSchoolName("Utah State")).toBe("Utah State University");
    expect(canonicalizeSchoolName("Utah State University")).toBe("Utah State University");
  });

  it("keeps an official school name while cleaning whitespace", () => {
    expect(canonicalizeSchoolName("  Weber   State University ")).toBe("Weber State University");
  });

  it("returns canonical terms around the current term", () => {
    const terms = academicTermOptions(new Date("2026-07-14T12:00:00Z"));
    expect(terms).toContain("Summer 2026");
    expect(terms).toContain("Fall 2026");
    expect(terms).not.toContain("Fall 202");
  });
});
