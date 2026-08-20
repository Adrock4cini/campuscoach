import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SchoolAtAGlance } from "./SchoolAtAGlance";

describe("school at a glance", () => {
  it("summarizes the week and links to real list views", () => {
    render(
      <MemoryRouter>
        <SchoolAtAGlance
          glance={{ thisWeek: { assignments: 3, tests: 2 }, nextWeek: { assignments: 4, tests: 1 }, overdue: 1 }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("3 assignments · 2 tests")).toBeInTheDocument();
    expect(screen.getByText("4 assignments · 1 test")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Assignments$/ })).toHaveAttribute("href", "/assignments");
    expect(screen.getByRole("link", { name: /Tests & exams/ })).toHaveAttribute("href", "/exams");
    expect(screen.getByRole("link", { name: /1 overdue/ })).toHaveAttribute("href", "/assignments");
  });

  it("stays truthful when nothing is scheduled", () => {
    render(
      <MemoryRouter>
        <SchoolAtAGlance
          glance={{ thisWeek: { assignments: 0, tests: 0 }, nextWeek: { assignments: 0, tests: 0 }, overdue: 0 }}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Nothing scheduled")).toHaveLength(2);
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
  });
});
