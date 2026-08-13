/**
 * Real dashboard agenda — the student's next real class, assignment, or exam.
 * Everything here is class-bound and sourced from the signed-in student's
 * existing class, assignment, and exam records.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import type { ClassInfo } from "@/data/demo";
import { useCapture } from "@/contexts/CaptureContext";
import { buildDashboardAgenda, type DashboardAgendaItem as AgendaItem } from "@/lib/calendar/dashboardAgenda";
import { DashboardAgendaView } from "@/components/dashboard/DashboardAgendaView";

export function RealTodaysPlan({ classes = [], now = new Date() }: { classes?: ClassInfo[]; now?: Date }) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const {
    items: assignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    reload: reloadAssignments,
  } = useRealAssignments();
  const {
    items: exams,
    loading: examsLoading,
    error: examsError,
    reload: reloadExams,
  } = useRealExams();
  const agenda = useMemo(
    () => buildDashboardAgenda(classes, assignments, exams, now),
    [assignments, classes, exams, now],
  );
  const loading = assignmentsLoading || examsLoading;
  const error = assignmentsError || examsError;

  const openItem = (item: AgendaItem) => {
    if (item.kind === "class") {
      openCapture(undefined, item.classId);
      return;
    }
    if (item.kind === "exam" && item.classId) {
      navigate(`/study-lab?classId=${encodeURIComponent(item.classId)}&examId=${encodeURIComponent(item.id)}`);
      return;
    }
    const query = item.classId
      ? `?classId=${encodeURIComponent(item.classId)}&assignmentId=${encodeURIComponent(item.id)}`
      : "";
    navigate(`/assignments${query}`);
  };

  return (
    <DashboardAgendaView
      agenda={agenda}
      loading={loading}
      error={error}
      now={now}
      onRetry={() => { void reloadAssignments(); void reloadExams(); }}
      onOpenItem={openItem}
    />
  );
}
