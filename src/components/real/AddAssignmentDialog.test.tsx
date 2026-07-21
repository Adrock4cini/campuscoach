import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddAssignmentDialog } from "./AddAssignmentDialog";

const mocks = vi.hoisted(() => ({
  createAssignment: vi.fn().mockRejectedValue(new Error("offline")),
  classes: [{ id: "math", uuid: "math-uuid", name: "Math" }] as Array<{
    id: string;
    uuid: string;
    name: string;
  }>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({ classes: mocks.classes }),
}));

vi.mock("@/lib/realData/assignments", () => ({
  createAssignment: mocks.createAssignment,
}));

describe("AddAssignmentDialog save recovery", () => {
  beforeEach(() => {
    mocks.createAssignment.mockReset().mockRejectedValue(new Error("offline"));
    mocks.classes = [{ id: "math", uuid: "math-uuid", name: "Math" }];
  });

  it("keeps the form usable when the save request rejects", async () => {
    render(<AddAssignmentDialog open onOpenChange={vi.fn()} />);

    const title = screen.getByPlaceholderText("Problem set 3");
    fireEvent.change(title, { target: { value: "Problem set 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add assignment" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add assignment" })).toBeEnabled());
    expect(title).toHaveValue("Problem set 3");
  });

  it("does not erase typed work when the class list refreshes", () => {
    const { rerender } = render(<AddAssignmentDialog open onOpenChange={vi.fn()} />);
    const title = screen.getByPlaceholderText("Problem set 3");
    fireEvent.change(title, { target: { value: "Chapter review" } });

    mocks.classes = [
      ...mocks.classes,
      { id: "science", uuid: "science-uuid", name: "Science" },
    ];
    rerender(<AddAssignmentDialog open onOpenChange={vi.fn()} />);

    expect(title).toHaveValue("Chapter review");
  });
});
