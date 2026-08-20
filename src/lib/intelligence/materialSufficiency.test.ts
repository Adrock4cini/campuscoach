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

  it("still asks for more when the class is only lightly captured", () => {
    const result = assessMaterial({ conceptCount: 2, captureCount: 1 });
    expect(result.sufficient).toBe(false);
    expect(result.ctaLabel).toBe("Add study material");
  });

  it("unlocks grounded test prep once real material exists", () => {
    const result = assessMaterial({ conceptCount: 8, captureCount: 3 }, { examTitle: "Unit 1 Test" });
    expect(result.sufficient).toBe(true);
    expect(result.ctaLabel).toBe("Prepare for this test");
  });
});
