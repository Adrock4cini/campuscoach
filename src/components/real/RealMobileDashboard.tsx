/**
 * Concept C dashboard — the real student's Today screen.
 *
 * Hierarchy: at a glance → your classes → today → recommended next →
 * quick actions. Every number and string here comes from the signed-in
 * student's own assignment, exam, class and coach data.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ClassInfo } from "@/data/demo";
import type { CaptureKind } from "@/lib/capture/types";
import { useCapture } from "@/contexts/CaptureContext";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { useCoachRecommendations } from "@/lib/coach/useCoachRecommendations";
import { buildGlanceCounts } from "@/lib/dashboard/glanceCounts";
import { buildUrgentItems, type UrgentItem } from "@/lib/dashboard/urgentItems";
import { buildClassAlerts } from "@/lib/dashboard/classAlerts";
import { AtAGlanceTiles } from "@/components/dashboard/AtAGlanceTiles";
import { ClassRail } from "@/components/dashboard/ClassRail";
import { TodayList } from "@/components/dashboard/TodayList";
import { CoachNextCard } from "@/components/dashboard/CoachNextCard";
import { QuickActionsRow } from "@/components/dashboard/QuickActionsRow";

export function RealMobileDashboard({
  classes = [],
  classesLoading = false,
  now = new Date(),
}: {
  classes?: ClassInfo[];
  classesLoading?: boolean;
  now?: Date;
}) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const { items: assignments, loading: assignmentsLoading } = useRealAssignments();
  const { items: exams, loading: examsLoading } = useRealExams();
  const { recommendations, loading: coachLoading } = useCoachRecommendations();

  const loading = assignmentsLoading || examsLoading;

  const counts = useMemo(() => buildGlanceCounts(assignments, exams, now), [assignments, exams, now]);
  const alerts = useMemo(() => buildClassAlerts(classes, assignments, exams, now), [classes, assignments, exams, now]);
  const urgent = useMemo(() => buildUrgentItems(classes, assignments, exams, now), [classes, assignments, exams, now]);

  const openItem = (item: UrgentItem) => {
    if (item.kind === "exam") {
      const query = item.classId ? `?classId=${encodeURIComponent(item.classId)}&examId=${encodeURIComponent(item.id)}` : "";
      navigate(`/study-lab${query}`);
      return;
    }
    navigate(`/assignments/${encodeURIComponent(item.id)}`);
  };

  const handleQuickAction = (kind?: CaptureKind) => openCapture(kind);

  return (
    <div className="space-y-5">
      <AtAGlanceTiles counts={counts} loading={loading} />
      <ClassRail classes={classes} alerts={alerts} loading={classesLoading} />
      <TodayList items={urgent} loading={loading} onOpenItem={openItem} />
      <CoachNextCard recommendation={recommendations[0] ?? null} loading={coachLoading} />
      <QuickActionsRow onAction={handleQuickAction} />
    </div>
  );
}
