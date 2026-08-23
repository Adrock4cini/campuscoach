/**
 * Real assignment detail — the "Act on an assignment" job.
 * Opening a real assignment must show that assignment, never a demo one.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, HelpCircle, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCapture } from "@/contexts/CaptureContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { daysUntil } from "@/lib/realData/hooks";
import {
  getAssignment,
  updateAssignment,
  deleteAssignment,
  type RealAssignment,
  type AssignmentStatus,
} from "@/lib/realData/assignments";

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export function RealAssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const { classes } = useMyClasses();
  const [assignment, setAssignment] = useState<RealAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(false);
    try {
      setAssignment(await getAssignment(assignmentId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  const className = classes.find((c) => c.id === assignment?.client_class_id)?.name ?? "Class";

  const setStatus = async (next: AssignmentStatus) => {
    if (!assignment) return;
    const updated = await updateAssignment(assignment.id, { status: next });
    if (!updated) return toast.error("Couldn’t update assignment");
    setAssignment(updated);
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  };

  const remove = async () => {
    if (!assignment) return;
    if (!window.confirm(`Delete “${assignment.title}”? This cannot be undone.`)) return;
    const ok = await deleteAssignment(assignment.id);
    if (!ok) return toast.error("Couldn't delete");
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
    navigate("/assignments");
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-10">Loading assignment…</p>;

  if (error) {
    return (
      <Card className="max-w-2xl mx-auto"><CardContent className="p-8 text-center space-y-3">
        <p className="font-medium text-foreground">Couldn’t load this assignment</p>
        <p className="text-sm text-muted-foreground">Nothing was deleted.</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
      </CardContent></Card>
    );
  }

  if (!assignment) {
    return (
      <Card className="max-w-2xl mx-auto"><CardContent className="p-8 text-center space-y-3">
        <p className="font-medium text-foreground">This assignment no longer exists</p>
        <Button size="sm" onClick={() => navigate("/assignments")}>Back to assignments</Button>
      </CardContent></Card>
    );
  }

  const days = daysUntil(assignment.due_date);
  const dueChip =
    days === null ? "No due date" :
    days < 0 ? `${-days}d overdue` :
    days === 0 ? "Due today" :
    days === 1 ? "Due tomorrow" : `Due in ${days}d`;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button
        type="button"
        onClick={() => navigate("/assignments")}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Assignments
      </button>

      <Card className="shadow-card">
        <CardContent className="p-5 space-y-4">
          <div>
            <h1 className="text-2xl font-display font-semibold text-foreground">{assignment.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{className}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{dueChip}</Badge>
            <Badge variant="secondary">{assignment.priority} priority</Badge>
            <Badge variant="outline">⏱ {assignment.estimated_minutes}m</Badge>
            {assignment.source === "canvas" && <Badge variant="outline">Canvas</Badge>}
          </div>

          {assignment.notes && (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{assignment.notes}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={assignment.status} onValueChange={(v: AssignmentStatus) => void setStatus(v)}>
              <SelectTrigger className="h-11 w-[150px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="min-h-11"
              onClick={() => openCapture("scan-assignment", {
                classId: assignment.client_class_id ?? undefined,
                assignmentId: assignment.id,
              })}
            >
              <HelpCircle className="h-4 w-4 mr-1.5" /> Get help with this
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 text-muted-foreground hover:text-danger"
              aria-label={`Delete ${assignment.title}`}
              onClick={() => { void remove(); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
