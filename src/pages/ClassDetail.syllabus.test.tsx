import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassDetail from "./ClassDetail";

const mocks = vi.hoisted(() => ({ hasSyllabus: false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, isDemoMode: false }),
}));

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: vi.fn() }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{
      id: "math-1",
      uuid: "class-uuid",
      name: "Math",
      professor: "Professor Rivera",
      location: "Room 10",
      days: ["Tue"],
      time: "10:00 AM",
      color: "bg-primary",
      currentTopic: "Fractions",
      nextExamDate: "",
      readiness: 25,
      suggestedAction: "Add notes",
      gradingWeights: [],
      chapters: [],
      hasSyllabus: mocks.hasSyllabus,
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/components/real/RealClassAssignmentsExams", () => ({
  RealClassAssignmentsExams: () => <div>Class deadlines</div>,
}));

vi.mock("@/components/capture/ClassMemory", () => ({
  ClassMemory: () => <div>Class memory</div>,
}));

describe("real class syllabus entry", () => {
  beforeEach(() => {
    mocks.hasSyllabus = false;
  });

  it("keeps the syllabus bound to the open class", () => {
    render(
      <MemoryRouter initialEntries={["/classes/math-1"]}>
        <Routes>
          <Route path="/classes/:classId" element={<ClassDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Class syllabus" })).toBeInTheDocument();
    expect(screen.getByText("No syllabus added")).toBeInTheDocument();
    expect(screen.getByText(/assignments, quizzes, exam dates, and topics to study/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^add syllabus/i })).toHaveAttribute(
      "href",
      "/classes/math-1/syllabus",
    );
  });

  it("shows the saved state and a view-or-replace action", () => {
    mocks.hasSyllabus = true;
    render(
      <MemoryRouter initialEntries={["/classes/math-1"]}>
        <Routes>
          <Route path="/classes/:classId" element={<ClassDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Syllabus connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view or replace syllabus/i })).toHaveAttribute(
      "href",
      "/classes/math-1/syllabus",
    );
  });
});
