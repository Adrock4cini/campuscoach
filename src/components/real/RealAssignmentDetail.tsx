/**
 * Real assignment detail — the "Act on an assignment" job.
 * Opening a real assignment must show that assignment, never a demo one.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Clock, HelpCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCapture } from "@/contexts/CaptureContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { dueChipLabel } from "@/lib/dashboard/dueStatus";


import {
  getAssignment,
  updateAssignment,
  deleteAssignment,
  type RealAssignment,
  type AssignmentStatus,
} from "@/lib/realData/assignments";
import {
  getLatestCaptureForAssignment,
  retryCaptureProcessing,
  type PersistedCapture,
} from "@/lib/supabase/capturePersistence";
import { AssignmentProblemReview } from "@/components/assignments/AssignmentProblemReview";
import { assignmentPracticeSourceFromUnknown } from "@/lib/assignments/assignmentPracticeSource";
import { isConfirmedAssignmentTutorPracticeSource } from "@/lib/assignments/assignmentTutorSupport";

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
  const [assignmentCapture, setAssignmentCapture] = useState<PersistedCapture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryingCapture, setRetryingCapture] = useState(false);

  const load = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(false);
    try {
      const [nextAssignment, nextCapture] = await Promise.all([
        getAssignment(assignmentId),
        getLatestCaptureForAssignment(assignmentId),
      ]);
      setAssignment(nextAssignment);
      setAssignmentCapture(nextAssignment ? nextCapture : null);
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

  const openAssignmentCapture = () => {
    if (!assignment) return;
    openCapture("scan-assignment", {
      classId: assignment.client_class_id ?? undefined,
      assignmentId: assignment.id,
    });
  };

  const retryAssignmentCapture = async () => {
    if (!assignmentCapture) return;
    setRetryingCapture(true);
    try {
      const nextStatus = await retryCaptureProcessing(assignmentCapture.id);
      if (nextStatus === "ready" && assignment) {
        setAssignmentCapture(await getLatestCaptureForAssignment(assignment.id));
      } else {
        setAssignmentCapture((current) => current ? { ...current, processingStatus: nextStatus } : current);
      }
    } catch {
      toast.error("Couldn’t finish reading this assignment. Try again or capture it again.");
    } finally {
      setRetryingCapture(false);
    }
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

  
  const dueChip = dueChipLabel(assignment.due_date);

  const captureMatchesAssignment = Boolean(
    assignmentCapture
    && assignment.client_class_id
    && assignmentCapture.kind === "scan-assignment"
    && assignmentCapture.assignmentId === assignment.id
    && assignmentCapture.clientClassId === assignment.client_class_id,
  );
  const captureStatus = captureMatchesAssignment ? assignmentCapture?.processingStatus : null;
  const practiceSource = assignmentPracticeSourceFromUnknown(
    assignmentCapture?.practiceSource,
    assignmentCapture?.kind ?? "scan-assignment",
  );
  const practiceSourceConfirmed = isConfirmedAssignmentTutorPracticeSource(practiceSource);

  const continueAssignmentHelp = () => {
    if (!assignmentCapture || !assignment.client_class_id || !captureMatchesAssignment) return;
    const params = new URLSearchParams({
      classId: assignment.client_class_id,
      captureId: assignmentCapture.id,
      assignmentId: assignment.id,
      format: "practice",
      intent: "assignment-help",
    });
    navigate(`/study-lab?${params.toString()}`);
  };

  /**
   * "Get help with this" is a tutor door, never the scanner. When this
   * assignment already has grounded material (a matching ready capture, or
   * notes describing the work), the student goes straight into Study Lab with
   * assignmentId + classId preserved. Adding missing pages stays a separate,
   * explicit action.
   */
  const hasGroundedMaterial = Boolean(
    (captureMatchesAssignment && captureStatus === "ready")
    || (assignment.notes && assignment.notes.trim().length > 0),
  );

  const openAssignmentHelp = () => {
    if (!assignment.client_class_id) {
      toast.error("Attach this assignment to a class first.");
      return;
    }
    if (captureMatchesAssignment && captureStatus === "ready" && practiceSourceConfirmed) {
      continueAssignmentHelp();
      return;
    }
    const params = new URLSearchParams({
      classId: assignment.client_class_id,
      assignmentId: assignment.id,
      intent: "assignment-help",
    });
    if (captureMatchesAssignment && captureStatus === "ready" && assignmentCapture) {
      params.set("captureId", assignmentCapture.id);
    }
    navigate(`/study-lab?${params.toString()}`);
  };

  const practiceCapturedConcept = () => {
    if (!assignment.client_class_id) return;
    const params = new URLSearchParams({
      classId: assignment.client_class_id,
    });
    navigate(`/study-lab?${params.toString()}`);
  };


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

          <p className="text-xs leading-relaxed text-muted-foreground">
            Early Access guided walkthroughs currently cover one percent-of or percent-discount
            problem. Other assignment photos still save concepts for class study.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={assignment.status} onValueChange={(v: AssignmentStatus) => void setStatus(v)}>
              <SelectTrigger className="h-11 w-[150px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasGroundedMaterial && (
              <Button className="min-h-11" onClick={openAssignmentHelp}>
                <HelpCircle className="h-4 w-4 mr-1.5" />
                {practiceSourceConfirmed && captureStatus === "ready"
                  ? "Open percent walkthrough"
                  : "Get help with this"}
              </Button>
            )}
            {!assignmentCapture && (
              <Button
                variant={hasGroundedMaterial ? "outline" : "default"}
                className="min-h-11"
                onClick={openAssignmentCapture}
              >
                <Camera className="h-4 w-4 mr-1.5" /> Add assignment pages
              </Button>
            )}

            {captureStatus === "ready" && assignmentCapture && assignment.client_class_id && (
              <AssignmentProblemReview
                captureId={assignmentCapture.id}
                assignmentId={assignment.id}
                classId={assignment.client_class_id}
                source={practiceSource}
                onFallback={practiceCapturedConcept}
                onConfirmed={(nextSource) => {
                  setAssignmentCapture((current) => current
                    ? { ...current, practiceSource: nextSource }
                    : current);
                }}
              />
            )}
            {(captureStatus === "processing" || captureStatus === "queued") && (
              <div className="flex flex-wrap items-center gap-2" role="status">
                <span className="text-sm text-muted-foreground">
                  Campus Companion is still reading this assignment.
                </span>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={retryingCapture}
                  onClick={() => { void retryAssignmentCapture(); }}
                >
                  {retryingCapture
                    ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    : <RefreshCw className="h-4 w-4 mr-1.5" />}
                  {retryingCapture ? "Retrying…" : "Retry processing"}
                </Button>
              </div>
            )}
            {captureStatus === "failed" && (
              <div className="w-full space-y-2">
                <p role="alert" className="text-sm text-destructive">
                  Campus Companion saved this assignment, but couldn’t finish reading it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={retryingCapture}
                    onClick={() => { void retryAssignmentCapture(); }}
                  >
                    {retryingCapture
                      ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      : <RefreshCw className="h-4 w-4 mr-1.5" />}
                    {retryingCapture ? "Retrying…" : "Try processing again"}
                  </Button>
                  <Button className="min-h-11" onClick={openAssignmentCapture}>
                    <HelpCircle className="h-4 w-4 mr-1.5" /> Capture again
                  </Button>
                </div>
              </div>
            )}
            {assignmentCapture && !captureMatchesAssignment && (
              <div className="w-full space-y-2">
                <p role="alert" className="text-sm text-muted-foreground">
                  This saved help session doesn’t match this assignment’s class.
                </p>
                <Button className="min-h-11" onClick={openAssignmentCapture}>
                  <HelpCircle className="h-4 w-4 mr-1.5" /> Capture again
                </Button>
              </div>
            )}
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
