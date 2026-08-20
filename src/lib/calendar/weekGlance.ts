/**
 * Week glance — the stable "school at a glance" counts on Today.
 *
 * Pure and deterministic. Counts real assignments and exams into the
 * current calendar week (Mon–Sun) and the following one, plus anything
 * already overdue. No prediction, no artifacts — just the schedule.
 */

export interface GlanceAssignment {
  due_date: string | null;
  status?: string | null;
}

export interface GlanceExam {
  exam_date: string | null;
}

export interface WeekCounts {
  assignments: number;
  tests: number;
}

export interface WeekGlance {
  thisWeek: WeekCounts;
  nextWeek: WeekCounts;
  /** Assignments past due and not complete. */
  overdue: number;
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday 00:00 of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const day = startOfDay(now);
  const shift = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - shift);
  return day;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

export function buildWeekGlance(
  assignments: GlanceAssignment[],
  exams: GlanceExam[],
  now: Date = new Date(),
): WeekGlance {
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const weekAfterStart = new Date(weekStart);
  weekAfterStart.setDate(weekAfterStart.getDate() + 14);

  const glance: WeekGlance = {
    thisWeek: { assignments: 0, tests: 0 },
    nextWeek: { assignments: 0, tests: 0 },
    overdue: 0,
  };

  for (const assignment of assignments) {
    if (assignment.status === "complete") continue;
    const due = parseDate(assignment.due_date);
    if (!due) continue;
    if (due < today) { glance.overdue += 1; continue; }
    if (due < nextWeekStart) glance.thisWeek.assignments += 1;
    else if (due < weekAfterStart) glance.nextWeek.assignments += 1;
  }

  for (const exam of exams) {
    const at = parseDate(exam.exam_date);
    if (!at || at < today) continue;
    if (at < nextWeekStart) glance.thisWeek.tests += 1;
    else if (at < weekAfterStart) glance.nextWeek.tests += 1;
  }

  return glance;
}

/** "3 assignments · 2 tests" — or a truthful empty phrase. */
export function describeWeek(counts: WeekCounts): string {
  const parts: string[] = [];
  if (counts.assignments > 0) {
    parts.push(`${counts.assignments} assignment${counts.assignments === 1 ? "" : "s"}`);
  }
  if (counts.tests > 0) {
    parts.push(`${counts.tests} test${counts.tests === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Nothing scheduled";
}
