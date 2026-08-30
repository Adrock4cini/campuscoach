/**
 * One evidence truth: a failed evidence read is NOT zero evidence.
 *
 * Live QA saw a class with 13 saved materials reported as "nothing has been
 * captured" because the underlying evidence query failed. Readiness must say
 * it could not check, and must never present a readiness percentage from a
 * failed read.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const signals = vi.fn();
vi.mock("@/lib/intelligence/useClassReadinessSignals", () => ({
  useClassReadinessSignals: (...args: unknown[]) => signals(...args),
}));

import { ClassReadinessCard } from "./ClassReadinessCard";

const explanation = {
  status: "scored" as const,
  label: "Getting there",
  percent: 62,
  headline: "headline",
  factors: [],
  nextStep: "next",
  weakCount: 0,
};

describe("ClassReadinessCard evidence honesty", () => {
  it("never claims nothing was captured when the evidence read failed", () => {
    signals.mockReturnValue({
      explanation,
      signals: { conceptCount: 0, strengths: [], attempts: 0, captureCount: 0 },
      loading: false,
      error: true,
      reload: vi.fn(),
    });
    render(<ClassReadinessCard classId="math-hs" />);
    expect(screen.getByText(/Couldn’t check your evidence/i)).toBeInTheDocument();
    expect(screen.queryByText("62%")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 class materials/i)).not.toBeInTheDocument();
  });

  it("shows the real evidence counts when the read succeeds", () => {
    signals.mockReturnValue({
      explanation,
      signals: { conceptCount: 32, strengths: [0.6], attempts: 4, captureCount: 13 },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    render(<ClassReadinessCard classId="math-hs" />);
    expect(screen.getByText(/13 class materials/i)).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });
});
