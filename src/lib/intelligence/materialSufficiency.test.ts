import { describe, expect, it } from "vitest";
import { assessMaterial } from "./materialSufficiency";

describe("information sufficiency", () => {
  it("never fakes test prep readiness with no material", () => {
    const result = assessMaterial({ conceptCount: 0, captureCount: 0 }, { examTitle: "Unit 1 Test" });
    expect(result.sufficient).toBe(false);
    expect(result.label).toBe("Not enough class material yet");
    expect(result.detail).toContain("Unit 1 Test");
    expect(result.ctaLabel).toBe("Add study material");
  });

  it("honestly confirms material exists when the class is only lightly captured", () => {
    const result = assessMaterial({ conceptCount: 2, captureCount: 1 });
    expect(result.sufficient).toBe(false);
    expect(result.label).toBe("Class material added");
    expect(result.detail).toContain("1 capture and 2 concepts are ready");
    expect(result.ctaLabel).toBe("Add more material");
  });

  it("does not claim material is missing when a capture produced no concepts", () => {
    const result = assessMaterial({ conceptCount: 0, captureCount: 1 });
    expect(result.label).toBe("Class material added");
    expect(result.detail).toContain("1 capture and 0 concepts are ready");
  });

  it("unlocks grounded test prep once real material exists", () => {
    const result = assessMaterial({ conceptCount: 8, captureCount: 3 }, { examTitle: "Unit 1 Test" });
    expect(result.sufficient).toBe(true);
    expect(result.ctaLabel).toBe("Prepare for this test");
  });
});
