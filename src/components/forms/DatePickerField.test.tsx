import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePickerField } from "./DatePickerField";

describe("DatePickerField", () => {
  it("connects its label and emits the exact selected date key", () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        id="exam-date"
        label="Exam date"
        value=""
        onChange={onChange}
        required
      />,
    );

    const input = screen.getByLabelText("Exam date");
    fireEvent.change(input, { target: { value: "2026-09-18" } });
    expect(onChange).toHaveBeenCalledWith("2026-09-18");
    expect(input).toHaveAttribute("type", "date");
  });

  it("allows an optional date to be cleared", () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        id="due-date"
        label="Due date"
        value="2026-09-18"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear due date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("announces validation errors", () => {
    render(
      <DatePickerField
        id="term-end"
        label="Term ends"
        value=""
        onChange={() => undefined}
        error="Choose an end date"
      />,
    );

    expect(screen.getByLabelText(/term ends/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an end date");
  });
});
