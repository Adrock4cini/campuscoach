import { describe, expect, it } from "vitest";
import { deriveClassTruth } from "./classTruth";
import type { ReadinessExplanation } from "./readinessExplanation";

function explanation(overrides: Partial<ReadinessExplanation> = {}): ReadinessExplanation {
  return {
    status: "early",
    label: "Still learning",
    percent: null,
    headline: "Not enough evidence yet.",
    factors: [],
    nextStep: "Practice.",
    weakCount: 0,
    ...overrides,
  };
}

describe("deriveClassTruth", () => {
  it("never invents preparedness for an empty class", () => {
    expect(deriveClassTruth({
      captureCount: 0,
      conceptCount: 0,
      attempts: 0,
      explanation: explanation({ status: "no-data", label: "Not enough info yet" }),
    })).toEqual({
      materialLabel: "Need material",
      preparednessLabel: "Not practiced",
      nextAction: "Add material",
    });
  });

  it("never asks for a first capture after material exists", () => {
    expect(deriveClassTruth({
      captureCount: 1,
      conceptCount: 2,
      attempts: 0,
      explanation: explanation(),
    })).toEqual({
      materialLabel: "Some material",
      preparednessLabel: "Not practiced",
      nextAction: "Start practice",
    });
  });

  it("shows a readiness percent only after the explainer says evidence is scored", () => {
    expect(deriveClassTruth({
      captureCount: 3,
      conceptCount: 5,
      attempts: 3,
      explanation: explanation({ status: "scored", label: "Needs work", percent: 40, weakCount: 3 }),
    })).toEqual({
      materialLabel: "Good material",
      preparednessLabel: "Needs work · 40%",
      nextAction: "Practice weak spots",
    });
  });
});
