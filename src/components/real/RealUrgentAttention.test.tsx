/**
 * Overdue resolution must never falsify the teacher-assigned due date.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RealUrgentAttention } from "./RealUrgentAttention";

const updateAssignment = vi.fn(async () => ({ id: "a1" }));

vi.mock("@/lib/realData/assignments", () => ({
  updateAssignment: (...args: unknown[]) => updateAssignment(...(args as [])),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: () => ({
    items: [
      {
        id: "a1",
        title: "Lab report",
        due_date: "2026-08-10",
        status: "not_started",
        class_id: null,
        client_class_id: "bio",
      },
    ],
    loading: false,
    reload: vi.fn(),
  }),
  useRealExams: () => ({ items: [], loading: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("overdue resolution semantics", () => {
  beforeEach(() => updateAssignment.mockClear());

  it("records progress without rewriting the real due date", async () => {
    render(
      <MemoryRouter>
        <RealUrgentAttention
          classes={[{ id: "bio", name: "Biology" } as never]}
          now={new Date("2026-08-20T12:00:00Z")}
        />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("button", { name: /still working on it/i }));

    await waitFor(() => expect(updateAssignment).toHaveBeenCalled());
    const [, patch] = updateAssignment.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(patch).toEqual({ status: "in_progress" });
    expect(patch).not.toHaveProperty("due_date");
  });
});
