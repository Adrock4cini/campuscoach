import { describe, expect, it } from "vitest";
import { findKnownSchool, searchKnownSchools } from "./schoolDirectory";
import { canonicalizeSchoolName } from "./options";

describe("school directory", () => {
  it("finds a high school when the student omits 'School'", () => {
    const names = searchKnownSchools("Herriman High").map((s) => s.name);
    expect(names).toContain("Herriman High School");
    expect(searchKnownSchools("herriman")[0].name).toBe("Herriman High School");
  });

  it("canonicalizes a partially typed known school", () => {
    expect(canonicalizeSchoolName("Herriman High")).toBe("Herriman High School");
    expect(canonicalizeSchoolName("  Weber   State University ")).toBe("Weber State University");
  });

  it("leaves unknown schools untouched", () => {
    expect(canonicalizeSchoolName("Somewhere Prep Academy")).toBe("Somewhere Prep Academy");
    expect(findKnownSchool("Somewhere Prep Academy")).toBeNull();
  });
});
