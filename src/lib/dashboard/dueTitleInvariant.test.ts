/**
 * The live "QA WG Percent Practice - Due Today" regression.
 *
 * A student may type anything into a title. Stale words in the title must
 * never function as status: the counter, the section placement and the row
 * chip all derive from the one canonical due-date calculation.
 */
import { describe, expect, it } from "vitest";
import type { RealAssignment } from "@/lib/realData/assignments";
import { buildGlanceCounts } from "./glanceCounts";
import { DUE_BUCKET_LABEL, buildUrgentItems } from "./urgentItems";
import { classifyDue, dueChipLabel } from "./dueStatus";

function assignment(overrides: Partial<RealAssignment> = {}): RealAssignment {
  return {
    id: "a1",
    user_id: "u1",
    class_id: null,
    client_class_id: "c1",
    title: "QA WG Percent Practice - Due Today",
    due_date: "2026-08-25",
    estimated_minutes: 30,
    priority: "medium",
    status: "open",
    notes: null,
    ...overrides,
  } as RealAssignment;
}

const NOW = new Date(2026, 7, 30, 9, 0, 0); // Aug 30 2026, local

describe("due-date single source of truth", () => {
  it("does not count a 5-day-overdue item as due today just because the title says so", () => {
    const counts = buildGlanceCounts([assignment()], [], NOW);
    expect(counts.dueToday).toBe(0);
    expect(counts.overdue).toBe(1);
  });

  it("labels the same row Overdue in the Today list, matching the counter", () => {
    const [item] = buildUrgentItems([], [assignment()], [], NOW);
    expect(item.bucket).toBe("overdue");
    expect(DUE_BUCKET_LABEL[item.bucket]).toBe("Overdue");
    expect(item.when).toBe("5d overdue");
    // The title is preserved exactly as the student entered it.
    expect(item.title).toBe("QA WG Percent Practice - Due Today");
  });

  it("agrees with the shared chip helper", () => {
    expect(classifyDue("2026-08-25", NOW)).toBe("overdue");
    expect(dueChipLabel("2026-08-25", NOW)).toBe("5d overdue");
  });

  it("treats a same-local-day due date as due today at both ends of the day", () => {
    const earlyMorning = new Date(2026, 7, 30, 0, 5, 0);
    const lateNight = new Date(2026, 7, 30, 23, 55, 0);
    for (const now of [earlyMorning, lateNight]) {
      const today = assignment({ due_date: "2026-08-30" });
      expect(classifyDue(today.due_date, now)).toBe("today");
      expect(buildGlanceCounts([today], [], now).dueToday).toBe(1);
      const [item] = buildUrgentItems([], [today], [], now);
      expect(item.bucket).toBe("today");
      expect(item.when).toBe("Due today");
    }
  });

  it("does not roll a tomorrow item into today late at night", () => {
    const lateNight = new Date(2026, 7, 30, 23, 55, 0);
    const tomorrow = assignment({ due_date: "2026-08-31" });
    expect(buildGlanceCounts([tomorrow], [], lateNight).dueToday).toBe(0);
    const [item] = buildUrgentItems([], [tomorrow], [], lateNight);
    expect(item.bucket).toBe("soon");
    expect(item.when).toBe("Due tomorrow");
  });
});
