import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealTodaysPlan } from "./RealTodaysPlan";
import { buildDashboardAgenda } from "@/lib/calendar/dashboardAgenda";
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";

const mocks = vi.hoisted(() => ({
  openCapture: vi.fn(),
  assignments: [] as RealAssignment[],
  exams: [] as RealExam[],
}));

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: mocks.openCapture }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: () => ({
    items: mocks.assignments,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useRealExams: () => ({
    items: mocks.exams,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

describe("real dashboard agenda", () => {
  beforeEach(() => {
    mocks.openCapture.mockClear();
    mocks.assignments.splice(0);
    mocks.exams.splice(0);
  });

  it("keeps the full academic calendar one tap from the dashboard", () => {
    render(
      <MemoryRouter>
        <RealTodaysPlan />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /view calendar/i })).toHaveAttribute("href", "/calendar");
  });

  it("turns the next real class into a preselected capture action", () => {
    const biology = classInfo("biology", "Biology", ["Tue"], "10:00 AM");
    render(
      <MemoryRouter>
        <RealTodaysPlan classes={[biology]} now={new Date("2026-07-21T08:00:00")} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture notes for Biology" }));
    expect(mocks.openCapture).toHaveBeenCalledWith(undefined, "biology");
  });

  it("keeps assignment and exam labels bound to their own classes", () => {
    const now = new Date("2026-07-21T08:00:00");
    const math = classInfo("math", "Math");
    const science = classInfo("science", "Science");
    const assignment = assignmentInfo("assignment-1", "math", "Problem set", "2026-07-22");
    const exam = examInfo("exam-1", "science", "Atoms test", "2026-07-24");

    const agenda = buildDashboardAgenda([math, science], [assignment], [exam], now);

    expect(agenda.find((item) => item.id === "assignment-1")).toMatchObject({
      kind: "assignment",
      classId: "math",
      className: "Math",
    });
    expect(agenda.find((item) => item.id === "exam-1")).toMatchObject({
      kind: "exam",
      classId: "science",
      className: "Science",
    });
  });
});

function classInfo(id: string, name: string, days: string[] = [], time = ""): ClassInfo {
  return {
    id,
    name,
    professor: "",
    location: "",
    days,
    time,
    color: "bg-primary",
    currentTopic: "",
    nextExamDate: "",
    readiness: 0,
    suggestedAction: "",
    gradingWeights: [],
    chapters: [],
  };
}

function assignmentInfo(id: string, classId: string, title: string, dueDate: string): RealAssignment {
  return {
    id,
    user_id: "student-1",
    client_class_id: classId,
    class_id: null,
    title,
    due_date: dueDate,
    estimated_minutes: 30,
    priority: "medium",
    status: "not_started",
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

function examInfo(id: string, classId: string, title: string, examDate: string): RealExam {
  return {
    id,
    user_id: "student-1",
    client_class_id: classId,
    class_id: null,
    title,
    exam_date: examDate,
    topics: [],
    readiness: 72,
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}
