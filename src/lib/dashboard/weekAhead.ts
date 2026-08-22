/**
 * Week ahead — the stable orientation layer: what is coming this week and
 * next week, across every class.
 *
 * Pure and deterministic. Rows come straight from real assignment and exam
 * rows so the drill-in list can never disagree with the counts above it.
 */
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { daysBetween, whenLabel } from "./classAlerts";
import { startOfWeek } from "@/lib/calendar/weekGlance";

export interface WeekAheadRow {
  id: string;
  kind: "assignment" | "exam";
  classId: string | null;
  className: string;
  title: string;
  when: string;
  overdue: boolean;
}

export interface WeekAhead {
  thisWeek: WeekAheadRow[];
  nextWeek: WeekAheadRow[];
  overdue: WeekAheadRow[];
}

function classNameFor(classes: ClassInfo[], classId: string | null, clientClassId: string | null) {
  const match = classes.find((c) => c.id === clientClassId || c.id === classId || c.uuid === classId);
  return match?.name ?? "Class";
}

function dayOffset(dateKey: string, now: Date): number | null {
  const days = daysBetween(dateKey, now);
  if (days === null) return null;
  const start = startOfWeek(now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sinceWeekStart = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return sinceWeekStart + days;
}

export function buildWeekAhead(
  classes: ClassInfo[],
  assignments: RealAssignment[],
  exams: RealExam[],
  now: Date = new Date(),
): WeekAhead {
  const result: WeekAhead = { thisWeek: [], nextWeek: [], overdue: [] };

  const push = (row: WeekAheadRow, offset: number) => {
    if (row.overdue) result.overdue.push(row);
    else if (offset < 7) result.thisWeek.push(row);
    else if (offset < 14) result.nextWeek.push(row);
  };

  for (const a of assignments) {
    if (a.status === "complete" || !a.due_date) continue;
    const offset = dayOffset(a.due_date, now);
    const days = daysBetween(a.due_date, now);
    if (offset === null || days === null) continue;
    push({
      id: a.id,
      kind: "assignment",
      classId: a.client_class_id ?? a.class_id,
      className: classNameFor(classes, a.class_id, a.client_class_id),
      title: a.title,
      when: whenLabel(a.due_date, now),
      overdue: days < 0,
    }, offset);
  }

  for (const e of exams) {
    if (!e.exam_date) continue;
    const offset = dayOffset(e.exam_date, now);
    const days = daysBetween(e.exam_date, now);
    if (offset === null || days === null || days < 0) continue;
    push({
      id: e.id,
      kind: "exam",
      classId: e.client_class_id ?? e.class_id,
      className: classNameFor(classes, e.class_id, e.client_class_id),
      title: e.title,
      when: whenLabel(e.exam_date, now),
      overdue: false,
    }, offset);
  }

  return result;
}

/** "2 assignments · 1 test · 6 classes" — never invents counts it doesn't have. */
export function describeWeekAhead(rows: WeekAheadRow[], meetings: number): string {
  const assignments = rows.filter((r) => r.kind === "assignment").length;
  const tests = rows.filter((r) => r.kind === "exam").length;
  const parts: string[] = [];
  if (assignments > 0) parts.push(`${assignments} assignment${assignments === 1 ? "" : "s"}`);
  if (tests > 0) parts.push(`${tests} test${tests === 1 ? "" : "s"}`);
  if (meetings > 0) parts.push(`${meetings} class${meetings === 1 ? "" : "es"}`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing scheduled";
}
