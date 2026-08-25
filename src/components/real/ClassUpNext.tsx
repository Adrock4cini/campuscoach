/**
 * ClassUpNext — the top of the class command center.
 *
 * Answers, in order: what needs attention right now, what test am I
 * preparing for, and what should I do next. Reads only permanent memory
 * (via the coach recommender) plus real assignments/exams.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CalendarClock, Camera, ClipboardList, FileQuestion, GraduationCap, Plus, Zap } from "lucide-react";
import { useRealAssignments, useRealExams, daysUntil } from "@/lib/realData/hooks";
import { useCoachRecommendations } from "@/lib/coach/useCoachRecommendations";
import { useClassReadinessSignals } from "@/lib/intelligence/useClassReadinessSignals";
import { assessMaterial } from "@/lib/intelligence/materialSufficiency";
import { coverageSignal, nextTestAction, practiceSignal } from "@/lib/intelligence/testSignals";
import { useCapture } from "@/contexts/CaptureContext";
import { AddAssignmentDialog } from "./AddAssignmentDialog";
import { AddExamDialog } from "./AddExamDialog";


interface Props {
  classId: string;
  className: string;
}

function dueChip(days: number | null) {
  if (days === null) return "No date";
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "Today";
  return `in ${days}d`;
}

export function ClassUpNext({ classId, className }: Props) {
  const { items: assignments, loading: assignmentsLoading } = useRealAssignments(classId);
  const { items: exams, loading: examsLoading } = useRealExams(classId);
  const { recommendations, loading: coachLoading } = useCoachRecommendations();

  const rec = recommendations.find((r) => r.classId === classId);
  const nextAssignment = assignments
    .filter((a) => a.status !== "complete" && a.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];
  const nextExam = exams
    .filter((e) => e.exam_date && (daysUntil(e.exam_date) ?? -1) >= 0)
    .sort((a, b) => (a.exam_date ?? "").localeCompare(b.exam_date ?? ""))[0];

  const { open: openCapture } = useCapture();
  const [addAssignment, setAddAssignment] = useState(false);
  const [addExam, setAddExam] = useState(false);
  const { signals, loading: signalsLoading } = useClassReadinessSignals(classId);
  const material = assessMaterial(signals, { examTitle: nextExam?.title ?? null });
  // Three honest signals, shown separately: urgency (the date chip),
  // coverage (do we have material), practice (what the student demonstrated).
  const coverage = coverageSignal(signals);
  const practice = practiceSignal(signals);
  const testAction = nextTestAction(coverage, practice);

  const loading = assignmentsLoading || examsLoading || coachLoading;


  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/5 shadow-card">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="text-xs font-medium text-primary">Up next in {className}</p>
          <h2 className="mt-0.5 font-display text-lg font-semibold text-foreground">
            {loading
              ? "Checking what needs you…"
              : nextExam || nextAssignment
                ? rec?.why ?? "Here's what's coming up in this class."
                : "Nothing scheduled for this class yet."}
          </h2>
        </div>

        {(nextExam || nextAssignment) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {nextExam && (
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 p-3">
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next test</p>
                  <p className="truncate text-sm text-foreground">{nextExam.title}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{dueChip(daysUntil(nextExam.exam_date))}</Badge>
              </div>
            )}
            {nextAssignment && (
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 p-3">
                <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next due</p>
                  <p className="truncate text-sm text-foreground">{nextAssignment.title}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{dueChip(daysUntil(nextAssignment.due_date))}</Badge>
              </div>
            )}
          </div>
        )}

        {!signalsLoading && !material.sufficient ? (
          <div className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <FileQuestion className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{material.label}</p>
                <p className="text-xs text-muted-foreground">{material.detail}</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => openCapture(undefined, classId)}
              className="h-12 w-full rounded-2xl border-0 bg-gradient-calm text-primary-foreground hover:opacity-90"
            >
              <Camera className="mr-1.5 h-4 w-4" />
              {nextExam ? "Add material for this test" : material.ctaLabel}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        ) : !nextExam && !nextAssignment ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Add what you already know — one assignment or test date is enough to start. Or upload the syllabus and
              Campus Coach will pull the dates out for you.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => setAddAssignment(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add assignment
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => setAddExam(true)}
              >
                <GraduationCap className="mr-1.5 h-4 w-4" /> Add test
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs">
              <Link to={`/classes/${encodeURIComponent(classId)}/syllabus`} className="text-primary hover:underline">
                Upload syllabus instead
              </Link>
              <Link to={`/study-lab?classId=${encodeURIComponent(classId)}`} className="text-primary hover:underline">
                Study this class
              </Link>
            </div>
          </div>
        ) : (
          <Button asChild className="h-12 w-full rounded-2xl border-0 bg-gradient-calm text-primary-foreground hover:opacity-90">
            <Link
              to={nextExam
                ? `/study-lab?classId=${encodeURIComponent(classId)}&examId=${encodeURIComponent(nextExam.id)}`
                : `/study-lab?classId=${encodeURIComponent(classId)}`}
            >
              <Zap className="mr-1.5 h-4 w-4" />
              {nextExam ? "Prepare for this test" : "Start a 10-minute study set"}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        )}

      </CardContent>
      <AddAssignmentDialog open={addAssignment} onOpenChange={setAddAssignment} defaultClientClassId={classId} />
      <AddExamDialog open={addExam} onOpenChange={setAddExam} defaultClientClassId={classId} />
    </Card>
  );
}
