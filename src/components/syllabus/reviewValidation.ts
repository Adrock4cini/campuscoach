import { normalizeTimeKey } from "@/lib/calendar/classSchedule";
import type { SyllabusReviewDraft } from "@/lib/syllabus";

export interface SyllabusReviewValidation {
  valid: boolean;
  issueCount: number;
  errors: Record<string, string>;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidSyllabusDate(value: string) {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateSyllabusReview(draft: SyllabusReviewDraft): SyllabusReviewValidation {
  const errors: Record<string, string> = {};

  const startTime = normalizeTimeKey(draft.class.startTime);
  const endTime = normalizeTimeKey(draft.class.endTime);
  if ((draft.class.startTime || draft.class.endTime) && draft.class.weekdays.length === 0) {
    errors.weekdays = "Choose at least one class day when adding a meeting time";
  }
  if (draft.class.weekdays.length > 0 && !startTime) {
    errors["start-time"] = "Choose when class starts";
  } else if (draft.class.startTime && !startTime) {
    errors["start-time"] = "Choose a valid start time";
  }
  if (draft.class.endTime && !endTime) {
    errors["end-time"] = "Choose a valid end time";
  }
  if (endTime && !startTime) {
    errors["start-time"] = "Choose when class starts";
  }
  if (startTime && endTime && endTime <= startTime) {
    errors["end-time"] = "Class must end after it starts";
  }

  if (draft.class.semesterStartDate && !isValidSyllabusDate(draft.class.semesterStartDate)) {
    errors["term-start"] = "Choose a valid start date";
  }
  if (draft.class.weekdays.length > 0 && !draft.class.semesterStartDate) {
    errors["term-start"] = "Choose the first day of the term so meetings start on time";
  }
  if (draft.class.weekdays.length > 0 && !draft.class.semesterEndDate) {
    errors["term-end"] = "Choose the last day of the term so meetings stop on time";
  }
  if (draft.class.semesterEndDate && !isValidSyllabusDate(draft.class.semesterEndDate)) {
    errors["term-end"] = "Choose a valid end date";
  }
  if (
    draft.class.semesterStartDate
    && draft.class.semesterEndDate
    && isValidSyllabusDate(draft.class.semesterStartDate)
    && isValidSyllabusDate(draft.class.semesterEndDate)
    && draft.class.semesterEndDate < draft.class.semesterStartDate
  ) {
    errors["term-end"] = "The end date must be after the start date";
  }

  draft.assignments.forEach((row) => {
    if (!row.included) return;
    if (!row.title.trim()) errors[`assignment-${row.key}-title`] = "Add an assignment name";
    if (!isValidSyllabusDate(row.dueDate)) errors[`assignment-${row.key}-date`] = "Choose a valid due date";
  });
  draft.exams.forEach((row) => {
    if (!row.included) return;
    if (!row.title.trim()) errors[`exam-${row.key}-title`] = "Add an exam name";
    if (!isValidSyllabusDate(row.examDate)) errors[`exam-${row.key}-date`] = "Choose a valid exam date";
  });
  draft.schedule.forEach((row) => {
    if (!row.included) return;
    if (!row.topic.trim()) errors[`topic-${row.key}-title`] = "Add a class topic";
    if (!isValidSyllabusDate(row.date)) errors[`topic-${row.key}-date`] = "Choose a valid class date";
  });

  const issueCount = Object.keys(errors).length;
  return { valid: issueCount === 0, issueCount, errors };
}
