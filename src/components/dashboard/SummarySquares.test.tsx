import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SummarySquares, assignmentsSummaryLine, testsSummaryLine } from "./SummarySquares";

const counts = (over = 0, today = 0, upcoming = 0, tests = 0) => ({
  overdue: over,
  dueToday: today,
  upcoming,
  testsComing: tests,
});

describe("summary lines", () => {
  it("prioritises overdue, then due today, then the week", () => {
    expect(assignmentsSummaryLine(counts(2, 1, 5))).toMatchObject({ text: "2 overdue", urgent: true });
    expect(assignmentsSummaryLine(counts(0, 1, 5))).toMatchObject({ text: "1 due today", urgent: true });
    expect(assignmentsSummaryLine(counts(0, 0, 5))).toMatchObject({ text: "5 this week", urgent: false });
    expect(assignmentsSummaryLine(counts())).toMatchObject({ text: "Nothing due", urgent: false });
  });

  it("summarises tests without inventing urgency", () => {
    expect(testsSummaryLine(counts(0, 0, 0, 1)).text).toBe("1 coming up");
    expect(testsSummaryLine(counts()).urgent).toBe(false);
  });
});

describe("SummarySquares", () => {
  it("renders assignments, tests and calendar links", () => {
    render(
      <MemoryRouter>
        <SummarySquares counts={counts(1, 0, 2, 1)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Assignments\. 1 overdue/ })).toHaveAttribute(
      "href",
      "/assignments?filter=overdue",
    );
    expect(screen.getByRole("link", { name: /Tests\./ })).toHaveAttribute("href", "/exams");
    expect(screen.getByRole("link", { name: /Calendar\./ })).toHaveAttribute("href", "/calendar");
  });
});
