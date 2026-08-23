import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealAssignmentDetail } from "./RealAssignmentDetail";

const mocks = vi.hoisted(() => ({
  getAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  openCapture: vi.fn(),
}));

vi.mock("@/contexts/CaptureContext", () => ({ useCapture: () => ({ open: mocks.openCapture }) }));
vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({ classes: [{ id: "bio", name: "Biology 101" }], loading: false, error: null, reload: vi.fn() }),
}));
vi.mock("@/lib/realData/hooks", () => ({ daysUntil: () => 2 }));
vi.mock("@/lib/realData/assignments", () => ({
  getAssignment: mocks.getAssignment,
  updateAssignment: mocks.updateAssignment,
  deleteAssignment: mocks.deleteAssignment,
}));

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/assignments/a-1"]}>
      <Routes>
        <Route path="/assignments/:assignmentId" element={<RealAssignmentDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RealAssignmentDetail", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAssignment.mockResolvedValue({
      id: "a-1",
      user_id: "student",
      client_class_id: "bio",
      class_id: null,
      title: "Chapter 4 problem set",
      due_date: "2099-01-05",
      estimated_minutes: 45,
      priority: "high",
      status: "not_started",
      notes: "Show your work",
      source: "manual",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
  });

  it("shows the student's real assignment, not a demo one", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Chapter 4 problem set" })).toBeInTheDocument();
    expect(screen.getByText("Biology 101")).toBeInTheDocument();
    expect(screen.getByText("Show your work")).toBeInTheDocument();
  });

  it("offers a recoverable retry instead of a dead end when loading fails", async () => {
    mocks.getAssignment.mockRejectedValue(new Error("offline"));
    renderDetail();
    expect(await screen.findByText("Couldn’t load this assignment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says plainly when the assignment was deleted elsewhere", async () => {
    mocks.getAssignment.mockResolvedValue(null);
    renderDetail();
    expect(await screen.findByText("This assignment no longer exists")).toBeInTheDocument();
  });
});
