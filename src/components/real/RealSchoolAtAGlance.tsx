/**
 * Real "next up" strip — the stable cross-class anchor on Today, fed by the
 * signed-in student's own assignments and exams.
 */
import { useMemo } from "react";
import type { ClassInfo } from "@/data/demo";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { buildNextUpSummary } from "@/lib/dashboard/classAlerts";
import { NextUpStrip } from "@/components/dashboard/NextUpStrip";

export function RealSchoolAtAGlance({ classes = [], now = new Date() }: { classes?: ClassInfo[]; now?: Date }) {
  const { items: assignments, loading: assignmentsLoading } = useRealAssignments();
  const { items: exams, loading: examsLoading } = useRealExams();
  const summary = useMemo(
    () => buildNextUpSummary(classes, assignments, exams, now),
    [classes, assignments, exams, now],
  );

  return <NextUpStrip summary={summary} loading={assignmentsLoading || examsLoading} />;
}
