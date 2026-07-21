import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RealExamsView } from "./RealExamsView";

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "math", name: "College Algebra" }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealExams: () => ({
    items: [{
      id: "exam-1",
      client_class_id: "math",
      title: "Addition test",
      exam_date: "2099-09-01",
      readiness: 73,
      topics: ["Addition"],
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  daysUntil: () => 5,
}));

vi.mock("@/lib/realData/exams", () => ({ deleteExam: vi.fn() }));

vi.mock("@/components/real/AddExamDialog", () => ({
  AddExamDialog: () => null,
}));

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe("real exam actions", () => {
  it("starts study with both the selected class and exam boundary", async () => {
    render(
      <MemoryRouter initialEntries={["/exams"]}>
        <RealExamsView />
        <Location />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Study for this exam/i }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/study-lab?classId=math&examId=exam-1",
      );
    });
  });
});
