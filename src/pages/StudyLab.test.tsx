import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import StudyLab from "./StudyLab";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real" }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [
      { id: "math", name: "Math" },
      { id: "science", name: "Science" },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/intelligence", () => ({
  useStudyFormatRecommendation: () => ({
    mode: "flashcards",
    label: "Flashcards",
    suggestedMinutes: 10,
    topic: "Review",
  }),
}));

vi.mock("@/components/study/RealStudySet", () => ({
  RealStudySet: ({ classId, initialCaptureId }: { classId: string; initialCaptureId?: string }) => (
    <p data-testid="real-study-set">{classId}:{initialCaptureId ?? "none"}</p>
  ),
}));

function RouteHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/study-lab?classId=science&captureId=science-note")}>Open science capture</button>
      <Routes>
        <Route path="/study-lab" element={<StudyLab />} />
      </Routes>
    </>
  );
}

describe("Study Lab class handoff", () => {
  it("follows a new capture URL when the page is already open", () => {
    render(
      <MemoryRouter initialEntries={["/study-lab?classId=math&captureId=math-note"]}>
        <RouteHarness />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("real-study-set")).toHaveTextContent("math:math-note");
    fireEvent.click(screen.getByRole("button", { name: /open science capture/i }));
    expect(screen.getByTestId("real-study-set")).toHaveTextContent("science:science-note");
  });
});
