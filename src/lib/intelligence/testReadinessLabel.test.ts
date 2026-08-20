import { describe, expect, it } from "vitest";
import { READINESS_MEANING, labelTestReadiness } from "./testReadinessLabel";

describe("labelTestReadiness", () => {
  it("never scores a test with no practice", () => {
    expect(labelTestReadiness(0).level).toBe("unstarted");
    expect(labelTestReadiness(null).label).toBe("Need more material");
    expect(labelTestReadiness(undefined).level).toBe("unstarted");
  });

  it("maps evidence to plain student words", () => {
    expect(labelTestReadiness(20).label).toBe("Needs work");
    expect(labelTestReadiness(60).label).toBe("Getting there");
    expect(labelTestReadiness(90).label).toBe("Strong");
  });

  it("always carries a meaning and never claims a grade or pass chance", () => {
    for (const v of [0, 30, 60, 95]) {
      const l = labelTestReadiness(v);
      expect(l.meaning.length).toBeGreaterThan(10);
      expect(l.label).not.toMatch(/%/);
      expect(l.meaning).not.toMatch(/pass|grade|chance|probab/i);
    }
    expect(READINESS_MEANING).toMatch(/not a predicted grade/i);
  });
});
