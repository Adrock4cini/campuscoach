/**
 * Real "school at a glance" — stable Today summary fed by the signed-in
 * student's own assignments and exams.
 */
import { useMemo } from "react";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { buildWeekGlance } from "@/lib/calendar/weekGlance";
import { SchoolAtAGlance } from "@/components/dashboard/SchoolAtAGlance";

export function RealSchoolAtAGlance({ now = new Date() }: { now?: Date }) {
  const { items: assignments, loading: assignmentsLoading } = useRealAssignments();
  const { items: exams, loading: examsLoading } = useRealExams();
  const glance = useMemo(() => buildWeekGlance(assignments, exams, now), [assignments, exams, now]);

  return <SchoolAtAGlance glance={glance} loading={assignmentsLoading || examsLoading} />;
}
