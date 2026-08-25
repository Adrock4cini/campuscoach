/**
 * Class-scoped assignments & exams strip — shown on real class detail pages.
 * Lets the student add + view upcoming items without leaving the class.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Calendar, CheckCircle2, HelpCircle } from "lucide-react";
import { useRealAssignments, useRealExams, daysUntil } from "@/lib/realData/hooks";
import { AddAssignmentDialog } from "./AddAssignmentDialog";
import { AddExamDialog } from "./AddExamDialog";
import { updateAssignment, type AssignmentStatus } from "@/lib/realData/assignments";
import { toast } from "sonner";
import { assessmentLabel, classifyAssessment } from "@/lib/assessments/classification";
import { labelTestReadiness } from "@/lib/intelligence/testReadinessLabel";
import { useCapture } from "@/contexts/CaptureContext";

export function RealClassAssignmentsExams({ classId }: { classId: string }) {
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
  const { open: openCapture } = useCapture();
  const [addA, setAddA] = useState(false);
  const [addE, setAddE] = useState(false);

  const toggle = async (id: string, status: AssignmentStatus) => {
    const updated = await updateAssignment(id, { status: status === "complete" ? "not_started" : "complete" });
    if (!updated) {
      toast.error("Couldn’t update assignment");
      return;
    }
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Assignments */}
      <Card className="shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
            <h3 className="font-display font-semibold text-foreground">Assignments & quizzes</h3>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddA(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {assignmentsLoading && assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading assignments…</p>
          ) : assignmentsError ? (
            <button className="text-xs text-primary" onClick={() => void reloadAssignments()}>
              Couldn’t load assignments · Try again
            </button>
          ) : assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No assignments or quizzes yet.</p>
          ) : (
            <ul className="space-y-2">
              {assignments.slice(0, 6).map((a) => {
                const days = daysUntil(a.due_date);
                const type = classifyAssessment({ row: "assignment", title: a.title, meta: (a as { meta?: unknown }).meta });
                const chip =
                  days === null ? "No date" :
                  days < 0 ? `${-days}d overdue` :
                  days === 0 ? "Today" : `${days}d`;
                return (
                  <li key={a.id} className="rounded-xl px-1 py-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(a.id, a.status)}
                        aria-label={a.status === "complete" ? `Mark ${a.title} not started` : `Mark ${a.title} complete`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                      >
                        <CheckCircle2 className={`h-4 w-4 ${a.status === "complete" ? "text-success" : "text-muted-foreground/40"}`} />
                      </button>
                      <span className={`flex-1 text-sm truncate ${a.status === "complete" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {a.title}
                      </span>
                      {type !== "assignment" && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{assessmentLabel(type)}</Badge>
                      )}
                      {a.source === "syllabus" && <Badge variant="outline" className="text-[10px]">Syllabus</Badge>}
                      <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3 mr-0.5" />{chip}</Badge>
                    </div>
                    {a.status !== "complete" && (
                      <div className="pl-11">
                        {/* Homework help is the same brain as test prep: the photo
                            is linked to this assignment, so its concepts land in
                            Class Memory and later show up in study + readiness. */}
                        <button
                          type="button"
                          onClick={() => openCapture("scan-assignment", { classId, assignmentId: a.id })}
                          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          Get help with this
                        </button>
                      </div>
                    )}
                  </li>
                );

              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Exams */}
      <Card className="shadow-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
            <h3 className="font-display font-semibold text-foreground">Exams</h3>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddE(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {examsLoading && exams.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading exams…</p>
          ) : examsError ? (
            <button className="text-xs text-primary" onClick={() => void reloadExams()}>
              Couldn’t load exams · Try again
            </button>
          ) : exams.length === 0 ? (
            <p className="text-xs text-muted-foreground">No exams yet.</p>
          ) : (
            <ul className="space-y-2">
              {exams.slice(0, 6).map((e) => {
                const days = daysUntil(e.exam_date);
                const chip =
                  days === null ? "Date TBD" :
                  days < 0 ? `${-days}d ago` :
                  days === 0 ? "Today" : `${days}d`;
                return (
                  <li key={e.id} className="rounded-lg border border-border/50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate text-foreground">{e.title}</span>
                      {e.source === "syllabus" && <Badge variant="outline" className="text-[10px]">Syllabus</Badge>}
                      <span className="text-[11px] text-muted-foreground" title={labelTestReadiness(e.readiness).meaning}>
                        {labelTestReadiness(e.readiness).label}
                      </span>
                      <Badge variant="outline" className="text-[10px]"><Calendar className="h-3 w-3 mr-0.5" />{chip}</Badge>
                    </div>
                    {e.topics.length > 0 && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">Study: {e.topics.join(", ")}</p>
                    )}
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-9 px-2 text-xs text-primary"
                    >
                      <Link to={`/study-lab?classId=${encodeURIComponent(classId)}&examId=${encodeURIComponent(e.id)}`}>
                        Prepare for this test
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddAssignmentDialog open={addA} onOpenChange={setAddA} defaultClientClassId={classId} />
      <AddExamDialog open={addE} onOpenChange={setAddE} defaultClientClassId={classId} />
    </div>
  );
}
