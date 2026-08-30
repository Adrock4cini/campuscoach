/**
 * Readiness must never be readable as a grade. The number always carries its
 * unit, and an unscored class shows no number at all.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const signals = vi.hoisted(() => vi.fn());

vi.mock("@/lib/intelligence/useClassReadinessSignals", () => ({
  useClassReadinessSignals: signals,
}));

import { ClassReadinessCard } from "./ClassReadinessCard";

function scored(percent: number | null, status: "scored" | "insufficient") {
  signals.mockReturnValue({
    loading: false,
    signals: { attempts: 12, conceptCount: 8, captureCount: 3 },
    explanation: {
      status,
      percent,
      label: "Getting there",
      headline: "You're right on most practiced concepts.",
      nextStep: "Practice the two shaky concepts.",
      factors: [{ label: "Practice", detail: "12 questions", tone: "good" as const }],
    },
  });
}

describe("ClassReadinessCard", () => {
  it("labels the number as readiness so it cannot read as a grade", () => {
    scored(62, "scored");
    render(<ClassReadinessCard classId="bio101" />);

    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText(/^ready$/i)).toBeInTheDocument();
    expect(screen.getByText(/how ready you are/i)).toBeInTheDocument();
  });

  it("shows no percentage at all when there is not enough evidence", () => {
    scored(null, "insufficient");
    render(<ClassReadinessCard classId="bio101" />);

    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ready$/i)).not.toBeInTheDocument();
  });
});
