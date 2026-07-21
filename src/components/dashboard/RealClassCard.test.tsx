import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RealClassCard } from "./RealClassCard";
import type { ClassInfo } from "@/data/demo";

const openCapture = vi.fn();

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: openCapture }),
}));

const math: ClassInfo = {
  id: "math-101",
  name: "Math",
  professor: "Dr. Rivera",
  location: "Room 204",
  days: ["Tue", "Thu"],
  time: "10:00 AM",
  color: "bg-primary",
  currentTopic: "Addition",
  nextExamDate: "",
  readiness: 61,
  suggestedAction: "Review",
  gradingWeights: [],
  chapters: [],
};

describe("real class dashboard card", () => {
  it("shows readiness and funnels every capture type through a class-bound action", () => {
    render(
      <MemoryRouter>
        <RealClassCard c={math} />
      </MemoryRouter>,
    );

    expect(screen.getByText("61% ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(openCapture).toHaveBeenCalledWith(undefined, "math-101");
    expect(screen.getByRole("button", { name: "Study" })).toBeInTheDocument();
  });
});
