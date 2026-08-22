import { describe, expect, it } from "vitest";
import { buildUrgentItems, overdueScore, STALE_OVERDUE_DAYS } from "./urgentItems";
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";

const now = new Date("2026-03-10T09:00:00Z");

const classes = [{ id: "bio", name: "Biology" }] as unknown as ClassInfo[];

function assignment(id: string, due: string, status = "not_started"): RealAssignment {
  return {
    id, user_id: "u", client_class_id: "bio", class_id: null, title: `Task ${id}`,
    due_date: due, estimated_minutes: 30, priority: "medium", status,
    notes: null, created_at: "", updated_at: "",
  } as RealAssignment;
}

function exam(id: string, date: string): RealExam {
  return { id, user_id: "u", client_class_id: "bio", class_id: null, title: `Test ${id}`, exam_date: date, readiness: 0 } as RealExam;
}

describe("urgent attention items", () => {
  it("keeps only work that is late, due now, or a test within three days", () => {
    const items = buildUrgentItems(
      classes,
      [assignment("late", "2026-03-08"), assignment("later", "2026-03-25"), assignment("done", "2026-03-01", "complete")],
      [exam("soon", "2026-03-12"), exam("far", "2026-03-30")],
      now,
    );
    expect(items.map((i) => i.id)).toEqual(["soon", "late"]);
  });

  it("decays overdue urgency instead of nagging forever", () => {
    expect(overdueScore(1)).toBeGreaterThan(overdueScore(10));
    const [stale] = buildUrgentItems(classes, [assignment("ancient", "2026-01-01")], [], now);
    expect(stale.stale).toBe(true);
    expect(stale.tone).toBe("calm");
    expect(STALE_OVERDUE_DAYS).toBe(14);
  });
});
