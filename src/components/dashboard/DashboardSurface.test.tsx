import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ClassInfo } from "@/data/demo";
import { DashboardSurface } from "./DashboardSurface";

describe("shared dashboard surface", () => {
  it("keeps one landmark order for real and sample data", () => {
    const { rerender } = renderSurface(false);
    expectLandmarkOrder();
    expect(screen.queryByRole("note", { name: "Demo information" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add another class/i })).toHaveAttribute("href", "/classes/new");

    rerender(surface(true));
    expectLandmarkOrder();
    const notice = screen.getByRole("note", { name: "Demo information" });
    expect(notice).toHaveTextContent("Demo mode · sample data");
    expect(notice).toHaveTextContent("Changes aren’t saved to your account.");
    expect(screen.queryByRole("link", { name: /add another class/i })).not.toBeInTheDocument();
  });

  it("uses the same production class row and route in sample mode", () => {
    renderSurface(true);

    expect(screen.getByRole("link", { name: "Open Biology, 64% ready" }))
      .toHaveAttribute("href", "/classes/bio%2F101");
  });
});

function renderSurface(sample: boolean) {
  return render(surface(sample));
}

function surface(sample: boolean) {
  return (
    <MemoryRouter>
      <DashboardSurface
        classes={[biology()]}
        sample={sample}
        coach={<section aria-labelledby="test-focus"><h2 id="test-focus">Today's focus</h2></section>}
        agenda={<section aria-labelledby="test-agenda"><h2 id="test-agenda">Up next</h2></section>}
      />
    </MemoryRouter>
  );
}

function expectLandmarkOrder() {
  const shortcuts = screen.getByRole("navigation", { name: "Class shortcuts" });
  const focus = screen.getByRole("heading", { name: "Today's focus" });
  const agenda = screen.getByRole("heading", { name: "Up next" });
  const classes = screen.getByRole("heading", { name: "Your classes" });

  // Adaptive layer first, then the stable class rail, then the agenda and list.
  expect(focus.compareDocumentPosition(shortcuts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(shortcuts.compareDocumentPosition(agenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(agenda.compareDocumentPosition(classes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

}

function biology(): ClassInfo {
  return {
    id: "bio/101",
    name: "Biology",
    professor: "Dr. Chen",
    location: "Science Hall",
    days: ["Tue", "Thu"],
    time: "9:00 AM",
    color: "bg-success",
    currentTopic: "Genetics",
    nextExamDate: "",
    readiness: 64,
    suggestedAction: "",
    gradingWeights: [],
    chapters: [],
  };
}
