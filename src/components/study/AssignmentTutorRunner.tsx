/**
 * AssignmentTutorRunner — a gated teaching loop for one captured problem.
 *
 * Help and the original attempt are diagnostic only. The changed-value
 * transfer attempt is the sole durable mastery signal sent to the server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { LearningArtifact, PracticePayload } from "@/lib/learningArtifacts/types";
import { readFunctionErrorDetails } from "@/lib/learningArtifacts/functionError";
import { cleanStudyText } from "@/lib/study/studyText";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import {
  assignmentTutorReducer,
  clearAssignmentTutorState,
  createAssignmentTutorState,
  readAssignmentTutorState,
  writeAssignmentTutorState,
  type AssignmentTutorConfidence,
  type AssignmentTutorState,
  type AssignmentTutorStateContext,
} from "@/lib/assignments/assignmentTutorState";
import { Check, Lightbulb, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface AssignmentTutorCompletion {
  readiness: number | null;
  readinessDelta: number | null;
  correct: boolean;
  recovered: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: LearningArtifact<"practice">;
  assignmentId: string;
  captureId: string;
  onCompleted?: (result: AssignmentTutorCompletion) => void;
  onFreshCheckRequired?: (reason: AssignmentTutorFreshCheckReason) => void | Promise<void>;
}

export type AssignmentTutorFreshCheckReason =
  | "challenge_unavailable"
  | "practice_artifact_stale"
  | "practice_source_changed";

type TutorProblem = PracticePayload["problems"][number];

const STAGE_PROGRESS: Record<AssignmentTutorState["stage"], number> = {
  hint: 5,
  walkthrough: 20,
  "original-attempt": 40,
  "original-feedback": 55,
  "transfer-attempt": 70,
  "transfer-feedback": 85,
  saving: 95,
  "save-error": 85,
  done: 100,
};

export function AssignmentTutorRunner({
  open,
  onOpenChange,
  artifact,
  assignmentId,
  captureId,
  onCompleted,
  onFreshCheckRequired,
}: Props) {
  const problem = (artifact.payload as PracticePayload).problems?.[0];
  const context = useMemo<AssignmentTutorStateContext>(() => ({
    artifactId: artifact.id,
    assignmentId,
    captureId,
    problemId: problem?.id ?? "",
    originalChoiceCount: problem?.original.choices.length ?? 0,
    transferChoiceCount: problem?.transfer.choices.length ?? 0,
  }), [artifact.id, assignmentId, captureId, problem]);
  const contextKey = useMemo(() => [
    context.artifactId,
    context.assignmentId,
    context.captureId,
    context.problemId,
    context.originalChoiceCount,
    context.transferChoiceCount,
  ].join("\u0000"), [context]);

  const restoreOrStart = useCallback(() => {
    const restored = readAssignmentTutorState(context);
    // A reload can happen after the request started but before its response.
    // Return to the explicit save button; its idempotent attempt id is kept.
    if (restored?.stage === "saving") {
      return assignmentTutorReducer(restored, { type: "save-failed" });
    }
    if (restored?.stage === "done") {
      return createAssignmentTutorState(context);
    }
    return restored ?? createAssignmentTutorState(context);
  }, [context]);

  const [state, setState] = useState<AssignmentTutorState>(() => restoreOrStart());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [freshCheckReason, setFreshCheckReason] = useState<AssignmentTutorFreshCheckReason | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [readinessDelta, setReadinessDelta] = useState<number | null>(null);
  const hydratedKeyRef = useRef(open ? contextKey : null);
  const stageRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);

  const act = useCallback((action: Parameters<typeof assignmentTutorReducer>[1]) => {
    setState((current) => assignmentTutorReducer(current, action));
  }, []);

  useEffect(() => {
    if (!open || hydratedKeyRef.current === contextKey) return;
    setState(restoreOrStart());
    setSaveError(null);
    setFreshCheckReason(null);
    setReadiness(null);
    setReadinessDelta(null);
    setExitConfirmOpen(false);
    savingRef.current = false;
    hydratedKeyRef.current = contextKey;
  }, [contextKey, open, restoreOrStart]);

  useEffect(() => {
    if (!open || !problem || hydratedKeyRef.current !== contextKey || state.stage === "done") return;
    writeAssignmentTutorState(state);
  }, [contextKey, open, problem, state]);

  useEffect(() => {
    if (open) stageRef.current?.focus();
  }, [open, state.stage]);

  useEffect(() => {
    if (open && !problem) onOpenChange(false);
  }, [onOpenChange, open, problem]);

  useEffect(() => () => {
    const controller = saveAbortRef.current;
    saveAbortRef.current = null;
    controller?.abort();
    savingRef.current = false;
  }, []);

  if (!problem) return null;

  const originalCorrect = state.originalSelection === problem.original.answerIndex;
  const transferCorrect = state.transferSelection === problem.transfer.answerIndex;
  const firstTransferCorrect = state.firstTransferSelection === problem.transfer.answerIndex;
  const recovered = state.firstTransferSelection !== null && !firstTransferCorrect && transferCorrect;
  const hasProgress = state.helpUsed.length > 0
    || state.originalSelection !== null
    || state.transferSelection !== null
    || state.stage !== "hint";

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && state.stage === "saving") {
      // A slow mobile request must never trap the student. Preserve the exact
      // locked payload, cancel this network wait, then use the normal exit
      // confirmation. Reopening offers an idempotent replay only.
      const paused = assignmentTutorReducer(state, { type: "save-failed" });
      writeAssignmentTutorState(paused);
      setState(paused);
      savingRef.current = false;
      const controller = saveAbortRef.current;
      saveAbortRef.current = null;
      controller?.abort();
      setExitConfirmOpen(true);
      return;
    }
    if (!nextOpen && state.stage !== "done" && hasProgress) {
      setExitConfirmOpen(true);
      return;
    }
    if (!nextOpen && state.stage === "done") {
      hydratedKeyRef.current = null;
      savingRef.current = false;
    }
    onOpenChange(nextOpen);
  };

  const saveTransferResult = async () => {
    if (!["transfer-attempt", "save-error"].includes(state.stage)
      || state.transferSelection === null
      || state.confidence === null
      || savingRef.current) {
      return;
    }
    const feedbackState = state.stage === "transfer-attempt"
      ? assignmentTutorReducer(state, { type: "check-transfer" })
      : state;
    if (feedbackState.stage !== "transfer-feedback" && feedbackState.stage !== "save-error") return;
    if (feedbackState.resultOutcome !== null) {
      // The first independent check already owns mastery. A later retry is
      // useful practice, but never another result write.
      setState(feedbackState);
      return;
    }
    const durationSeconds = feedbackState.submissionDurationSeconds ?? Math.min(
      86_400,
      Math.max(1, Math.round((Date.now() - feedbackState.startedAt) / 1000)),
    );
    const savingState = assignmentTutorReducer(feedbackState, {
      type: "start-saving",
      durationSeconds,
    });
    if (savingState.stage !== "saving") return;
    const result = {
      attemptId: savingState.attemptId,
      artifactId: artifact.id,
      selectedIndex: savingState.transferSelection!,
      confidence: savingState.confidence!,
      firstSelectedIndex: savingState.firstTransferSelection!,
      firstConfidence: savingState.firstTransferConfidence!,
      durationSeconds: savingState.submissionDurationSeconds!,
    };

    setSaveError(null);
    setFreshCheckReason(null);
    savingRef.current = true;
    // Persist before the first network byte. If the browser loses the response,
    // a reload can replay this same attempt and body without changing answers.
    writeAssignmentTutorState(savingState);
    setState(savingState);
    const controller = new AbortController();
    saveAbortRef.current = controller;
    try {
      const { data, error } = await invokeEdgeFunction("record-study-result", {
        body: result,
        controller,
      });
      if (error) throw error;
      const response = data as {
        ok?: unknown;
        outcome?: unknown;
        alreadyRecorded?: unknown;
        sessionId?: unknown;
        readiness?: unknown;
        readinessDelta?: unknown;
      } | null;
      if (response?.ok === true
          && response.outcome === "already-recorded"
          && response.alreadyRecorded === true) {
        savingRef.current = false;
        if (saveAbortRef.current === controller) saveAbortRef.current = null;
        setReadiness(null);
        setReadinessDelta(null);
        act({ type: "already-recorded" });
        return;
      }
      if (response?.ok !== true || typeof response.sessionId !== "string") {
        throw new Error("The saved tutor result could not be confirmed.");
      }

      const nextReadiness = typeof response.readiness === "number" ? response.readiness : null;
      const nextReadinessDelta = typeof response.readinessDelta === "number"
        ? response.readinessDelta
        : null;
      savingRef.current = false;
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
      setReadiness(nextReadiness);
      setReadinessDelta(nextReadinessDelta);
      act({ type: "saved" });
      window.dispatchEvent(new CustomEvent("coach:refresh"));
      onCompleted?.({
        readiness: nextReadiness,
        readinessDelta: nextReadinessDelta,
        correct: savingState.firstTransferSelection === problem.transfer.answerIndex,
        recovered: savingState.firstTransferSelection !== problem.transfer.answerIndex
          && savingState.transferSelection === problem.transfer.answerIndex,
      });
    } catch (error) {
      // Closing/unmounting intentionally aborts this wait after writing the
      // replay-safe snapshot; do not surface a toast behind a closed dialog.
      if (controller.signal.aborted && saveAbortRef.current !== controller) return;
      const failure = await readFunctionErrorDetails(error);
      const terminalReason = isFreshCheckReason(failure.reason) && failure.retryable !== true
        ? failure.reason
        : null;
      savingRef.current = false;
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
      act({ type: "save-failed" });
      if (terminalReason) {
        setFreshCheckReason(terminalReason);
        setSaveError(terminalReason === "practice_source_changed"
          ? "The confirmed assignment problem changed. Build a new check from the latest version."
          : "This check can’t be recorded anymore. Build a fresh check to continue safely.");
        toast.error("This check needs to be rebuilt before it can count.");
      } else {
        setFreshCheckReason(null);
        setSaveError("Your answer is still here. Try checking again.");
        toast.error(`Couldn't save your result: ${failure.message}`);
      }
    }
  };

  const buildFreshCheck = () => {
    if (!freshCheckReason) return;
    const reason = freshCheckReason;
    clearAssignmentTutorState(state);
    hydratedKeyRef.current = null;
    setFreshCheckReason(null);
    onOpenChange(false);
    void Promise.resolve(onFreshCheckRequired?.(reason)).catch(() => {
      toast.error("The fresh check could not be built yet. Try again from Assignment Tutor.");
    });
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] min-w-0 max-h-[calc(100dvh_-_1rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md sm:p-6 gap-3">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display">
            {state.stage === "done"
              ? state.resultOutcome === "already-recorded" ? "Practice complete" : "Practice saved"
              : "Assignment help"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {state.stage === "done"
              ? state.resultOutcome === "already-recorded"
                ? "This exact challenge was already part of your concept memory."
                : "Your independent try was saved to concept memory."
              : "Learn the method, solve your problem, then prove it on a new one."}
          </DialogDescription>
        </DialogHeader>

        <p role="status" aria-live="polite" className="sr-only">
          {state.stage === "saving"
            ? "Saving result"
            : state.stage === "done"
              ? "Assignment tutor result saved"
              : stageAnnouncement(state.stage)}
        </p>

        <Progress
          value={STAGE_PROGRESS[state.stage]}
          aria-label="Assignment help progress"
          className="h-1"
        />

        <div
          ref={stageRef}
          tabIndex={-1}
          data-testid="assignment-tutor-stage"
          role={isFeedbackStage(state.stage) ? "status" : undefined}
          aria-live={isFeedbackStage(state.stage) ? "polite" : undefined}
          className="min-w-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {state.stage === "hint" && (
            <HintStage
              problem={problem}
              revealed={state.helpUsed.includes("hint")}
              onReveal={() => act({ type: "use-hint" })}
              onContinue={() => act({ type: "show-walkthrough" })}
            />
          )}

          {state.stage === "walkthrough" && (
            <WalkthroughStage
              problem={problem}
              onContinue={() => act({ type: "start-original-attempt" })}
            />
          )}

          {state.stage === "original-attempt" && (
            <AttemptStage
              eyebrow="Your assignment problem"
              prompt={problem.original.prompt}
              choices={problem.original.choices}
              selection={state.originalSelection}
              onSelect={(index) => act({ type: "select-original", index })}
              actionLabel="Check my answer"
              onCheck={() => act({ type: "check-original" })}
            />
          )}

          {state.stage === "original-feedback" && (
            <FeedbackStage
              correct={originalCorrect}
              choices={problem.original.choices}
              selectedIndex={state.originalSelection!}
              answerIndex={problem.original.answerIndex}
              rationale={problem.original.rationale}
              title="Your assignment try"
            >
              <Button className="w-full" onClick={() => act({ type: "start-transfer-attempt" })}>
                Try a new problem
              </Button>
            </FeedbackStage>
          )}

          {state.stage === "transfer-attempt" && (
            <AttemptStage
              eyebrow={state.helpUsed.includes("transfer-retry") ? "Try again from memory" : "Now prove it"}
              prompt={problem.transfer.prompt}
              choices={problem.transfer.choices}
              selection={state.transferSelection}
              onSelect={(index) => act({ type: "select-transfer", index })}
              confidence={state.confidence}
              onConfidence={(confidence) => act({ type: "set-confidence", confidence })}
              actionLabel="Check answer"
              onCheck={() => { void saveTransferResult(); }}
            />
          )}

          {state.stage === "transfer-feedback" && (
            <div className="space-y-3">
              {state.resultOutcome === "already-recorded" && (
                <div role="status" className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  This exact practice challenge already counted toward readiness. Your current answer is shown for feedback, but no score was added again.
                </div>
              )}
              <FeedbackStage
                correct={transferCorrect}
                choices={problem.transfer.choices}
                selectedIndex={state.transferSelection!}
                answerIndex={problem.transfer.answerIndex}
                rationale={problem.transfer.rationale}
                title="Independent check"
              >
                {!transferCorrect && state.resultOutcome !== null && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSaveError(null);
                      act({ type: "retry-transfer" });
                    }}
                  >
                    Try this problem again
                  </Button>
                )}
                <Button className="w-full" onClick={() => {
                  clearAssignmentTutorState(state);
                  act({ type: "finish" });
                }}>
                  {transferCorrect ? "Finish" : "Finish for now"}
                </Button>
              </FeedbackStage>
            </div>
          )}

          {state.stage === "saving" && (
            <div className="rounded-2xl border border-border/60 p-6 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-foreground">Checking and saving your independent try…</p>
            </div>
          )}

          {state.stage === "save-error" && (
            <div className="space-y-4 rounded-2xl border border-warning/30 bg-warning/5 p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">We couldn't confirm your check yet</p>
                <p role="alert" className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {saveError ?? "Your answer is still here. Try checking again."}
                </p>
              </div>
              <Button
                className="w-full"
                onClick={freshCheckReason ? buildFreshCheck : () => { void saveTransferResult(); }}
              >
                {freshCheckReason ? "Build a new check" : "Try checking again"}
              </Button>
            </div>
          )}

          {state.stage === "done" && (
            <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
              <Check className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
              <p className="text-base font-semibold text-foreground">
                {state.resultOutcome === "already-recorded" ? "Already counted" : "Result saved"}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {state.resultOutcome === "already-recorded"
                  ? "You completed the check, but this exact challenge did not change readiness a second time."
                  : transferCorrect
                  ? recovered
                    ? "You recovered after a miss. The first miss stays in your learning record so it can return before the test."
                    : "You solved the changed problem independently."
                  : "We saved this as something to practice again before the test."}
              </p>
              {readiness !== null && (
                <p className="text-sm text-foreground">
                  {readinessDelta !== null && readinessDelta > 0
                    ? `Readiness +${Math.round(readinessDelta)} points · now ${Math.round(readiness)}%.`
                    : `Readiness is now ${Math.round(readiness)}%.`}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {state.stage === "done" ? (
            <Button className="w-full" onClick={() => requestOpenChange(false)}>Done</Button>
          ) : (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => requestOpenChange(false)}
            >
              {state.stage === "saving" ? "Stop saving and leave" : "End help session"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
        <AlertDialogContent className="w-[calc(100vw_-_2rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Leave assignment help?</AlertDialogTitle>
            <AlertDialogDescription>
              {state.resultOutcome === "already-recorded"
                ? "This exact challenge was already counted. Your place in the explanation will remain in this tab."
                : state.resultSaved
                ? "Your independent result is saved. Your place in the explanation will remain in this tab."
                : "Your place is saved in this tab, but the independent result has not been added to readiness yet."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setExitConfirmOpen(false);
                onOpenChange(false);
              }}
            >
              Leave session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function isFreshCheckReason(value: string | null): value is AssignmentTutorFreshCheckReason {
  return value === "challenge_unavailable"
    || value === "practice_artifact_stale"
    || value === "practice_source_changed";
}

function HintStage({
  problem,
  revealed,
  onReveal,
  onContinue,
}: {
  problem: TutorProblem;
  revealed: boolean;
  onReveal: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <PromptCard eyebrow="Your assignment problem" prompt={problem.original.prompt} />
      {revealed ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> Hint
          </p>
          <p className="mt-2 break-words text-sm leading-relaxed text-foreground">
            {cleanStudyText(problem.hint)}
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Start with one next-step hint. It will point you in the right direction without giving away your answer.
        </p>
      )}
      <Button className="w-full" onClick={revealed ? onContinue : onReveal}>
        {revealed ? "See a worked example" : "Give me a hint"}
      </Button>
    </div>
  );
}

function WalkthroughStage({ problem, onContinue }: { problem: TutorProblem; onContinue: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          Worked example · different problem
        </p>
        <p className="mt-2 break-words text-base leading-relaxed text-foreground">
          {cleanStudyText(problem.walkthrough.prompt)}
        </p>
        <ol className="mt-4 space-y-2 border-t border-border/50 pt-4">
          {problem.walkthrough.steps.map((step, index) => (
            <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-primary">{index + 1}.</span>
              <span className="min-w-0 break-words">{cleanStudyText(step)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground">
          Example answer: {cleanStudyText(problem.walkthrough.answer)}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        That example used different values. Now apply the same method to your assignment.
      </p>
      <Button className="w-full" onClick={onContinue}>Now I’ll try mine</Button>
    </div>
  );
}

function AttemptStage({
  eyebrow,
  prompt,
  choices,
  selection,
  onSelect,
  confidence,
  onConfidence,
  actionLabel,
  onCheck,
}: {
  eyebrow: string;
  prompt: string;
  choices: string[];
  selection: number | null;
  onSelect: (index: number) => void;
  confidence?: AssignmentTutorConfidence | null;
  onConfidence?: (confidence: AssignmentTutorConfidence) => void;
  actionLabel: string;
  onCheck: () => void;
}) {
  return (
    <div className="space-y-4">
      <PromptCard eyebrow={eyebrow} prompt={prompt} />
      <ChoiceList choices={choices} selection={selection} onSelect={onSelect} />
      {onConfidence && (
        <ConfidencePicker value={confidence ?? null} onChange={onConfidence} />
      )}
      <Button
        className="w-full"
        disabled={selection === null || (onConfidence ? confidence === null : false)}
        onClick={onCheck}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function FeedbackStage({
  correct,
  choices,
  selectedIndex,
  answerIndex,
  rationale,
  title,
  children,
}: {
  correct: boolean;
  choices: string[];
  selectedIndex: number;
  answerIndex: number;
  rationale: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{title}</p>
        <p className="mt-2 flex items-center gap-2 text-base font-semibold text-foreground">
          {correct
            ? <Check className="h-5 w-5 text-primary" aria-hidden="true" />
            : <X className="h-5 w-5 text-destructive" aria-hidden="true" />}
          {correct ? "Correct." : `Not quite. Correct answer: ${cleanStudyText(choices[answerIndex])}`}
        </p>
        <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
          {cleanStudyText(rationale)}
        </p>
      </div>
      <ChoiceList
        choices={choices}
        selection={selectedIndex}
        onSelect={() => undefined}
        revealed
        answerIndex={answerIndex}
      />
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PromptCard({ eyebrow, prompt }: { eyebrow: string; prompt: string }) {
  return (
    <div className="rounded-2xl border border-border/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <p className="mt-2 break-words text-base leading-relaxed text-foreground">
        {cleanStudyText(prompt)}
      </p>
    </div>
  );
}

function ChoiceList({
  choices,
  selection,
  onSelect,
  revealed = false,
  answerIndex,
}: {
  choices: string[];
  selection: number | null;
  onSelect: (index: number) => void;
  revealed?: boolean;
  answerIndex?: number;
}) {
  return (
    <div className="space-y-2" role="group" aria-label="Answer choices">
      {choices.map((choice, index) => {
        const selected = index === selection;
        const answer = revealed && index === answerIndex;
        const classes = revealed
          ? answer
            ? "border-primary/60 bg-primary/10 text-foreground"
            : selected
              ? "border-destructive/60 bg-destructive/10 text-foreground"
              : "border-border/40 text-muted-foreground"
          : selected
            ? "border-primary/60 bg-primary/10 text-foreground"
            : "border-border/50 text-foreground hover:border-primary/40";
        const outcome = answer
          ? selected ? "Correct · your answer" : "Correct answer"
          : revealed && selected ? "Your answer" : null;
        return (
          <button
            key={`${index}-${choice}`}
            type="button"
            disabled={revealed}
            aria-pressed={!revealed ? selected : undefined}
            aria-label={outcome ? `${cleanStudyText(choice)} · ${outcome}` : cleanStudyText(choice)}
            onClick={() => onSelect(index)}
            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${classes}`}
          >
            <span className="min-w-0 break-words">{cleanStudyText(choice)}</span>
            {outcome && (
              <span className={`shrink-0 text-xs font-semibold ${answer ? "text-primary" : "text-destructive"}`}>
                {outcome}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ConfidencePicker({
  value,
  onChange,
}: {
  value: AssignmentTutorConfidence | null;
  onChange: (confidence: AssignmentTutorConfidence) => void;
}) {
  const options: Array<{ id: AssignmentTutorConfidence; label: string }> = [
    { id: "low", label: "Guessing" },
    { id: "medium", label: "Somewhat sure" },
    { id: "high", label: "Very sure" },
  ];
  return (
    <div className="space-y-2" role="group" aria-label="How sure are you before checking?">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        How sure are you before checking?
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={`min-h-11 rounded-xl border px-2 text-xs font-medium transition-colors ${
              value === option.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function isFeedbackStage(stage: AssignmentTutorState["stage"]) {
  return stage === "original-feedback" || stage === "transfer-feedback" || stage === "done";
}

function stageAnnouncement(stage: AssignmentTutorState["stage"]) {
  switch (stage) {
    case "hint": return "Hint";
    case "walkthrough": return "Worked example";
    case "original-attempt": return "Your assignment attempt";
    case "original-feedback": return "Assignment attempt feedback";
    case "transfer-attempt": return "Independent check";
    case "transfer-feedback": return "Independent check feedback";
    case "saving": return "Saving result";
    case "save-error": return "Result save needs attention";
    case "done": return "Assignment tutor result saved";
  }
}
