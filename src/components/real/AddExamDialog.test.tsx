import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddExamDialog } from "./AddExamDialog";

const mocks = vi.hoisted(() => ({
  createExam: vi.fn().mockResolvedValue({ id: "exam-1" }),
  classes: [{ id: "math", uuid: "math-uuid", name: "Math" }],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: mocks.classes,
  }),
}));

vi.mock("@/lib/realData/exams", () => ({ createExam: mocks.createExam }));

describe("AddExamDialog readiness integrity", () => {
  it("starts readiness from mastery instead of asking the student to guess", async () => {
    render(<AddExamDialog open onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/readiness \(%\)/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Midterm 1"), {
      target: { value: "Calculus Midterm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add exam" }));

    await waitFor(() => expect(mocks.createExam).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Calculus Midterm",
        clientClassId: "math",
        readiness: 0,
      }),
    ));
  });
});
