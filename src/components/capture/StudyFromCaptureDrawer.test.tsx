import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryItem } from "./CaptureDetailDrawer";
import { StudyFromCaptureDrawer } from "./StudyFromCaptureDrawer";

const mocks = vi.hoisted(() => ({
  contributeStudySignal: vi.fn(),
  updateReadinessAfterStudy: vi.fn(),
  updateCampusBrainAggregate: vi.fn(),
  extractAggregateSignalFromStudySession: vi.fn(() => ({ classId: "psych101" })),
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  contributeStudySignal: mocks.contributeStudySignal,
}));

vi.mock("@/lib/intelligence/readinessEngine", () => ({
  updateReadinessAfterStudy: mocks.updateReadinessAfterStudy,
  getNextBestActionForClass: vi.fn(() => null),
}));

vi.mock("@/lib/intelligence/aggregateSignals", () => ({
  extractAggregateSignalFromStudySession: mocks.extractAggregateSignalFromStudySession,
  updateCampusBrainAggregate: mocks.updateCampusBrainAggregate,
}));

vi.mock("@/lib/intelligence/learningEngine", () => ({
  getClassLearningSnapshot: vi.fn(() => null),
  getTopLearningRecommendation: vi.fn(() => null),
}));

const item: MemoryItem = {
  id: "capture-1",
  kind: "quick-note",
  topic: "Memory Models",
  date: "2026-08-13",
  keyConcepts: ["Working memory"],
  summary: "Working memory holds a small amount of active information.",
  processingStatus: "ready",
  flashcardsReady: true,
  source: "local",
};

function renderDrawer(persistence: "local-only" | "remote") {
  return render(
    <MemoryRouter>
      <StudyFromCaptureDrawer
        open
        onOpenChange={vi.fn()}
        item={item}
        classId="psych101"
        className="Psychology"
        initialMode="flashcards"
        persistence={persistence}
      />
    </MemoryRouter>,
  );
}

function finishSingleCardSession() {
  fireEvent.click(screen.getByRole("button", { name: /start · flashcards/i }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  fireEvent.click(screen.getByRole("button", { name: /finish/i }));
}

describe("StudyFromCaptureDrawer persistence boundary", () => {
  beforeEach(() => {
    mocks.contributeStudySignal.mockReset().mockResolvedValue({ error: null });
    mocks.updateCampusBrainAggregate.mockReset().mockResolvedValue(undefined);
    mocks.extractAggregateSignalFromStudySession.mockClear();
    mocks.updateReadinessAfterStudy.mockReset().mockResolvedValue({
      readinessDelta: 3,
      momentumDelta: 8,
      baseReadiness: 50,
      newReadiness: 53,
      gradeBefore: "C",
      gradeAfter: "C+",
      className: "Psychology",
      reason: "Consistency compounds — this counts.",
    });
  });

  it("completes demo study locally without topic or aggregate writes", async () => {
    renderDrawer("local-only");
    finishSingleCardSession();

    await waitFor(() => {
      expect(mocks.updateReadinessAfterStudy).toHaveBeenCalledWith(
        expect.objectContaining({ classId: "psych101", captureId: "capture-1" }),
        { persistence: "local-only" },
      );
    });
    expect(mocks.contributeStudySignal).not.toHaveBeenCalled();
    expect(mocks.extractAggregateSignalFromStudySession).not.toHaveBeenCalled();
    expect(mocks.updateCampusBrainAggregate).not.toHaveBeenCalled();
    expect(screen.getByText("Demo readiness estimate")).toBeInTheDocument();
    expect(screen.getByText("Demo practice saved on this device")).toBeInTheDocument();
    expect(screen.getByText(/not saved to an account/i)).toBeInTheDocument();
    expect(screen.queryByText(/updated today's plan/i)).not.toBeInTheDocument();
  });

  it("preserves remote study signals, aggregate, and readiness behavior", async () => {
    renderDrawer("remote");
    finishSingleCardSession();

    await waitFor(() => {
      expect(mocks.contributeStudySignal).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: "psych101",
          sourceType: "study-from-capture:flashcards",
          sourceId: "capture-1",
        }),
      );
      expect(mocks.updateCampusBrainAggregate).toHaveBeenCalledTimes(1);
      expect(mocks.updateReadinessAfterStudy).toHaveBeenCalledWith(
        expect.objectContaining({ classId: "psych101", captureId: "capture-1" }),
        { persistence: "remote" },
      );
    });
  });
});
