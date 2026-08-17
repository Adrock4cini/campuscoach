import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ClassInfo } from "@/data/demo";
import { ClassShortcutRail } from "./ClassShortcutRail";

const biology = classInfo({
  id: "bio 101/section-a",
  name: "Introduction to Biological Sciences",
  courseCode: "BIO 1010",
  color: "bg-success",
});
const math = classInfo({ id: "math-101", name: "Math", color: "bg-primary" });

describe("dashboard class shortcuts", () => {
  it("provides compact class-bound links and an all-classes destination", () => {
    render(
      <MemoryRouter>
        <ClassShortcutRail classes={[biology, math]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Class shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open BIO 1010, Introduction to Biological Sciences" }))
      .toHaveAttribute("href", "/classes/bio%20101%2Fsection-a");
    expect(screen.getByText("BIO 1010")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Math" })).toHaveAttribute("href", "/classes/math-101");
    expect(screen.getByRole("link", { name: "Open all classes" })).toHaveAttribute("href", "/classes");
    expect(screen.getAllByRole("link", { name: /all classes/i })).toHaveLength(1);
  });

  it("does not render an empty navigation landmark while classes load", () => {
    const { container } = render(
      <MemoryRouter>
        <ClassShortcutRail classes={[]} />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation", { name: "Class shortcuts" })).not.toBeInTheDocument();
  });
});

function classInfo(overrides: Partial<ClassInfo>): ClassInfo {
  return {
    id: "class-id",
    name: "Class",
    professor: "TBD",
    location: "",
    days: [],
    time: "",
    color: "bg-primary",
    currentTopic: "",
    nextExamDate: "",
    readiness: 0,
    suggestedAction: "",
    gradingWeights: [],
    chapters: [],
    ...overrides,
  };
}
