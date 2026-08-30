/**
 * At a glance — the four honest counts at the top of Today.
 *
 * Pure and deterministic. Every number comes from a real assignment or exam
 * row the student owns; nothing is predicted or invented.
 */
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { daysBetween } from "./classAlerts";
import { classifyDue, isOpenAssignment } from "./dueStatus";

/** Tests within this window count as "coming up". */
export const TESTS_COMING_DAYS = 14;

export interface GlanceCounts {
  /** Unresolved work whose due date has passed. */
  overdue: number;
  /** Open work due today. */
  dueToday: number;
  /** Open work due in the next 7 days, excluding today and overdue. */
  upcoming: number;
  /** Tests in the next two weeks. */
  testsComing: number;
}

export function buildGlanceCounts(
  assignments: RealAssignment[],
  exams: RealExam[],
  now: Date = new Date(),
): GlanceCounts {
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;

  for (const assignment of assignments) {
    if (!isOpenAssignment(assignment)) continue;
    // Shared classification: these counters and the list a student opens from
    // them must never disagree.
    const bucket = classifyDue(assignment.due_date, now);
    if (bucket === "overdue") overdue += 1;
    else if (bucket === "today") dueToday += 1;
    else if (bucket === "soon") upcoming += 1;
  }


  let testsComing = 0;
  for (const exam of exams) {
    if (!exam.exam_date) continue;
    const days = daysBetween(exam.exam_date, now);
    if (days === null) continue;
    if (days >= 0 && days <= TESTS_COMING_DAYS) testsComing += 1;
  }

  return { overdue, dueToday, upcoming, testsComing };
}
