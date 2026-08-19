import { describe, expect, it } from "vitest";
import { createSyllabusReviewDraft } from "./schema";
import { describeSyllabusImportSummary, summarizeSyllabusReview } from "./importSummary";

const algebraSyllabus = () => createSyllabusReviewDraft({
  student: { term: "Fall 2026" },
  classes: [{
    name: "Algebra II",
    assignments: [
      { label: "Chapter 3 problems", dueDate: "2026-09-08" },
      { label: "Quiz 1", dueDate: "2026-09-11" },
      { label: "Quiz 2", dueDate: "2026-10-02" },
      { label: "Final Exam Review Quiz", dueDate: "2026-12-04" },
      { label: "Unit project", dueDate: "TBD" },
    ],
    examDates: [
      { label: "Unit 1 Exam", date: "2026-09-25", topics: ["functions"] },
      {
        label: "Semester Final Exam",
        date: "2026-12-10",
        topics: ["Cumulative: functions, systems, polynomials, exponentials/logs, sequences, probability, trigonometry"],
      },
    ],
    schedule: [{ date: "2026-09-02", topic: "Functions review" }],
  }],
});

describe("syllabus import summary", () => {
  it("separates quizzes from assignments and preserves every stated final topic", () => {
    const review = algebraSyllabus();
    expect(review.exams[1].topics).toEqual([
      "functions", "systems", "polynomials", "exponentials/logs", "sequences", "probability", "trigonometry",
    ]);

    const summary = summarizeSyllabusReview(review);
    expect(summary).toEqual(expect.objectContaining({
      assignments: 2,
      quizzes: 3,
      exams: 2,
      scheduleDays: 1,
      topics: 7,
    }));
    expect(summary.needsAttention[0]).toMatch(/1 item still needs a real date/);
    expect(describeSyllabusImportSummary(summary)).toBe("2 assignments · 3 quizzes · 2 tests · 1 class day · 7 topics");
  });

  it("flags unchecked rows and tests with no topics", () => {
    const review = algebraSyllabus();
    review.assignments[0].included = false;
    review.exams[0].topics = [];
    const summary = summarizeSyllabusReview(review);
    expect(summary.assignments).toBe(1);
    expect(summary.needsAttention.join(" ")).toMatch(/1 test lists no topics/);
    expect(summary.needsAttention.join(" ")).toMatch(/1 unchecked item/);
  });
});
