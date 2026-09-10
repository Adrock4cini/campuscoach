import { describe, expect, it } from "vitest";
import {
  createSyllabusReviewDraft,
  mergePlanningReviewDrafts,
  normalizeWeekdays,
  parseParsedSyllabus,
  validateSyllabusReviewDraft,
  type ParsedSyllabus,
} from "./schema";

const parsed = (): ParsedSyllabus => ({
  student: { term: "Fall 2026" },
  classes: [{
    name: "Biology 101",
    code: "BIO 101",
    days: ["Wed", "Mon"],
    time: "9:30 AM",
    endTime: "10:45 AM",
    semesterStartDate: "2026-08-24",
    semesterEndDate: "2026-12-12",
    assignments: [{ label: "Lab report", dueDate: "2026-09-05" }],
    examDates: [{ label: "Midterm", date: "2026-10-10" }],
    schedule: [{ date: "2026-08-26", topic: "Cell structure" }],
  }],
});

describe("class-owned syllabus schema", () => {
  it("builds editable review rows with canonical schedules and stable identities", () => {
    const first = createSyllabusReviewDraft(parsed());
    const changedDate = parsed();
    changedDate.classes[0].assignments![0].dueDate = "2026-09-06";
    const second = createSyllabusReviewDraft(changedDate);

    expect(first.class).toEqual(expect.objectContaining({
      weekdays: ["Mon", "Wed"],
      startTime: "09:30",
      endTime: "10:45",
      semesterStartDate: "2026-08-24",
      semesterEndDate: "2026-12-12",
    }));
    expect(first.sourceClassCode).toBe("BIO 101");
    expect(first.assignments[0].key).toBe(second.assignments[0].key);
    expect(first.schedule[0]).toEqual(expect.objectContaining({ included: true, topic: "Cell structure" }));
    expect(validateSyllabusReviewDraft(first)).toEqual(first);
  });

  it("keeps malformed AI strings editable while rejecting malformed structures", () => {
    const result = parseParsedSyllabus({
      classes: [{ name: "", assignments: [{ label: "", dueDate: "TBD" }] }],
    });
    const review = createSyllabusReviewDraft(result);
    expect(review.assignments[0]).toEqual(expect.objectContaining({ title: "", dueDate: "TBD" }));
    expect(() => validateSyllabusReviewDraft(review)).toThrow(/title|required|date/i);
    expect(() => parseParsedSyllabus({ classes: [{ name: "Math", assignments: "not-an-array" }] })).toThrow();
  });

  it("enforces recurring-meeting coupling in the shared commit schema", () => {
    const review = createSyllabusReviewDraft(parsed());
    expect(() => validateSyllabusReviewDraft({
      ...review,
      class: { ...review.class, semesterEndDate: "" },
    })).toThrow(/semester/i);
    expect(() => validateSyllabusReviewDraft({
      ...review,
      class: { ...review.class, weekdays: [], startTime: "09:30", endTime: "" },
    })).toThrow(/meeting day/i);
    expect(() => validateSyllabusReviewDraft({
      ...review,
      class: { ...review.class, startTime: "", endTime: "10:45" },
    })).toThrow(/start time/i);
  });

  it("does not relabel an existing manual schedule when no syllabus topics were parsed", () => {
    const value: ParsedSyllabus = { classes: [{ name: "Biology", schedule: [] }] };
    const review = createSyllabusReviewDraft(value, 0, {
      schedule: [{ date: "2026-08-24", topic: "Student-added topic" }],
    });
    expect(review.schedule).toEqual([]);
  });

  it("normalizes common compound day labels", () => {
    expect(normalizeWeekdays(["Wed/Mon", "Friday"])).toEqual(["Mon", "Wed", "Fri"]);
  });

  it("updates a schedule without deleting saved syllabus rows", () => {
    const syllabus = createSyllabusReviewDraft(parsed(), 0, undefined, "syllabus");
    const scheduleSource: ParsedSyllabus = {
      classes: [{
        name: "Biology 101",
        assignments: [{ label: "Field notes", dueDate: "2026-09-18" }],
        schedule: [{ date: "2026-09-14", topic: "Ecology" }],
      }],
    };
    const schedule = createSyllabusReviewDraft(scheduleSource, 0, undefined, "schedule");
    const merged = mergePlanningReviewDrafts(syllabus, schedule);

    expect(merged.assignments.map((item) => item.title)).toEqual(["Lab report", "Field notes"]);
    expect(merged.schedule.map((item) => item.topic)).toEqual(["Cell structure", "Ecology"]);
    expect(merged.assignments.map((item) => item.sourceKind)).toEqual(["syllabus", "schedule"]);
  });

  it("replaces only the earlier rows from the same document kind", () => {
    const syllabus = createSyllabusReviewDraft(parsed(), 0, undefined, "syllabus");
    const firstSchedule = createSyllabusReviewDraft({
      classes: [{ name: "Biology 101", schedule: [{ date: "2026-09-14", topic: "Old schedule topic" }] }],
    }, 0, undefined, "schedule");
    const combined = mergePlanningReviewDrafts(syllabus, firstSchedule);
    const replacement = createSyllabusReviewDraft({
      classes: [{ name: "Biology 101", schedule: [{ date: "2026-09-21", topic: "New schedule topic" }] }],
    }, 0, undefined, "schedule");
    const merged = mergePlanningReviewDrafts(combined, replacement);

    expect(merged.schedule.map((item) => item.topic)).toEqual(["Cell structure", "New schedule topic"]);
  });
});
