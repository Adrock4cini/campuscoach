import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    mocks.createExam.mockReset().mockResolvedValue({ id: "exam-1" });
  });

  it("starts readiness from mastery instead of asking the student to guess", async () => {
    render(<AddExamDialog open defaultClientClassId="math" onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/readiness \(%\)/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Midterm 1"), {
      target: { value: "Calculus Midterm" },
    });
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add exam" }));

    await waitFor(() => expect(mocks.createExam).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Calculus Midterm",
        clientClassId: "math",
        examDate: "2026-10-10",
        readiness: 0,
      }),
    ));
  });

  it("keeps the form usable when the save request rejects", async () => {
    mocks.createExam.mockRejectedValueOnce(new Error("offline"));
    render(<AddExamDialog open defaultClientClassId="math" onOpenChange={vi.fn()} />);

    const title = screen.getByPlaceholderText("Midterm 1");
    fireEvent.change(title, { target: { value: "Calculus Midterm" } });
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add exam" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add exam" })).toBeEnabled());
    expect(title).toHaveValue("Calculus Midterm");
  });

  it("requires an explicit class when opened globally", () => {
    render(<AddExamDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Midterm 1"), {
      target: { value: "Calculus Midterm" },
    });
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add exam" }));

    expect(mocks.createExam).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Class" })).toHaveTextContent("Pick a class");
  });
});
