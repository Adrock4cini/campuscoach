import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ClassDetail from "./ClassDetail";

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
      hasSyllabus: false,
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

function renderClass() {
  render(
    <MemoryRouter initialEntries={["/classes/math-1"]}>
      <Routes>
        <Route path="/classes/:classId" element={<ClassDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("class detail control hierarchy", () => {
  it("offers one primary capture action instead of a button wall", () => {
    renderClass();
    const capture = screen.getByRole("button", { name: /^capture$/i });
    expect(capture).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /homework help/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /teacher hint/i })).toBeInTheDocument();
    // Study Lab is a quiet tertiary link, not a fourth competing button.
    expect(screen.getByRole("button", { name: /study this class/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^study lab$/i })).not.toBeInTheDocument();
  });

  it("keeps a back path to the classes list", () => {
    renderClass();
    expect(screen.getByRole("button", { name: "Back to classes" })).toBeInTheDocument();
  });

  it("hides syllabus detail behind progressive disclosure", () => {
    renderClass();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^add syllabus/i })).toHaveAttribute(
      "href",
      "/classes/math-1/syllabus",
    );
  });
});
