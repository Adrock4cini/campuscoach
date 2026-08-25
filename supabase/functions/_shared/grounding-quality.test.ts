import { describe, expect, it } from "vitest";
import {
  assessSourceSufficiency,
  containsSourceFurniture,
  isLogisticsLine,
  isNonExplanatoryFragment,
} from "./grounding-quality";

describe("grounding source quality", () => {
  it.each(["", "Help me", "Study this", "Mitosis", "I don't understand"]) (
    "rejects non-academic or underspecified source: %s",
    (source) => expect(assessSourceSufficiency(source).sufficient).toBe(false),
  );

  it.each([
    "2+2=4",
    "Mitosis has four stages.",
    "Professor said mitosis will be on the test.",
  ])("accepts concrete academic evidence: %s", (source) => {
    expect(assessSourceSufficiency(source).sufficient).toBe(true);
  });
});

describe("OCR furniture and heading fragments", () => {
  const heading = "Exclusive right-to-sell with exclusions © Stringham Schools 159";

  it("rejects an OCR heading with publisher furniture as a usable fact", () => {
    expect(isNonExplanatoryFragment(heading)).toBe(true);
    expect(assessSourceSufficiency(heading).sufficient).toBe(false);
  });

  it("flags publisher furniture even inside a short answer choice", () => {
    expect(containsSourceFurniture("© Stringham Schools 159")).toBe(true);
    expect(containsSourceFurniture("page 42")).toBe(true);
    expect(containsSourceFurniture("Exclusive right-to-sell")).toBe(false);
  });

  it("keeps legitimate short exact facts and equations usable", () => {
    expect(isNonExplanatoryFragment("2+2=4")).toBe(false);
    expect(isNonExplanatoryFragment("F = ma")).toBe(false);
    expect(
      isNonExplanatoryFragment(
        "An exclusive right-to-sell listing pays the broker regardless of who finds the buyer.",
      ),
    ).toBe(false);
  });
});

describe("logistics and schedule lines", () => {
  it.each([
    "Test Friday",
    "Test on Friday",
    "The test is on Friday",
    "Homework is due Monday",
    "Homework due next week",
    "Quiz tomorrow",
    "Our final is next week",
    "Due on Wednesday",
    "No class tomorrow",
    "Class is cancelled",
    "Remember: exam this week",
  ])("flags schedule info as logistics, never knowledge: %s", (line) => {
    expect(isLogisticsLine(line)).toBe(true);
    expect(isNonExplanatoryFragment(line)).toBe(true);
  });

  it.each([
    "Decimals are fractions whose denominator is a power of ten.",
    "The final exam tests your understanding of integrals.",
    "Professor said mitosis will be on the test.",
    "The reading shows that osmosis moves water across a membrane.",
    "2+2=4",
  ])("leaves real academic content usable: %s", (line) => {
    expect(isLogisticsLine(line)).toBe(false);
  });

  it("a logistics-only quick note is not a sufficient source", () => {
    expect(assessSourceSufficiency("Homework is due Monday").sufficient).toBe(false);
    expect(assessSourceSufficiency("The test is on Friday").sufficient).toBe(false);
  });
});
