import { describe, expect, it } from "vitest";
import { buildWeekAhead, describeWeekAhead } from "./weekAhead";
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";

// Tuesday 2026-03-10 → week runs Mon 03-09 to Sun 03-15.
const now = new Date("2026-03-10T09:00:00");
const classes = [{ id: "bio", name: "Biology" }] as unknown as ClassInfo[];

function assignment(id: string, due: string): RealAssignment {
  return {
    id, user_id: "u", client_class_id: "bio", class_id: null, title: `Task ${id}`,
    due_date: due, estimated_minutes: 30, priority: "medium", status: "not_started",
    notes: null, created_at: "", updated_at: "",
  } as RealAssignment;
}

function exam(id: string, date: string): RealExam {
  return { id, user_id: "u", client_class_id: "bio", class_id: null, title: `Test ${id}`, exam_date: date, readiness: 0 } as RealExam;
}

describe("week ahead orientation", () => {
  it("splits real rows into overdue, this week and next week", () => {
    const week = buildWeekAhead(
      classes,
      [assignment("late", "2026-03-05"), assignment("thu", "2026-03-12"), assignment("nextwk", "2026-03-17")],
      [exam("fri", "2026-03-13")],
      now,
    );
    expect(week.overdue.map((r) => r.id)).toEqual(["late"]);
    expect(week.thisWeek.map((r) => r.id).sort()).toEqual(["fri", "thu"]);
    expect(week.nextWeek.map((r) => r.id)).toEqual(["nextwk"]);
  });

  it("describes a week truthfully and never invents counts", () => {
    const week = buildWeekAhead(classes, [assignment("thu", "2026-03-12")], [exam("fri", "2026-03-13")], now);
    expect(describeWeekAhead(week.thisWeek, 4)).toBe("1 assignment · 1 test · 4 classes");
    expect(describeWeekAhead([], 0)).toBe("Nothing scheduled");
  });
});
