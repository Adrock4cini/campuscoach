import type { OnboardingClass } from "./types";

interface ClassIdentity {
  userId: string;
  classUuid: string;
  clientClassId: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toUtcDateKey(parsed) === value;
}

function toUtcDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function sourceKey(kind: "assignment" | "exam", clientClassId: string, title: string, date: string) {
  return `${kind}:${clientClassId}:${date}:${title.trim().toLowerCase()}`;
}

export function buildSyllabusDeadlineRows(course: OnboardingClass, identity: ClassIdentity) {
  const assignments = (course.assignments ?? [])
    .filter((item) => validLabel(item.label) && validDate(item.dueDate))
    .map((item) => ({
      user_id: identity.userId,
      class_id: identity.classUuid,
      client_class_id: identity.clientClassId,
      title: item.label.trim(),
      due_date: item.dueDate,
      estimated_minutes: 30,
      priority: "medium" as const,
      status: "not_started" as const,
      notes: "Imported from syllabus",
      meta: {
        source: "syllabus",
        source_key: sourceKey("assignment", identity.clientClassId, item.label, item.dueDate),
      },
    }));

  const exams = (course.examDates ?? [])
    .filter((item) => validLabel(item.label) && validDate(item.date))
    .map((item) => ({
      user_id: identity.userId,
      class_id: identity.classUuid,
      client_class_id: identity.clientClassId,
      title: item.label.trim(),
      exam_date: item.date,
      topics: [] as string[],
      readiness: 0,
      notes: "Imported from syllabus",
      meta: {
        source: "syllabus",
        source_key: sourceKey("exam", identity.clientClassId, item.label, item.date),
      },
    }));

  return { assignments, exams };
}
