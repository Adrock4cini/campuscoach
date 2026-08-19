import { describe, expect, it } from "vitest";
import {
  assessmentEvidenceWeight,
  assessmentLabel,
  classifyAssessment,
  countAssessments,
} from "./classification";

describe("assessment classification", () => {
  it("keeps syllabus quizzes out of the ordinary homework bucket", () => {
    expect(classifyAssessment({ row: "assignment", title: "Quiz 1" })).toBe("quiz");
    expect(classifyAssessment({ row: "assignment", title: "Quiz 2 – Systems" })).toBe("quiz");
    expect(classifyAssessment({ row: "assignment", title: "Quiz 3" })).toBe("quiz");
    expect(classifyAssessment({ row: "assignment", title: "Final Exam Review Quiz" })).toBe("quiz");
  });

  it("treats homework and projects as assignments and exam rows as tests", () => {
    expect(classifyAssessment({ row: "assignment", title: "Chapter 3 problems" })).toBe("assignment");
    expect(classifyAssessment({ row: "assignment", title: "Data project" })).toBe("assignment");
    expect(classifyAssessment({ row: "exam", title: "Semester Final Exam" })).toBe("exam");
    expect(classifyAssessment({ row: "assignment", title: "Unit 2 Test" })).toBe("exam");
  });

  it("stays backward compatible with rows that have no title or meta", () => {
    expect(classifyAssessment({})).toBe("assignment");
    expect(classifyAssessment({ row: "assignment", title: null, meta: null })).toBe("assignment");
    expect(classifyAssessment({ row: "assignment", title: "Quiz 1", meta: { assessment_type: "assignment" } }))
      .toBe("assignment");
  });

  it("exposes one evidence weight ordering for study logic", () => {
    expect(assessmentEvidenceWeight("exam")).toBeGreaterThan(assessmentEvidenceWeight("quiz"));
    expect(assessmentEvidenceWeight("quiz")).toBeGreaterThan(assessmentEvidenceWeight("assignment"));
    expect(assessmentLabel("quiz")).toBe("Quiz");
  });

  it("counts a mixed syllabus import by type", () => {
    const counts = countAssessments([
      { row: "assignment", title: "Quiz 1" },
      { row: "assignment", title: "Quiz 2" },
      { row: "assignment", title: "Homework 4" },
      { row: "exam", title: "Semester Final Exam" },
    ]);
    expect(counts).toEqual({ assignment: 1, quiz: 2, exam: 1 });
  });
});
