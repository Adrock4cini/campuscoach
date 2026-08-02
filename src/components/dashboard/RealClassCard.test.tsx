import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RealClassCard } from "./RealClassCard";
import type { ClassInfo } from "@/data/demo";

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
  it("keeps each compact class row identifiable and class-bound", () => {
    render(
      <MemoryRouter>
        <RealClassCard c={math} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("img", { name: "61% ready" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Math, 61% ready" })).toHaveAttribute("href", "/classes/math-101");
  });
});
