/**
 * Dashboard class alerts — one honest headline per class, plus the compact
 * cross-class "next test / next due" summary.
 *
 * Pure and deterministic. No prediction: every string here comes from a real
 * assignment or exam row, and readiness is always a labelled word (never a
 * bare unexplained percentage).
 */
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { parseDateKey } from "@/lib/calendar/dateKey";
import { labelTestReadiness } from "@/lib/intelligence/testReadinessLabel";

export type AlertTone = "danger" | "warning" | "calm";

export interface ClassAlert {
  /** The single most important thing about this class right now. */
  text: string;
  tone: AlertTone;
  /** Tiny second indicator, only when a second urgent item exists. */
  secondary?: string;
}

export interface NextTestSummary {
  classId: string | null;
  className: string;
  title: string;
  when: string;
  /** Readiness word, or null when there isn't enough material to score. */
  readinessLabel: string;
  insufficient: boolean;
  count: number;
}

export interface NextDueSummary {
  classId: string | null;
  className: string;
  title: string;
  when: string;
  overdue: boolean;
  /** Assignments still open in the next 7 days (including overdue). */
  count: number;
}

export interface NextUpSummary {
  nextTest: NextTestSummary | null;
  nextDue: NextDueSummary | null;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function daysBetween(dateKey: string, now: Date): number | null {
  const date = parseDateKey(dateKey);
  if (!date) return null;
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "today", "tomorrow", "Fri", "in 12d", "3d overdue". */
export function whenLabel(dateKey: string, now: Date): string {
  const days = daysBetween(dateKey, now);
  if (days === null) return "date unknown";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 6) {
    const date = parseDateKey(dateKey);
    return date ? WEEKDAYS[date.getDay()] : `in ${days}d`;
  }
  return `in ${days}d`;
}

function openAssignments(assignments: RealAssignment[]) {
  return assignments
    .filter((a) => a.status !== "complete" && !!a.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
}

function upcomingExams(exams: RealExam[], now: Date) {
  return exams
    .filter((e) => !!e.exam_date && (daysBetween(e.exam_date!, now) ?? -1) >= 0)
    .sort((a, b) => (a.exam_date ?? "").localeCompare(b.exam_date ?? ""));
}

function readinessWord(readiness: number) {
  const label = labelTestReadiness(readiness);
  return { word: label.label, insufficient: label.level === "unstarted" };
}

function examAlertText(exam: RealExam, now: Date): string {
  const { word } = readinessWord(exam.readiness);
  const days = daysBetween(exam.exam_date!, now) ?? 0;
  const timing = days <= 6 ? `Test ${whenLabel(exam.exam_date!, now)}` : `Test in ${days}d`;
  return `${timing} · ${word}`;
}

function assignmentAlertText(assignment: RealAssignment, now: Date): string {
  const when = whenLabel(assignment.due_date!, now);
  return when.endsWith("overdue") ? `Assignment ${when}` : `Assignment due ${when}`;
}

/**
 * One alert per class, keyed by the class id used across the dashboard.
 * Priority: overdue work → work due in 2 days → test within a week → next item.
 */
export function buildClassAlerts(
  classes: ClassInfo[],
  assignments: RealAssignment[],
  exams: RealExam[],
  now: Date = new Date(),
): Record<string, ClassAlert> {
  const alerts: Record<string, ClassAlert> = {};

  for (const classInfo of classes) {
    const ids = new Set([classInfo.id, classInfo.uuid].filter(Boolean) as string[]);
    const matches = (classId: string | null, clientClassId: string | null) =>
      (classId !== null && ids.has(classId)) || (clientClassId !== null && ids.has(clientClassId));

    const assignment = openAssignments(assignments)
      .find((a) => matches(a.class_id, a.client_class_id));
    const exam = upcomingExams(exams, now)
      .find((e) => matches(e.class_id, e.client_class_id));

    const assignmentDays = assignment ? daysBetween(assignment.due_date!, now) : null;
    const examDays = exam ? daysBetween(exam.exam_date!, now) : null;

    let alert: ClassAlert | null = null;
    if (assignment && assignmentDays !== null && assignmentDays < 0) {
      alert = { text: assignmentAlertText(assignment, now), tone: "danger" };
    } else if (assignment && assignmentDays !== null && assignmentDays <= 1) {
      alert = { text: assignmentAlertText(assignment, now), tone: "warning" };
    } else if (exam && examDays !== null && examDays <= 7) {
      alert = { text: examAlertText(exam, now), tone: examDays <= 2 ? "danger" : "warning" };
    } else if (assignment) {
      alert = { text: assignmentAlertText(assignment, now), tone: "calm" };
    } else if (exam) {
      alert = { text: examAlertText(exam, now), tone: "calm" };
    }

    if (!alert) continue;

    // A single tiny secondary indicator — never a wall of badges.
    const primaryIsExam = alert.text.startsWith("Test");
    if (primaryIsExam && assignment) {
      alert.secondary = `+ assignment ${whenLabel(assignment.due_date!, now)}`;
    } else if (!primaryIsExam && exam && examDays !== null) {
      alert.secondary = `+ test ${whenLabel(exam.exam_date!, now)}`;
    }

    alerts[classInfo.id] = alert;
  }

  return alerts;
}

function classNameFor(classes: ClassInfo[], classId: string | null, clientClassId: string | null) {
  const match = classes.find((c) => c.id === clientClassId || c.id === classId || c.uuid === classId);
  return match?.name ?? "Class";
}

/** The compact cross-class strip: next test and next assignment due. */
export function buildNextUpSummary(
  classes: ClassInfo[],
  assignments: RealAssignment[],
  exams: RealExam[],
  now: Date = new Date(),
): NextUpSummary {
  const open = openAssignments(assignments);
  const upcoming = upcomingExams(exams, now);

  const nextExam = upcoming[0] ?? null;
  const nextAssignment = open[0] ?? null;

  const nextTest: NextTestSummary | null = nextExam
    ? {
        classId: nextExam.client_class_id ?? nextExam.class_id,
        className: classNameFor(classes, nextExam.class_id, nextExam.client_class_id),
        title: nextExam.title,
        when: whenLabel(nextExam.exam_date!, now),
        readinessLabel: readinessWord(nextExam.readiness).word,
        insufficient: readinessWord(nextExam.readiness).insufficient,
        count: upcoming.length,
      }
    : null;

  const nextDue: NextDueSummary | null = nextAssignment
    ? {
        classId: nextAssignment.client_class_id ?? nextAssignment.class_id,
        className: classNameFor(classes, nextAssignment.class_id, nextAssignment.client_class_id),
        title: nextAssignment.title,
        when: whenLabel(nextAssignment.due_date!, now),
        overdue: (daysBetween(nextAssignment.due_date!, now) ?? 0) < 0,
        count: open.filter((a) => (daysBetween(a.due_date!, now) ?? 99) <= 7).length,
      }
    : null;

  return { nextTest, nextDue };
}
