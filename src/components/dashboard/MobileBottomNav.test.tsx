import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "./MobileBottomNav";

const openCapture = vi.fn();

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: openCapture }),
}));

describe("mobile dashboard navigation", () => {
  it("keeps the daily routine and capture action reachable without a floating overlay", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MobileBottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: /primary mobile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: "Study" })).toHaveAttribute("href", "/study-lab");
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("href", "/classes");

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(openCapture).toHaveBeenCalledTimes(1);
  });
});
