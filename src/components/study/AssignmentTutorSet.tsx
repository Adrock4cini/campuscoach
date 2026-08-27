import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Loader2, Play, RefreshCw } from "lucide-react";
import { AssignmentProblemReview } from "@/components/assignments/AssignmentProblemReview";
import {
  AssignmentTutorRunner,
  type AssignmentTutorFreshCheckReason,
} from "@/components/study/AssignmentTutorRunner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CURRENT_ARTIFACT_PROMPT_VERSION, type LearningArtifact } from "@/lib/learningArtifacts/types";
import { useLearningArtifact } from "@/lib/learningArtifacts/useLearningArtifact";
import {
  assignmentPracticeSourceFromUnknown,
  isConfirmedAssignmentPracticeSource,
} from "@/lib/assignments/assignmentPracticeSource";
import {
  getCaptureById,
  retryCaptureProcessing,
  type PersistedCapture,
} from "@/lib/supabase/capturePersistence";

interface Props {
  classId: string;
  assignmentId: string;
  captureId: string;
  onFallback: () => void;
}

/**
 * Assignment-help entry point. It intentionally bypasses the generic Study
 * Lab format tabs: a student asked to work through one exact assignment.
 */
export function AssignmentTutorSet({ classId, assignmentId, captureId, onFallback }: Props) {
  const [capture, setCapture] = useState<PersistedCapture | null>(null);
  const [loadingCapture, setLoadingCapture] = useState(true);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [retryingCapture, setRetryingCapture] = useState(false);

  const loadCapture = useCallback(async () => {
    setLoadingCapture(true);
    setCaptureError(null);
    try {
      const loaded = await getCaptureById(captureId);
      if (!loaded
          || loaded.assignmentId !== assignmentId
          || loaded.clientClassId !== classId
          || loaded.kind !== "scan-assignment") {
        setCapture(null);
        setCaptureError("That assignment capture is no longer available.");
      } else {
        setCapture(loaded);
      }
    } catch {
      setCaptureError("The assignment capture could not be loaded. Try again.");
    } finally {
      setLoadingCapture(false);
    }
  }, [assignmentId, captureId, classId]);

  useEffect(() => { void loadCapture(); }, [loadCapture]);

  const retry = useCallback(async () => {
    setRetryingCapture(true);
    setCaptureError(null);
    try {
      await retryCaptureProcessing(captureId);
      await loadCapture();
    } catch {
      setCaptureError("Campus Companion could not finish reading this capture yet.");
    } finally {
      setRetryingCapture(false);
    }
  }, [captureId, loadCapture]);

  if (loadingCapture) {
    return (
      <Card className="rounded-[28px] border-primary/25 bg-card/75 shadow-card">
        <CardContent className="p-5">
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your assignment…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!capture || captureError) {
    return (
      <Card className="rounded-[28px] border-primary/25 bg-card/75 shadow-card">
        <CardContent className="space-y-3 p-5">
          <p role="alert" className="text-sm text-destructive">{captureError ?? "Assignment capture not found."}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => { void loadCapture(); }}>Try again</Button>
            <Button variant="ghost" className="text-primary" onClick={onFallback}>Study this class instead</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (capture.processingStatus !== "ready") {
    return (
      <Card className="rounded-[28px] border-primary/25 bg-card/75 shadow-card">
        <CardContent className="space-y-3 p-5">
          <p role="status" className="text-sm text-muted-foreground">
            Campus Companion is still reading this assignment photo.
          </p>
          <Button
            variant="outline"
            className="h-11 w-full rounded-xl"
            disabled={retryingCapture}
            onClick={() => { void retry(); }}
          >
            {retryingCapture && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Retry reading this assignment
          </Button>
        </CardContent>
      </Card>
    );
  }

  const practiceSource = assignmentPracticeSourceFromUnknown(capture.practiceSource, capture.kind);
  if (!isConfirmedAssignmentPracticeSource(practiceSource)) {
    return (
      <Card className="rounded-[28px] border-primary/25 bg-card/75 shadow-card">
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Assignment Tutor</h2>
            <p className="mt-1 text-sm text-muted-foreground">Confirm the exact problem before Tutor builds or grades anything.</p>
          </div>
          <AssignmentProblemReview
            captureId={captureId}
            assignmentId={assignmentId}
            classId={classId}
            source={practiceSource}
            onFallback={onFallback}
            onConfirmed={(nextSource) => setCapture((current) => (
              current ? { ...current, practiceSource: nextSource } : current
            ))}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AssignmentProblemReview
        captureId={captureId}
        assignmentId={assignmentId}
        classId={classId}
        source={practiceSource}
        onFallback={onFallback}
        onConfirmed={(nextSource) => setCapture((current) => (
          current ? { ...current, practiceSource: nextSource } : current
        ))}
      />
      <ConfirmedAssignmentTutorSet
        key={`${captureId}:${practiceSource.version}`}
        classId={classId}
        assignmentId={assignmentId}
        captureId={captureId}
        onFallback={onFallback}
        onCaptureBoundaryChanged={loadCapture}
      />
    </div>
  );
}

function ConfirmedAssignmentTutorSet({
  classId,
  assignmentId,
  captureId,
  onFallback,
  onCaptureBoundaryChanged,
}: Props & { onCaptureBoundaryChanged: () => Promise<void> }) {
  const scope = useMemo(() => ({
    classId,
    assignmentId,
    captureId,
    studyScope: { type: "recent" as const, id: `capture-${captureId}`, label: "This assignment" },
  }), [assignmentId, captureId, classId]);
  const {
    artifact,
    loading,
    generating,
    error,
    captureProcessing,
    generate,
    reload,
  } = useLearningArtifact("practice", scope);
  const [open, setOpen] = useState(false);
  const [retryingCapture, setRetryingCapture] = useState(false);
  const autoKey = useRef<string | null>(null);
  const current = artifact as LearningArtifact<"practice"> | null;
  const needsRefresh = Boolean(current && current.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION);

  const build = useCallback(async (regenerate: boolean) => {
    const built = await generate({ regenerate, count: 1 });
    if (built) setOpen(true);
  }, [generate]);

  useEffect(() => {
    if (loading || generating || error || captureProcessing) return;
    if (current && !needsRefresh) {
      const key = `open:${current.id}`;
      if (autoKey.current === key) return;
      autoKey.current = key;
      setOpen(true);
      return;
    }
    const key = `build:${classId}:${assignmentId}:${captureId}`;
    if (autoKey.current === key) return;
    autoKey.current = key;
    void build(Boolean(current));
  }, [assignmentId, build, captureId, captureProcessing, classId, current, error, generating, loading, needsRefresh]);

  const retryProcessing = useCallback(async () => {
    setRetryingCapture(true);
    try {
      const { retryCaptureProcessing } = await import("@/lib/supabase/capturePersistence");
      await retryCaptureProcessing(captureId);
    } catch {
      // The following generation call owns the student-facing error.
    } finally {
      setRetryingCapture(false);
    }
    autoKey.current = null;
    await build(Boolean(current));
  }, [build, captureId, current]);

  const buildFreshCheck = useCallback(async (reason: AssignmentTutorFreshCheckReason) => {
    setOpen(false);
    autoKey.current = null;
    if (reason === "practice_source_changed") {
      await onCaptureBoundaryChanged();
      return;
    }
    await build(true);
  }, [build, onCaptureBoundaryChanged]);

  return (
    <Card className="overflow-hidden rounded-[28px] border-primary/25 bg-card/75 shadow-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HelpCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Assignment Tutor</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Get a hint, see a different example, then prove it on a new problem.
            </p>
          </div>
        </div>

        {(loading || generating) && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loading ? "Loading your assignment…" : "Building a safe walkthrough…"}
          </p>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {captureProcessing ? (
          <Button
            variant="outline"
            className="h-11 w-full rounded-xl"
            disabled={retryingCapture || generating}
            onClick={() => { void retryProcessing(); }}
          >
            {retryingCapture ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry reading this assignment
          </Button>
        ) : error ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => {
              autoKey.current = null;
              void build(Boolean(current));
            }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
            <Button variant="ghost" className="h-11 rounded-xl text-primary" onClick={onFallback}>
              Study this class instead
            </Button>
          </div>
        ) : current && !open ? (
          <Button className="h-12 w-full rounded-2xl text-base font-semibold" onClick={() => setOpen(true)}>
            <Play className="mr-2 h-4 w-4" /> Continue help
          </Button>
        ) : null}
      </CardContent>

      {current && (
        <AssignmentTutorRunner
          open={open}
          onOpenChange={setOpen}
          artifact={current}
          assignmentId={assignmentId}
          captureId={captureId}
          onCompleted={() => { void reload(); }}
          onFreshCheckRequired={buildFreshCheck}
        />
      )}
    </Card>
  );
}
