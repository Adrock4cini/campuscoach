import { describe, expect, it } from "vitest";
import { getDemoClassIntelligence } from "./classIntelligenceSampleAdapter";

describe("class intelligence sample adapter", () => {
  it.each(["psych101", "bio200", "eng102", "math150"])(
    "provides realistic, deterministic data for %s",
    (classId) => {
      const first = getDemoClassIntelligence(classId);
      const second = getDemoClassIntelligence(classId);

      expect(first.topics.length).toBeGreaterThanOrEqual(3);
      expect(first.debriefs.length).toBeGreaterThanOrEqual(1);
      expect(first.signalUsers).toBeGreaterThan(0);
      expect(first).toEqual(second);
    },
  );

  it("returns fresh arrays and an honest empty sample for an unknown class", () => {
    const first = getDemoClassIntelligence("psych101");
    const second = getDemoClassIntelligence("psych101");
    first.topics[0].topic_name = "mutated";
    first.debriefs[0].format_tags.push("mutated");

    expect(second.topics[0].topic_name).toBe("Memory models");
    expect(second.debriefs[0].format_tags).not.toContain("mutated");
    expect(getDemoClassIntelligence("unknown")).toEqual({
      topics: [],
      debriefs: [],
      signalCount: 0,
      signalUsers: 0,
      weeklyContributions: 0,
    });
  });
});
