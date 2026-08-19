import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { QuickAddModal } from "./QuickAddModal";

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: vi.fn() }),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

describe("Quick Add navigation", () => {
  it("selects a class instead of reopening onboarding", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <QuickAddModal open onOpenChange={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /upload syllabus/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("/classes?intent=syllabus");
  });

  it("names list-only actions truthfully", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <QuickAddModal open onOpenChange={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: /^Add Assignment/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Assignments/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("/assignments");

    expect(screen.queryByRole("button", { name: /^Add Exam/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Tests & Exams/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("/exams");
  });
});
