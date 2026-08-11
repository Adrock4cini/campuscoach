/**
 * Class-scoped assignments & exams strip — shown on real class detail pages.
 * Complete checkbox + Help me actions keep students moving without leaving the class.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Calendar, CheckCircle2, Circle, HelpCircle } from "lucide-react";
import { useRealAssignments, useRealExams, daysUntil } from "@/lib/realData/hooks";
import { AddAssignmentDialog } from "./AddAssignmentDialog";
import { AddExamDialog } from "./AddExamDialog";
import { AssignmentHelpDialog } from "./AssignmentHelpDialog";
import { updateAssignment, type RealAssignment, type AssignmentStatus } from "@/lib/realData/assignments";
import { useCapture } from "@/contexts/CaptureContext";
import { getLatestAssignmentScan } from "@/lib/supabase/capturePersistence";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function RealClassAssignmentsExams({ classId }: { classId: string }) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const {
    items: assignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    reload: reloadAssignments,
  } = useRealAssignments(classId);
  const {
    items: exams,
    loading: examsLoading,
    error: examsError,
    reload: reloadExams,
  } = useRealExams(classId);
  const [addA, setAddA] = useState(false);
  const [addE, setAddE] = useState(false);
  const [helpTarget, setHelpTarget] = useState<RealAssignment | null>(null);
  const practiceRequest = useRef(0);

  useEffect(() => () => {
    practiceRequest.current += 1;
  }, [classId]);

  const toggle = async (assignment: RealAssignment) => {
    const next: AssignmentStatus =
      assignment.status === "complete" ? "not_started" : "complete";
    const updated = await updateAssignment(assignment.id, { status: next });
    if (!updated) {
      toast.error("Couldn’t update assignment");
      return;
    }
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
    toast.success(next === "complete" ? "Marked complete" : "Marked not done");
  };

  const practiceAssignment = async (assignment: RealAssignment) => {
    const scopedClassId = assignment.client_class_id || classId;
    const requestId = ++practiceRequest.current;
    try {
      const scan = await getLatestAssignmentScan(scopedClassId, assignment.id);
      if (requestId !== practiceRequest.current) return;
      if (scan?.processingStatus === "ready") {
        const query = new URLSearchParams({
          classId: scopedClassId,
          captureId: scan.id,
        });
        navigate(`/study-lab?${query.toString()}`);
        return;
      }
      if (scan && scan.processingStatus !== "failed") {
        toast.message("Your assignment is still being prepared", {
          description: "Campus Brain is reading the pages. Try Practice again shortly.",
        });
        return;
      }

      openCapture("scan-assignment", scopedClassId, { assignmentId: assignment.id });
      toast.message("Photograph the assignment first", {
        description: "Practice will stay focused on these exact pages.",
      });
    } catch {
      if (requestId !== practiceRequest.current) return;
      toast.error("Couldn’t open assignment practice. Try again.");
    }
  };

  return (
    <div id="class-assignments-exams" className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
            <h3 className="font-display font-semibold text-foreground">Assignments</h3>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddA(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {assignmentsLoading ? (
            <p className="text-xs text-muted-foreground">Loading assignments…</p>
          ) : assignmentsError ? (
            <button className="text-xs text-primary" onClick={() => void reloadAssignments()}>
              Couldn’t load assignments · Try again
            </button>
          ) : assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No assignments yet. Add one, or photograph a handout to start.
            </p>
          ) : (
            <ul className="space-y-2">
              {assignments.slice(0, 8).map((a) => {
                const days = daysUntil(a.due_date);
                const chip =
                  days === null ? "No date" :
                  days < 0 ? `${-days}d overdue` :
                  days === 0 ? "Today" : `${days}d`;
                const done = a.status === "complete";
                return (
                  <li
                    key={a.id}
                    className="rounded-xl border border-border/40 bg-background/40 px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => void toggle(a)}
                        aria-label={done ? "Mark not complete" : "Mark complete"}
                        className="shrink-0"
                      >
                        {done ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/45" />
                        )}
                      </button>
                      <span
                        className={cn(
                          "flex-1 text-sm truncate",
                          done ? "line-through text-muted-foreground" : "text-foreground font-medium",
                        )}
                      >
                        {a.title}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        <Clock className="h-3 w-3 mr-0.5" />
                        {chip}
                      </Badge>
                    </div>
                    {!done && (
                      <div className="flex gap-1.5 pl-7">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-primary"
                          onClick={() => setHelpTarget(a)}
                        >
                          <HelpCircle className="h-3.5 w-3.5 mr-1" />
                          Help me
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => void toggle(a)}
                        >
                          Complete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
            <h3 className="font-display font-semibold text-foreground">Exams</h3>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddE(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {examsLoading ? (
            <p className="text-xs text-muted-foreground">Loading exams…</p>
          ) : examsError ? (
            <button className="text-xs text-primary" onClick={() => void reloadExams()}>
              Couldn’t load exams · Try again
            </button>
          ) : exams.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No exams yet. Add a test date so we can coach toward it.
            </p>
          ) : (
            <ul className="space-y-2">
              {exams.slice(0, 6).map((e) => {
                const days = daysUntil(e.exam_date);
                const chip =
                  days === null ? "Date TBD" :
                  days < 0 ? `${-days}d ago` :
                  days === 0 ? "Today" : `${days}d`;
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate text-foreground">{e.title}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{e.readiness}%</span>
                    <Badge variant="outline" className="text-[10px]">
                      <Calendar className="h-3 w-3 mr-0.5" />
                      {chip}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddAssignmentDialog open={addA} onOpenChange={setAddA} defaultClientClassId={classId} />
      <AddExamDialog open={addE} onOpenChange={setAddE} defaultClientClassId={classId} />
      <AssignmentHelpDialog
        open={!!helpTarget}
        onOpenChange={(open) => {
          if (!open) setHelpTarget(null);
        }}
        assignment={helpTarget}
        onPhotograph={(assignment) => {
          openCapture("scan-assignment", assignment.client_class_id || classId, {
            assignmentId: assignment.id,
          });
          toast.message("Photograph the pages", {
            description: "We’ll turn the problems into practice when processing finishes.",
          });
        }}
        onDontGetIt={(assignment) => {
          openCapture("quick-note", assignment.client_class_id || classId, {
            assignmentId: assignment.id,
          });
          toast.message("Describe where you’re stuck", {
            description: "We’ll use this note to focus help on this assignment.",
          });
        }}
        onPractice={(assignment) => {
          void practiceAssignment(assignment);
        }}
        onToggleComplete={(assignment) => {
          void toggle(assignment);
        }}
      />
    </div>
  );
}
