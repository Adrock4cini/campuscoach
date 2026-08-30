/**
 * One shared due-date classification for the whole app.
 *
 * Section titles, at-a-glance counters and per-item chips must never disagree
 * ("Due today" heading over a 5d-overdue item). Every surface classifies the
 * same way, from the same local calendar day.
 */
import { parseDateKey } from "@/lib/calendar/dateKey";

export type DueBucket = "none" | "overdue" | "today" | "soon" | "later";

/** Assignment-shaped input: only the fields classification depends on. */
export interface DueClassifiable {
  due_date: string | null;
  status?: string | null;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Whole calendar days between a `YYYY-MM-DD` key and `now`, in local time.
 * Negative = past. Timezone-safe because both sides are normalized to the
 * local start of day before subtraction.
 */
export function daysUntilDue(dueDate: string | null, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const date = parseDateKey(dueDate);
  if (!date) return null;
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function classifyDue(dueDate: string | null, now: Date = new Date()): DueBucket {
  const days = daysUntilDue(dueDate, now);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "soon";
  return "later";
}

/** The single learner-facing chip for a due date. */
export function dueChipLabel(dueDate: string | null, now: Date = new Date()): string {
  const days = daysUntilDue(dueDate, now);
  if (days === null) return "No due date";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

export function isOpenAssignment(item: DueClassifiable) {
  return item.status !== "complete" && Boolean(item.due_date);
}

export type AssignmentFilter = "overdue" | "today" | "upcoming" | "all";

export function parseAssignmentFilter(value: string | null): AssignmentFilter {
  return value === "overdue" || value === "today" || value === "upcoming" ? value : "all";
}

export const ASSIGNMENT_FILTER_TITLE: Record<AssignmentFilter, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Due in the next 7 days",
  all: "Assignments",
};

/**
 * Filtering uses the exact same buckets the counters use, so a tile that says
 * "0" can never open a list that shows items.
 */
export function matchesAssignmentFilter<T extends DueClassifiable>(
  item: T,
  filter: AssignmentFilter,
  now: Date = new Date(),
): boolean {
  if (filter === "all") return true;
  if (!isOpenAssignment(item)) return false;
  const bucket = classifyDue(item.due_date, now);
  if (filter === "overdue") return bucket === "overdue";
  if (filter === "today") return bucket === "today";
  return bucket === "soon";
}

export function filterAssignments<T extends DueClassifiable>(
  items: T[],
  filter: AssignmentFilter,
  now: Date = new Date(),
): T[] {
  return items.filter((item) => matchesAssignmentFilter(item, filter, now));
}
