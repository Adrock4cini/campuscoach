import { describe, expect, it } from "vitest";
import { sidebarClassLabel } from "./sidebarClassLabel";

describe("sidebarClassLabel", () => {
  it("prefers the course code so similar names stay distinguishable", () => {
    expect(sidebarClassLabel({ name: "QA — BIOL College", courseCode: "BIOL 101" })).toBe("BIOL 101");
    expect(sidebarClassLabel({ name: "QA — CHEM College", courseCode: "CHEM 110" })).toBe("CHEM 110");
  });

  it("never collapses different classes to the same shared prefix", () => {
    const a = sidebarClassLabel({ name: "QA — BIOL College Class" });
    const b = sidebarClassLabel({ name: "QA — CHEM College Class" });
    expect(a).not.toBe(b);
  });

  it("keeps short names untouched", () => {
    expect(sidebarClassLabel({ name: "Algebra II", courseCode: "" })).toBe("Algebra II");
  });

  it("falls back to a readable label when the name is blank", () => {
    expect(sidebarClassLabel({ name: "   " })).toBe("Class");
  });
});
