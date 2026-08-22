import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealCoachHero } from "./RealCoachHero";
import type { CoachRecommendation } from "@/lib/coach/recommend";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  reload: vi.fn(),
  error: null as string | null,
  recommendations: [] as CoachRecommendation[],
}));

vi.mock("@/lib/coach/useCoachRecommendations", () => ({
  useCoachRecommendations: () => ({ recommendations: mocks.recommendations, loading: false, error: mocks.error, reload: mocks.reload }),
}));

vi.mock("@/lib/coachFunctions/useCoachFunction", () => ({
  useCoachFunction: () => ({ execute: mocks.execute, loading: false, result: null }),
}));

describe("real coach hero hierarchy", () => {
  beforeEach(() => {
    mocks.execute.mockClear();
    mocks.reload.mockClear();
    mocks.error = null;
    mocks.recommendations = [reviewRecommendation(), scienceRecommendation()];
  });

  it("shows one cohesive primary action and hides supporting tools by default", () => {
    const { container } = renderHero();
    const region = screen.getByRole("region", { name: "Math" });

    expect(within(region).getByText("Recommended next")).toBeInTheDocument();
    expect(within(region).getByText("7 concepts are ready for review.")).toBeInTheDocument();
    expect(within(region).getByText("10 min")).toBeInTheDocument();
    expect(within(region).getByText(/Should move test readiness up about/)).toBeInTheDocument();
    expect(within(region).getByText("4 points")).toBeInTheDocument();
    expect(within(region).getByText("Recommended because Fractions is overdue.")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /start review/i })).toHaveAttribute(
      "href",
      "/study-lab?classId=math&conceptIds=c1%2Cc2",
    );
    expect(within(region).queryByRole("button", { name: /check weak spots/i })).not.toBeInTheDocument();
    expect(within(region).queryByText("Study another class")).not.toBeInTheDocument();
    expect(container.querySelector("a button, button a")).toBeNull();
  });

  it("keeps evidence, weak spots, and secondary recommendations behind one disclosure", () => {
    renderHero();
    const region = screen.getByRole("region", { name: "Math" });

    fireEvent.click(within(region).getByRole("button", { name: "Why this is first" }));

    expect(within(region).getByRole("list", { name: "Recommendation evidence" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Check weak spots" })).toBeInTheDocument();
    expect(within(region).getByText("Study another class")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /Science/i })).toHaveAttribute(
      "href",
      "/study-lab?classId=science&conceptIds=s1",
    );

    fireEvent.click(within(region).getByRole("button", { name: "Check weak spots" }));
    expect(mocks.execute).toHaveBeenCalledWith({ limit: 6 });
  });

  it("keeps capture recommendations class-bound", () => {
    mocks.recommendations = [{
      ...scienceRecommendation(),
      id: "science:capture",
      action: "capture",
      conceptIds: [],
      why: "Add a note to build your first study set.",
      impact: { readinessDelta: 0, examWeight: 0 },
    }];

    renderHero();
    expect(screen.getByRole("link", { name: /capture now/i })).toHaveAttribute("href", "/classes/science?capture=1");
  });

  it("does not repeat the headline reason as evidence", () => {
    mocks.recommendations = [{
      ...reviewRecommendation(),
      why: "Unit 1 Test is in 14 days.",
      evidence: [{ type: "exam", label: "Unit 1 Test in 14d", weight: 1 }],
    }];

    renderHero();
    const region = screen.getByRole("region", { name: "Math" });

    expect(within(region).getByText("Unit 1 Test is in 14 days.")).toBeInTheDocument();
    expect(within(region).queryByText(/Recommended because/i)).not.toBeInTheDocument();
  });


  it("fails closed when required coach data cannot be loaded", () => {
    mocks.error = "We couldn’t load your assignments.";
    renderHero();

    expect(screen.getByText("Couldn’t load today’s focus")).toBeInTheDocument();
    expect(screen.queryByText("7 concepts are ready for review.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});

function renderHero() {
  return render(
    <MemoryRouter>
      <RealCoachHero />
    </MemoryRouter>,
  );
}

function reviewRecommendation(): CoachRecommendation {
  return {
    id: "math:review",
    action: "review",
    classId: "math",
    className: "Math",
    conceptIds: ["c1", "c2"],
    minutes: 10,
    why: "7 concepts are ready for review.",
    evidence: [{ type: "assignment", label: "Fractions is overdue", weight: 1 }],
    impact: { readinessDelta: 4, examWeight: 0 },
    score: 1,
  };
}

function scienceRecommendation(): CoachRecommendation {
  return {
    id: "science:review",
    action: "review",
    classId: "science",
    className: "Science",
    conceptIds: ["s1"],
    minutes: 10,
    why: "1 concept is ready for review.",
    evidence: [{ type: "review", label: "1 concept overdue for review", weight: 1 }],
    impact: { readinessDelta: 7, examWeight: 0 },
    score: 0.8,
  };
}
