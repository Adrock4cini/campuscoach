import { describe, expect, it } from "vitest";
import { buildGlanceCounts } from "./glanceCounts";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";

const NOW = new Date("2026-03-10T12:00:00Z");

function assignment(partial: Partial<RealAssignment>): RealAssignment {
  return {
    id: partial.id ?? "a1",
    title: partial.title ?? "Homework",
    due_date: partial.due_date ?? null,
    status: partial.status ?? "todo",
    class_id: partial.class_id ?? null,
    client_class_id: partial.client_class_id ?? null,
  } as RealAssignment;
}

function exam(partial: Partial<RealExam>): RealExam {
  return {
    id: partial.id ?? "e1",
    title: partial.title ?? "Unit test",
    exam_date: partial.exam_date ?? null,
    readiness: partial.readiness ?? 0,
    class_id: partial.class_id ?? null,
    client_class_id: partial.client_class_id ?? null,
  } as RealExam;
}

describe("buildGlanceCounts", () => {
  it("splits open work into overdue, due today and the next seven days", () => {
    const counts = buildGlanceCounts(
      [
        assignment({ id: "1", due_date: "2026-03-05" }),
        assignment({ id: "2", due_date: "2026-03-09" }),
        assignment({ id: "3", due_date: "2026-03-10" }),
        assignment({ id: "4", due_date: "2026-03-14" }),
        assignment({ id: "5", due_date: "2026-03-30" }),
        assignment({ id: "6", due_date: "2026-03-05", status: "complete" }),
        assignment({ id: "7", due_date: null }),
      ],
      [],
      NOW,
    );

    expect(counts).toEqual({ overdue: 2, dueToday: 1, upcoming: 1, testsComing: 0 });
  });

  it("counts only tests in the next two weeks", () => {
    const counts = buildGlanceCounts(
      [],
      [
        exam({ id: "past", exam_date: "2026-03-01" }),
        exam({ id: "soon", exam_date: "2026-03-12" }),
        exam({ id: "edge", exam_date: "2026-03-24" }),
        exam({ id: "far", exam_date: "2026-04-30" }),
        exam({ id: "none", exam_date: null }),
      ],
      NOW,
    );

    expect(counts.testsComing).toBe(2);
  });
});
