import { describe, expect, it } from "vitest";
import { buildSyllabusDeadlineRows } from "./syllabusDeadlines";

describe("syllabus deadline persistence", () => {
  it("turns extracted syllabus dates into class-bound assignment and exam rows", () => {
    const rows = buildSyllabusDeadlineRows({
      name: "Math",
      days: ["Mon"],
      examDates: [{ label: "Midterm", date: "2026-09-20" }],
      assignments: [{ label: "Chapter 3 problems", dueDate: "2026-09-08" }],
    }, {
      userId: "user-1",
      classUuid: "class-uuid",
      clientClassId: "math",
    });

    expect(rows.assignments).toEqual([expect.objectContaining({
      user_id: "user-1",
      class_id: "class-uuid",
      client_class_id: "math",
      title: "Chapter 3 problems",
      due_date: "2026-09-08",
      meta: expect.objectContaining({ source: "syllabus" }),
    })]);
    expect(rows.exams).toEqual([expect.objectContaining({
      user_id: "user-1",
      class_id: "class-uuid",
      client_class_id: "math",
      title: "Midterm",
      exam_date: "2026-09-20",
      readiness: 0,
      meta: expect.objectContaining({ source: "syllabus" }),
    })]);
  });

  it("drops incomplete or invalid AI date output instead of inventing calendar entries", () => {
    const rows = buildSyllabusDeadlineRows({
      name: "Math",
      days: [],
      examDates: [
        { label: "Date TBD", date: "" },
        { label: "Impossible date", date: "09/20/26" },
      ],
      assignments: [
        { label: "", dueDate: "2026-09-08" },
        { label: "Reading", dueDate: "TBA" },
      ],
    }, {
      userId: "user-1",
      classUuid: "class-uuid",
      clientClassId: "math",
    });

    expect(rows).toEqual({ assignments: [], exams: [] });
  });
});
