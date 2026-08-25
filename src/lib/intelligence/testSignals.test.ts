import { describe, expect, it } from "vitest";
import {
  coverageSignal,
  nextTestAction,
  practiceSignal,
} from "./testSignals";

describe("coverageSignal", () => {
  it("says Need material when nothing is captured", () => {
    expect(coverageSignal({ conceptCount: 0, captureCount: 0 })).toEqual({
      level: "need-material",
      label: "Need material",
    });
  });

  it("says Some material when captures exist but prep would be thin", () => {
    expect(coverageSignal({ conceptCount: 2, captureCount: 1 })).toEqual({
      level: "some-material",
      label: "Some material",
    });
  });

  it("says Good coverage only above the grounded-prep thresholds", () => {
    expect(coverageSignal({ conceptCount: 5, captureCount: 2 })).toEqual({
      level: "good-coverage",
      label: "Good coverage",
    });
    expect(coverageSignal({ conceptCount: 4, captureCount: 3 }).level).toBe("some-material");
  });
});

describe("practiceSignal", () => {
  it("says Not practiced when the student has no attempts, even with seeded mastery", () => {
    expect(practiceSignal({ attempts: 0, strengths: [0.15, 0.15] })).toEqual({
      level: "not-practiced",
      label: "Not practiced",
    });
  });

  it("says Getting there once practice exists below the strong bar", () => {
    expect(practiceSignal({ attempts: 4, strengths: [0.4, 0.6] }).label).toBe("Getting there");
  });

  it("says Strong when practiced concepts average at or above 0.75", () => {
    expect(practiceSignal({ attempts: 9, strengths: [0.8, 0.9] }).label).toBe("Strong");
  });
});

describe("nextTestAction", () => {
  const good = { level: "good-coverage", label: "Good coverage" } as const;
  const thin = { level: "need-material", label: "Need material" } as const;

  it("prioritizes Add material whenever coverage is not good", () => {
    expect(nextTestAction(thin, { level: "strong", label: "Strong" }).action).toBe("add-material");
    expect(nextTestAction(thin, { level: "strong", label: "Strong" }).label).toBe("Add material");
  });

  it("says Study now when coverage is good but nothing is practiced", () => {
    expect(nextTestAction(good, { level: "not-practiced", label: "Not practiced" }).label)
      .toBe("Study now");
  });

  it("says Keep practicing once practice evidence exists", () => {
    expect(nextTestAction(good, { level: "getting-there", label: "Getting there" }).label)
      .toBe("Keep practicing");
    expect(nextTestAction(good, { level: "strong", label: "Strong" }).label)
      .toBe("Keep practicing");
  });
});
