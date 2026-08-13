import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoTodaysPlan } from "./DemoTodaysPlan";
import type { DemoClassAgendaItem } from "@/lib/demo/dashboardSampleAdapter";

const guards = vi.hoisted(() => ({
  useCapture: vi.fn(),
  useRealAssignments: vi.fn(),
  useRealExams: vi.fn(),
}));

vi.mock("@/contexts/CaptureContext", () => ({ useCapture: guards.useCapture }));
vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: guards.useRealAssignments,
  useRealExams: guards.useRealExams,
}));

describe("DemoTodaysPlan", () => {
  beforeEach(() => {
    guards.useCapture.mockClear();
    guards.useRealAssignments.mockClear();
    guards.useRealExams.mockClear();
  });

  it("opens the matching class without promising unaligned assignment or exam destinations", () => {
    renderDemo([classItem()]);

    fireEvent.click(screen.getByRole("button", { name: "Open Psychology 101" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/classes/psych%20101");
    expect(screen.queryByRole("link", { name: "View calendar" })).not.toBeInTheDocument();
    expect(guards.useCapture).not.toHaveBeenCalled();
    expect(guards.useRealAssignments).not.toHaveBeenCalled();
    expect(guards.useRealExams).not.toHaveBeenCalled();
  });
});

function renderDemo(agenda: DemoClassAgendaItem[]) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <DemoTodaysPlan agenda={agenda} now={new Date("2026-08-12T08:00:00")} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function classItem(): DemoClassAgendaItem {
  return {
    kind: "class",
    id: "class-1",
    classId: "psych 101",
    className: "Psychology 101",
    title: "Psychology 101 class",
    at: new Date("2026-08-12T10:00:00"),
    meta: "Today · 10:00 AM",
  };
}
