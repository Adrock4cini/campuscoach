/**
 * Real "week ahead" container — orientation counts from the signed-in
 * student's own classes, assignments and exams.
 */
import { useMemo } from "react";
import type { ClassInfo } from "@/data/demo";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { buildWeekAhead } from "@/lib/dashboard/weekAhead";
import { countClassMeetings } from "@/lib/calendar/weekGlance";
import { WeekAheadStrip } from "@/components/dashboard/WeekAheadStrip";

export function RealWeekAhead({ classes = [], now = new Date() }: { classes?: ClassInfo[]; now?: Date }) {
  const { items: assignments, loading: assignmentsLoading } = useRealAssignments();
  const { items: exams, loading: examsLoading } = useRealExams();

  const weekAhead = useMemo(
    () => buildWeekAhead(classes, assignments, exams, now),
    [classes, assignments, exams, now],
  );
  const meetings = useMemo(() => countClassMeetings(classes, now), [classes, now]);

  return <WeekAheadStrip weekAhead={weekAhead} meetings={meetings} loading={assignmentsLoading || examsLoading} />;
}
