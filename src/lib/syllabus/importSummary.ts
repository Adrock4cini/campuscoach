/**
 * Plain-language summary of what a syllabus import will save, so the student
 * can tell at a glance what was found and what still needs their attention.
 */
import { classifyAssessment } from "@/lib/assessments/classification";
import { isValidIsoDate, type SyllabusReviewDraft } from "./schema";

export interface SyllabusImportSummary {
  assignments: number;
  quizzes: number;
  exams: number;
  scheduleDays: number;
  topics: number;
  /** Rows the student unchecked or that still need a real date/title. */
  needsAttention: string[];
}

export function summarizeSyllabusReview(review: SyllabusReviewDraft): SyllabusImportSummary {
  const included = {
    assignments: review.assignments.filter((row) => row.included),
    exams: review.exams.filter((row) => row.included),
    schedule: review.schedule.filter((row) => row.included),
  };

  let assignments = 0;
  let quizzes = 0;
  for (const row of included.assignments) {
    if (classifyAssessment({ row: "assignment", title: row.title }) === "quiz") quizzes += 1;
    else assignments += 1;
  }

  const topics = new Set<string>();
  for (const exam of included.exams) for (const topic of exam.topics) topics.add(topic.toLowerCase());

  const needsAttention: string[] = [];
  const missingDate = [
    ...review.assignments.filter((row) => row.title && !isValidIsoDate(row.dueDate)),
    ...review.exams.filter((row) => row.title && !isValidIsoDate(row.examDate)),
  ];
  if (missingDate.length) {
    needsAttention.push(`${missingDate.length} item${missingDate.length === 1 ? "" : "s"} still ${missingDate.length === 1 ? "needs" : "need"} a real date`);
  }
  const examsWithoutTopics = included.exams.filter((row) => row.topics.length === 0).length;
  if (examsWithoutTopics) {
    needsAttention.push(`${examsWithoutTopics} test${examsWithoutTopics === 1 ? "" : "s"} ${examsWithoutTopics === 1 ? "lists" : "list"} no topics yet`);
  }
  const skipped = review.assignments.length + review.exams.length + review.schedule.length
    - included.assignments.length - included.exams.length - included.schedule.length;
  if (skipped > 0) needsAttention.push(`${skipped} unchecked item${skipped === 1 ? "" : "s"} will not be saved`);

  return {
    assignments,
    quizzes,
    exams: included.exams.length,
    scheduleDays: included.schedule.length,
    topics: topics.size,
    needsAttention,
  };
}

export function describeSyllabusImportSummary(summary: SyllabusImportSummary): string {
  const parts = [
    `${summary.assignments} assignment${summary.assignments === 1 ? "" : "s"}`,
    `${summary.quizzes} quiz${summary.quizzes === 1 ? "" : "zes"}`,
    `${summary.exams} test${summary.exams === 1 ? "" : "s"}`,
    `${summary.scheduleDays} class day${summary.scheduleDays === 1 ? "" : "s"}`,
    `${summary.topics} topic${summary.topics === 1 ? "" : "s"}`,
  ];
  return parts.join(" · ");
}
