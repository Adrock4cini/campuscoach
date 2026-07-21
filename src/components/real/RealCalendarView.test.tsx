import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealCalendarView } from "./RealCalendarView";
import { toDateKey } from "@/lib/calendar/dateKey";

const mocks = vi.hoisted(() => ({
  openCapture: vi.fn(),
}));

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: mocks.openCapture }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{
      id: "math",
      uuid: "class-uuid",
      name: "Math",
      professor: "Professor",
      location: "Room 1",
      days: [dayLabel(new Date())],
      time: "10:00 AM",
      color: "bg-primary",
      currentTopic: "Addition",
      nextExamDate: "",
      readiness: 40,
      suggestedAction: "Capture notes",
      gradingWeights: [],
      chapters: [],
      schedule: [{
        date: toDateKey(new Date()),
        topic: "Backward Design",
        dueItems: [],
      }],
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: () => ({
    items: [{
      id: "assignment-1",
      client_class_id: "math",
      title: "Problem Set 1",
      due_date: toDateKey(new Date()),
      status: "not_started",
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useRealExams: () => ({
    items: [{
      id: "exam-1",
      client_class_id: "math",
      title: "Unit 1 Exam",
      exam_date: toDateKey(new Date()),
      topics: ["Addition"],
      readiness: 35,
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

function dayLabel(date: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

function Destination() {
  const location = useLocation();
  return <p>{location.pathname}{location.search}</p>;
}

function renderCalendar() {
  return render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <Routes>
        <Route path="/calendar" element={<RealCalendarView />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("real academic calendar", () => {
  beforeEach(() => mocks.openCapture.mockReset());

  it("shows the student's real class, assignment, and exam for the selected day", () => {
    renderCalendar();

    expect(screen.getByText("Math: Backward Design")).toBeInTheDocument();
    expect(screen.getByText("Problem Set 1")).toBeInTheDocument();
    expect(screen.getByText("Unit 1 Exam")).toBeInTheDocument();
  });

  it("opens the exact exam study target instead of a mixed class review", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: /study for unit 1 exam/i }));
    expect(screen.getByText("/study-lab?classId=math&examId=exam-1")).toBeInTheDocument();
  });

  it("starts a class-bound capture from a scheduled class meeting", () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: /capture notes for math/i }));
    expect(mocks.openCapture).toHaveBeenCalledWith(undefined, "math");
  });
});
