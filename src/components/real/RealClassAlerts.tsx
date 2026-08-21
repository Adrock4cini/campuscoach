/**
 * Real class alerts hook — one headline per class from the student's own
 * assignment and exam rows.
 */
import { useMemo } from "react";
import type { ClassInfo } from "@/data/demo";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { buildClassAlerts, type ClassAlert } from "@/lib/dashboard/classAlerts";

export function useRealClassAlerts(classes: ClassInfo[], now: Date = new Date()): Record<string, ClassAlert> {
  const { items: assignments } = useRealAssignments();
  const { items: exams } = useRealExams();
  return useMemo(() => buildClassAlerts(classes, assignments, exams, now), [classes, assignments, exams, now]);
}
