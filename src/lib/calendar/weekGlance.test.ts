import { describe, expect, it } from "vitest";
import { buildWeekGlance, describeWeek } from "./weekGlance";

// Wed 2026-08-19; week runs Mon 2026-08-17 → Sun 2026-08-23.
const now = new Date("2026-08-19T09:00:00");

describe("week glance", () => {
  it("splits real work into this week, next week, and overdue", () => {
    const glance = buildWeekGlance(
      [
        { due_date: "2026-08-20", status: "not_started" },
        { due_date: "2026-08-21", status: "not_started" },
        { due_date: "2026-08-25", status: "not_started" },
        { due_date: "2026-08-18", status: "not_started" },
        { due_date: "2026-08-18", status: "complete" },
        { due_date: null, status: "not_started" },
      ],
      [{ exam_date: "2026-08-22" }, { exam_date: "2026-08-27" }, { exam_date: "2026-09-30" }],
      now,
    );

    expect(glance.thisWeek).toEqual({ assignments: 2, tests: 1 });
    expect(glance.nextWeek).toEqual({ assignments: 1, tests: 1 });
    expect(glance.overdue).toBe(1);
  });

  it("describes counts truthfully", () => {
    expect(describeWeek({ assignments: 3, tests: 2 })).toBe("3 assignments · 2 tests");
    expect(describeWeek({ assignments: 1, tests: 0 })).toBe("1 assignment");
    expect(describeWeek({ assignments: 0, tests: 0 })).toBe("Nothing scheduled");
  });
});
