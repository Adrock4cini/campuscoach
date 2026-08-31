/**
 * Urgent attention — the "what's on fire" list for the dashboard.
 *
 * Pure and deterministic. Reads only real assignment/exam rows and answers
 * one question: what is late, due now, or a test within a few days?
 *
 * Priority DECAYS. An assignment that has been overdue for a month is not
 * more urgent than tomorrow's test — it is unresolved clutter, and the UI
 * asks the student to resolve it instead of shouting at them forever.
 */
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { daysBetween, whenLabel, type AlertTone } from "./classAlerts";
import { classifyDue, daysUntilDue, dueChipLabel, type DueBucket } from "./dueStatus";

/** Past this many days overdue, an item stops screaming and asks for a decision. */
export const STALE_OVERDUE_DAYS = 14;

/** The one honest status word for a row, derived only from the real date. */
export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  soon: "Upcoming",
  later: "Upcoming",
  none: "No due date",
};

export interface UrgentItem {
  id: string;
  kind: "assignment" | "exam";
  classId: string | null;
  className: string;
  title: string;
  /** "3d overdue", "Due today", "Fri". */
  when: string;
  /**
   * Canonical due classification. Counters, section placement and this row's
   * chip all read this, so a title that still says "Due Today" can never act
   * as status.
   */
  bucket: DueBucket;
  daysOut: number;
  tone: AlertTone;
  /** Overdue long enough that we ask the student to resolve it. */
  stale: boolean;
  /** Ordering score, higher = handle sooner. */
  score: number;
}


function classNameFor(classes: ClassInfo[], classId: string | null, clientClassId: string | null) {
  const match = classes.find((c) => c.id === clientClassId || c.id === classId || c.uuid === classId);
  return match?.name ?? "Class";
}

/** Overdue urgency that decays: day 1 late is loud, day 40 late is stale. */
export function overdueScore(daysLate: number): number {
  const decay = Math.max(0, 1 - (daysLate - 1) / STALE_OVERDUE_DAYS);
  return 60 + 40 * decay;
}

export function buildUrgentItems(
  classes: ClassInfo[],
  assignments: RealAssignment[],
  exams: RealExam[],
  now: Date = new Date(),
): UrgentItem[] {
  const items: UrgentItem[] = [];

  for (const a of assignments) {
    if (a.status === "complete" || !a.due_date) continue;
    const days = daysBetween(a.due_date, now);
    if (days === null || days > 1) continue;
    const stale = days < -STALE_OVERDUE_DAYS;
    items.push({
      id: a.id,
      kind: "assignment",
      classId: a.client_class_id ?? a.class_id,
      className: classNameFor(classes, a.class_id, a.client_class_id),
      title: a.title,
      when: whenLabel(a.due_date, now),
      daysOut: days,
      tone: stale ? "calm" : days < 0 ? "danger" : days === 0 ? "danger" : "warning",
      stale,
      score: days < 0 ? overdueScore(Math.abs(days)) : days === 0 ? 95 : 80,
    });
  }

  for (const e of exams) {
    if (!e.exam_date) continue;
    const days = daysBetween(e.exam_date, now);
    if (days === null || days < 0 || days > 3) continue;
    items.push({
      id: e.id,
      kind: "exam",
      classId: e.client_class_id ?? e.class_id,
      className: classNameFor(classes, e.class_id, e.client_class_id),
      title: e.title,
      when: whenLabel(e.exam_date, now),
      daysOut: days,
      tone: days <= 1 ? "danger" : "warning",
      stale: false,
      score: 100 - days * 4,
    });
  }

  return items.sort((a, b) => b.score - a.score || a.daysOut - b.daysOut);
}
