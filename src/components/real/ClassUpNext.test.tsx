/**
 * ClassUpNext — the three-signal test card (urgency chip + Coverage +
 * Practice) and the act-first assignment actions.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

type AssignmentFixture = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  source: string;
};

type ExamFixture = {
  id: string;
  title: string;
  exam_date: string | null;
  topics: string[];
  readiness: number;
  source: string;
};

const mocks = vi.hoisted(() => ({
  assignments: [] as AssignmentFixture[],
  exams: [] as ExamFixture[],
  signals: { conceptCount: 0, captureCount: 0, strengths: [] as number[], attempts: 0 },
  signalsLoading: false,
  openCapture: vi.fn(),
}));

vi.mock("@/lib/realData/hooks", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/realData/hooks")>();
  return {
    ...actual,
    useRealAssignments: () => ({ items: mocks.assignments, loading: false }),
    useRealExams: () => ({ items: mocks.exams, loading: false }),
  };
});
vi.mock("@/lib/coach/useCoachRecommendations", () => ({
  useCoachRecommendations: () => ({ recommendations: [], loading: false }),
}));
vi.mock("@/lib/intelligence/useClassReadinessSignals", () => ({
  useClassReadinessSignals: () => ({
    signals: mocks.signals,
    loading: mocks.signalsLoading,
    error: false,
  }),
}));
vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: mocks.openCapture }),
}));
vi.mock("./AddAssignmentDialog", () => ({ AddAssignmentDialog: () => null }));
vi.mock("./AddExamDialog", () => ({ AddExamDialog: () => null }));

import { ClassUpNext } from "./ClassUpNext";

const exam: ExamFixture = {
  id: "e1",
  title: "Unit 3 Test",
  exam_date: "2026-09-01",
  topics: [],
  readiness: 0,
  source: "manual",
};
const assignment: AssignmentFixture = {
  id: "a1",
  title: "Chapter 4 review",
  status: "not_started",
  due_date: "2026-08-30",
  source: "manual",
};

function renderUpNext() {
  return render(
    <MemoryRouter>
      <ClassUpNext classId="c1" className="Biology" />
    </MemoryRouter>,
  );
}

describe("ClassUpNext three-signal test card", () => {
  beforeEach(() => {
    mocks.assignments = [];
    mocks.exams = [];
    mocks.signals = { conceptCount: 0, captureCount: 0, strengths: [], attempts: 0 };
    mocks.signalsLoading = false;
    mocks.openCapture.mockClear();
  });

  it("shows Coverage and Practice chips next to the date urgency chip", () => {
    mocks.exams = [exam];
    mocks.signals = { conceptCount: 6, captureCount: 3, strengths: [0.15, 0.15], attempts: 0 };
    renderUpNext();

    expect(screen.getByText("Good coverage")).toBeInTheDocument();
    expect(screen.getByText("Not practiced")).toBeInTheDocument();
    // Good coverage + no practice → the one obvious action is Study now.
    expect(screen.getByRole("link", { name: /study now/i })).toHaveAttribute(
      "href",
      "/study-lab?classId=c1&examId=e1",
    );
  });

  it("says Need material and offers Add material when coverage is thin", () => {
    mocks.exams = [exam];
    renderUpNext();

    expect(screen.getByText("Need material")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add material for this test/i })).toBeInTheDocument();
  });

  it("says Keep practicing once practice evidence exists", () => {
    mocks.exams = [exam];
    mocks.signals = { conceptCount: 6, captureCount: 3, strengths: [0.5, 0.6], attempts: 4 };
    renderUpNext();

    expect(screen.getByText("Getting there")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /keep practicing/i })).toBeInTheDocument();
  });

  it("exposes Start and Capture problem on the next assignment without status ceremony", () => {
    mocks.assignments = [assignment];
    renderUpNext();

    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/assignments/a1");
    const capture = screen.getByRole("button", { name: /capture problem/i });
    capture.click();
    expect(mocks.openCapture).toHaveBeenCalledWith("scan-assignment", { classId: "c1", assignmentId: "a1" });
  });

  it("says Continue for an in-progress assignment", () => {
    mocks.assignments = [{ ...assignment, status: "in_progress" }];
    renderUpNext();

    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/assignments/a1");
  });
});
