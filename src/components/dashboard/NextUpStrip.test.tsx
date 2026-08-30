import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NextUpStrip } from "./NextUpStrip";

describe("next up strip", () => {
  it("shows a compact drill-in for the next test and next due", () => {
    render(
      <MemoryRouter>
        <NextUpStrip
          summary={{
            nextTest: { classId: "bio", className: "Biology", title: "Unit 3", when: "Friday", readinessLabel: "Getting there", insufficient: false, count: 2 },
            nextDue: { assignmentId: "a-1", classId: "eng", className: "English", title: "Essay draft", when: "today", overdue: false, count: 3 },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Biology · Friday/ })).toHaveAttribute("href", "/exams");
    expect(screen.getByText(/Getting there/)).toBeInTheDocument();
    expect(screen.getByText("2 tests coming up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /English · today/ })).toHaveAttribute("href", "/assignments/a-1");
    expect(screen.getByText("3 due this week")).toBeInTheDocument();
  });

  it("says need material instead of a score when there is no evidence", () => {
    render(
      <MemoryRouter>
        <NextUpStrip
          summary={{
            nextTest: { classId: "math", className: "Math", title: "Exam 1", when: "in 12d", readinessLabel: "Need more material", insufficient: true, count: 1 },
            nextDue: null,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Need material/)).toBeInTheDocument();
    expect(screen.queryByText(/tests coming up/)).not.toBeInTheDocument();
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  it("stays truthful when nothing is scheduled", () => {
    render(
      <MemoryRouter>
        <NextUpStrip summary={{ nextTest: null, nextDue: null }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Nothing scheduled yet/)).toBeInTheDocument();
  });
});
