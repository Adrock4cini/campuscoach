import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FloatingActionButton } from "./FloatingActionButton";

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: vi.fn() }),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

describe("floating syllabus entry", () => {
  it("selects the owning class before opening a syllabus", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <FloatingActionButton />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByRole("button", { name: /snap syllabus/i }));

    expect(screen.getByTestId("location")).toHaveTextContent("/classes?intent=syllabus");
  });
});
