import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import type { UrgentItem } from "@/lib/dashboard/urgentItems";
import type { CoachRecommendation } from "@/lib/coach/recommend";
import { AtAGlanceTiles } from "./AtAGlanceTiles";
import { ClassRail } from "./ClassRail";
import { TodayList } from "./TodayList";
import { CoachNextCard } from "./CoachNextCard";
import { QuickActionsRow } from "./QuickActionsRow";

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function classInfo(id: string, name: string, courseCode?: string): ClassInfo {
  return {
    id,
    name,
    courseCode,
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
  } as ClassInfo;
}

function urgent(id: string, overrides: Partial<UrgentItem> = {}): UrgentItem {
  return {
    id,
    kind: "assignment",
    classId: "c1",
    className: "Biology",
    title: `Task ${id}`,
    when: "today",
    daysOut: 0,
    tone: "danger",
    stale: false,
    score: 90,
    ...overrides,
  };
}

describe("Concept C dashboard", () => {
  it("shows the four school-situation counts and links each one somewhere real", () => {
    wrap(<AtAGlanceTiles counts={{ overdue: 2, dueToday: 1, upcoming: 4, testsComing: 3 }} />);

    expect(screen.getByRole("link", { name: /^Overdue: 2/ })).toHaveAttribute("href", "/assignments?filter=overdue");
    expect(screen.getByRole("link", { name: /^Due today: 1/ })).toHaveAttribute("href", "/assignments?filter=today");
    expect(screen.getByRole("link", { name: /^Upcoming: 4/ })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: /^Tests coming: 3/ })).toHaveAttribute("href", "/exams");
  });

  it("renders classes as a scrollable rail with a see-all link and one signal each", () => {
    const classes = Array.from({ length: 14 }, (_, i) => classInfo(`c${i}`, `Class Number ${i}`, `BIO${i}`));
    wrap(
      <ClassRail
        classes={classes}
        alerts={{ c0: { text: "Assignment due today", tone: "warning" } }}
      />,
    );

    const rail = screen.getByRole("list", { name: "Class summaries" });
    expect(within(rail).getAllByRole("listitem")).toHaveLength(14);
    expect(rail.className).toContain("overflow-x-auto");
    expect(screen.getByRole("link", { name: "See all 14 classes" })).toHaveAttribute("href", "/classes");
    expect(screen.getByRole("link", { name: /Open Class Number 0\. Assignment due today/ })).toHaveAttribute("href", "/classes/c0");
    expect(screen.getByRole("link", { name: /Open Class Number 1\. Nothing urgent/ })).toBeInTheDocument();
    expect(screen.getByText("BIO0")).toBeInTheDocument();
  });

  it("shows an empty state instead of fake classes", () => {
    wrap(<ClassRail classes={[]} />);
    expect(screen.getByText("No classes yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first class" })).toHaveAttribute("href", "/classes/new");
  });

  it("caps Today at three rows and offers the rest behind +N more", () => {
    const onOpenItem = vi.fn();
    wrap(<TodayList items={[urgent("1"), urgent("2"), urgent("3"), urgent("4"), urgent("5")]} onOpenItem={onOpenItem} />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "+2 more · view all" })).toHaveAttribute("href", "/assignments");
    expect(screen.getByRole("link", { name: /View full calendar/ })).toHaveAttribute("href", "/calendar");

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });

  it("tells the student plainly when nothing is due", () => {
    wrap(<TodayList items={[]} />);
    expect(screen.getByText(/Nothing is due or overdue today/)).toBeInTheDocument();
  });

  it("renders exactly one coach recommendation with grounded secondary copy", () => {
    const recommendation: CoachRecommendation = {
      id: "r1",
      action: "study",
      classId: "c1",
      className: "Biology",
      conceptIds: ["a", "b", "c"],
      minutes: 20,
      why: "Test in 4 days and three concepts are weak",
      evidence: [],
      impact: { readinessDelta: 5, examWeight: 1 },
      score: 90,
    };

    wrap(<CoachNextCard recommendation={recommendation} />);

    expect(screen.getAllByRole("heading", { name: "Recommended next" })).toHaveLength(1);
    expect(screen.getByText("Targets 3 weak concepts")).toBeInTheDocument();
    expect(screen.queryByText(/points/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start/ })).toHaveAttribute(
      "href",
      "/study-lab?classId=c1&conceptIds=a%2Cb%2Cc",
    );
  });

  it("renders no recommendation section when there is nothing to recommend", () => {
    wrap(<CoachNextCard recommendation={null} />);
    expect(screen.queryByRole("heading", { name: "Recommended next" })).not.toBeInTheDocument();
  });

  it("offers only shipped capture actions", () => {
    const onAction = vi.fn();
    wrap(<QuickActionsRow onAction={onAction} />);

    expect(screen.queryByRole("button", { name: /ask brain/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload file/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Teacher hint" }));
    expect(onAction).toHaveBeenCalledWith("professor-hint");
  });
});
