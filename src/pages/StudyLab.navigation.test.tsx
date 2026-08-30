/**
 * Study is always entered *from* somewhere — an assignment, or a class.
 * Losing that origin turns Study Lab into a dead end, so the back link is a
 * guarded behaviour, not decoration.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real" }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "bio101", name: "Biology 101", currentTopic: "Cells" }],
    loading: false,
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
  beforeEach(() => vi.clearAllMocks());

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

  it("shows no back link when study was opened directly with no origin", () => {
    renderAt("");
    expect(screen.queryByRole("link", { name: /^back to/i })).not.toBeInTheDocument();
  });
});
