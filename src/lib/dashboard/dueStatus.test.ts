import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_FILTER_TITLE,
  classifyDue,
  dueChipLabel,
  filterAssignments,
  parseAssignmentFilter,
} from "./dueStatus";
import { buildGlanceCounts } from "./glanceCounts";
import type { RealAssignment } from "@/lib/realData/assignments";

const NOW = new Date("2026-08-30T18:00:00Z");

function assignment(partial: Partial<RealAssignment>): RealAssignment {
  return {
    id: partial.id ?? "a1",
    user_id: "u1",
    client_class_id: "c1",
    class_id: null,
    title: partial.title ?? "Work",
    due_date: partial.due_date ?? null,
    estimated_minutes: 30,
    priority: "medium",
    status: partial.status ?? "not_started",
    notes: null,
    source: "manual",
  } as unknown as RealAssignment;
}

describe("shared due-date classification", () => {
  it("classifies overdue, today, soon and later from the local calendar day", () => {
    expect(classifyDue("2026-08-25", NOW)).toBe("overdue");
    expect(classifyDue("2026-08-30", NOW)).toBe("today");
    expect(classifyDue("2026-09-02", NOW)).toBe("soon");
    expect(classifyDue("2026-10-30", NOW)).toBe("later");
    expect(classifyDue(null, NOW)).toBe("none");
  });

  it("keeps the boundary honest across a late-evening timezone edge", () => {
    const lateEvening = new Date("2026-08-30T23:59:00");
    expect(classifyDue("2026-08-30", lateEvening)).toBe("today");
    expect(classifyDue("2026-08-31", lateEvening)).toBe("soon");
    const earlyMorning = new Date("2026-08-30T00:01:00");
    expect(classifyDue("2026-08-30", earlyMorning)).toBe("today");
    expect(classifyDue("2026-08-29", earlyMorning)).toBe("overdue");
  });

  it("labels chips the same way it classifies", () => {
    expect(dueChipLabel("2026-08-25", NOW)).toBe("5d overdue");
    expect(dueChipLabel("2026-08-30", NOW)).toBe("Due today");
    expect(dueChipLabel("2026-08-31", NOW)).toBe("Due tomorrow");
  });

  it("never lets a Due today list contain an overdue item", () => {
    const items = [
      assignment({ id: "overdue", due_date: "2026-08-25" }),
      assignment({ id: "today", due_date: "2026-08-30" }),
      assignment({ id: "soon", due_date: "2026-09-01" }),
      assignment({ id: "done", due_date: "2026-08-30", status: "complete" }),
    ];
    expect(filterAssignments(items, "today", NOW).map((i) => i.id)).toEqual(["today"]);
    expect(filterAssignments(items, "overdue", NOW).map((i) => i.id)).toEqual(["overdue"]);
    expect(filterAssignments(items, "upcoming", NOW).map((i) => i.id)).toEqual(["soon"]);
  });

  it("matches the At a glance counters exactly", () => {
    const items = [
      assignment({ id: "overdue", due_date: "2026-08-25" }),
      assignment({ id: "soon", due_date: "2026-09-01" }),
    ];
    const counts = buildGlanceCounts(items, [], NOW);
    expect(counts.dueToday).toBe(0);
    expect(filterAssignments(items, "today", NOW)).toHaveLength(0);
    expect(counts.overdue).toBe(filterAssignments(items, "overdue", NOW).length);
    expect(counts.upcoming).toBe(filterAssignments(items, "upcoming", NOW).length);
  });

  it("parses filters and titles them consistently", () => {
    expect(parseAssignmentFilter("today")).toBe("today");
    expect(parseAssignmentFilter("bogus")).toBe("all");
    expect(ASSIGNMENT_FILTER_TITLE.today).toBe("Due today");
  });
});
