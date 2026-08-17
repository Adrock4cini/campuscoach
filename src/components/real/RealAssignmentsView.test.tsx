import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealAssignmentsView } from "./RealAssignmentsView";

const mocks = vi.hoisted(() => ({
  deleteAssignment: vi.fn(),
  updateAssignment: vi.fn(),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "math", name: "Algebra" }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: () => ({
    items: [{
      id: "assignment-1",
      user_id: "student",
      client_class_id: "math",
      class_id: null,
      title: "Practice set",
      due_date: "2099-09-01",
      estimated_minutes: 20,
      priority: "medium",
      status: "not_started",
      notes: null,
      source: "manual",
      created_at: "2026-08-17T00:00:00Z",
      updated_at: "2026-08-17T00:00:00Z",
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  daysUntil: () => 5,
}));

vi.mock("@/lib/realData/assignments", () => ({
  deleteAssignment: mocks.deleteAssignment,
  updateAssignment: mocks.updateAssignment,
}));

vi.mock("@/components/real/AddAssignmentDialog", () => ({ AddAssignmentDialog: () => null }));

describe("real assignment destructive actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.deleteAssignment.mockReset().mockResolvedValue(true);
    mocks.updateAssignment.mockReset().mockResolvedValue({});
  });

  it("requires confirmation and uses comfortable completion and delete targets", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MemoryRouter><RealAssignmentsView /></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Mark Practice set complete" })).toHaveClass("h-11", "w-11");
    const deleteButton = screen.getByRole("button", { name: "Delete Practice set" });
    expect(deleteButton).toHaveClass("h-11", "w-11");
    fireEvent.click(deleteButton);

    expect(confirm).toHaveBeenCalled();
    expect(mocks.deleteAssignment).not.toHaveBeenCalled();
  });
});
