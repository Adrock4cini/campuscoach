/**
 * Study is always entered *from* somewhere — an assignment, or a class.
 * Losing that origin turns Study Lab into a dead end, so the back link is a
 * guarded behaviour, not decoration.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const classState = vi.hoisted(() => ({ loading: false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real" }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "bio101", name: "Biology 101", currentTopic: "Cells" }],
    loading: classState.loading,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/intelligence", () => ({
  useStudyFormatRecommendation: () => ({
    mode: "flashcards",
    label: "Flashcards",
    topic: "Cells",
    suggestedMinutes: 25,
  }),
}));

vi.mock("@/components/study/RealStudySet", () => ({
  RealStudySet: () => <div data-testid="real-study-set" />,
}));

vi.mock("@/components/study/AssignmentTutorSet", () => ({
  AssignmentTutorSet: () => <div data-testid="assignment-tutor-set" />,
}));

vi.mock("@/lib/study/studyLabState", () => ({
  readStudyLabState: () => null,
}));

import StudyLab from "./StudyLab";

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/study-lab${search}`]}>
      <StudyLab />
    </MemoryRouter>,
  );
}

describe("Study Lab origin navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classState.loading = false;
  });

  it("offers a way back to the assignment that launched the session", () => {
    renderAt("?classId=bio101&assignmentId=a-42");
    const back = screen.getByRole("link", { name: /back to assignment/i });
    expect(back).toHaveAttribute("href", "/assignments/a-42");
  });

  it("offers a way back to the named class when studying for a test", () => {
    renderAt("?classId=bio101&examId=e-9");
    const back = screen.getByRole("link", { name: /back to biology 101/i });
    expect(back).toHaveAttribute("href", "/classes/bio101");
  });

  it("prefers the assignment origin over the class origin", () => {
    renderAt("?classId=bio101&assignmentId=a-42&examId=e-9");
    expect(screen.getByRole("link", { name: /back to assignment/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /back to biology 101/i })).not.toBeInTheDocument();
  });

  it("keeps the current class reachable when study was opened directly", () => {
    renderAt("");
    expect(screen.getByRole("link", { name: /back to biology 101/i })).toHaveAttribute("href", "/classes/bio101");
  });

  it("does not open practice or link back to an unavailable class", () => {
    renderAt("?classId=deleted-class&captureId=old-capture");
    expect(screen.getByRole("status")).toHaveTextContent("This class is no longer available");
    expect(screen.queryByTestId("real-study-set")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^back to/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to classes" })).toBeInTheDocument();
  });

  it("waits for class access to resolve before mounting capture practice", () => {
    classState.loading = true;
    const view = renderAt("?classId=bio101&captureId=note-1");
    expect(screen.getByText("Loading your classes…")).toBeInTheDocument();
    expect(screen.queryByTestId("real-study-set")).not.toBeInTheDocument();
    classState.loading = false;
    view.rerender(<MemoryRouter initialEntries={["/study-lab?classId=bio101&captureId=note-1"]}><StudyLab /></MemoryRouter>);
    expect(screen.getByTestId("real-study-set")).toBeInTheDocument();
  });

  it("can recover an old class link when only one accessible class remains", () => {
    renderAt("?classId=deleted-class&captureId=old-capture");
    fireEvent.click(screen.getByText("Change class"));
    fireEvent.click(screen.getByRole("button", { name: "Biology 101" }));
    expect(screen.getByTestId("real-study-set")).toBeInTheDocument();
    expect(screen.queryByText(/This class is no longer available/)).not.toBeInTheDocument();
  });
});
