import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardAgendaView } from "./DashboardAgendaView";
import type { DashboardAgendaItem } from "@/lib/calendar/dashboardAgenda";

describe("DashboardAgendaView", () => {
  it("presents overdue work as the only attention items and delegates the action", () => {
    const overdue = assignmentItem("overdue", "Late worksheet", new Date("2026-08-11T23:59:59"));
    const upcoming = assignmentItem("upcoming", "Future worksheet", new Date("2026-08-13T23:59:59"));
    const onOpenItem = vi.fn();

    render(
      <MemoryRouter>
        <DashboardAgendaView
          agenda={[overdue, upcoming]}
          now={new Date("2026-08-12T08:00:00")}
          onOpenItem={onOpenItem}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByText("Late worksheet")).toBeInTheDocument();
    expect(screen.queryByText("Future worksheet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Late worksheet" }));
    expect(onOpenItem).toHaveBeenCalledWith(overdue);
  });

  it("keeps recovery and empty-state routes in the shared presentation", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <DashboardAgendaView agenda={[]} error="offline" onRetry={onRetry} onOpenItem={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <DashboardAgendaView agenda={[]} onOpenItem={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Import syllabus" })).toHaveAttribute(
      "href",
      "/classes?intent=syllabus",
    );
    expect(screen.getByRole("link", { name: /view calendar/i })).toHaveAttribute("href", "/calendar");
  });

  it("can hide the calendar destination when a data mode has not aligned it yet", () => {
    render(
      <MemoryRouter>
        <DashboardAgendaView
          agenda={[]}
          calendarHref={null}
          onOpenItem={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: /view calendar/i })).not.toBeInTheDocument();
  });
});

function assignmentItem(id: string, title: string, at: Date): DashboardAgendaItem {
  return {
    kind: "assignment",
    id,
    classId: "math",
    className: "Math",
    title,
    at,
    meta: "Due soon",
  };
}
