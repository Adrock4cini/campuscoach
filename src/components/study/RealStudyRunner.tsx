/**
 * RealStudyRunner — grounded flashcard / multiple-choice retrieval practice.
 *
 * Confidence is captured before feedback. A first-attempt miss returns once
 * near the end of the session; that recovery teaches, but never rewrites the
 * original score or inflates mastery.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Loader2, RotateCcw } from "lucide-react";
import { MemoryTrickPanel } from "@/components/study/MemoryTrickPanel";
import { recordMemoryTrickFeedback } from "@/lib/learningArtifacts/memoryFeedback";
import type {
  LearningArtifact,
  FlashcardsPayload,
  MultipleChoicePayload,
  StudyScope,
} from "@/lib/learningArtifacts/types";
import type { ConfidenceLevel } from "@/lib/mastery/updateMastery";
import { cleanStudyText, isLongStudyText, retrievalPrompt } from "@/lib/study/studyText";
import {
  clearStudyRunnerState,
  readStudyRunnerState,
  writeStudyRunnerState,
} from "@/lib/study/studyRunnerState";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  artifact: LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice">;
  onCompleted?: (result: {
    readiness: number;
    readinessDelta: number | null;
    correct: number;
    total: number;
  }) => void;
}

interface QueueEntry {
  itemIndex: number;
  recovery: boolean;
}

interface AnswerResult {
  conceptId: string;
  correct: boolean;
  confidence: ConfidenceLevel;
  recovery: boolean;
}

interface PendingFinalResult {
  correct: number;
  incorrect: number;
  results: AnswerResult[];
}

export function RealStudyRunner({ open, onOpenChange, artifact, onCompleted }: Props) {
  const items = useMemo(() => {
    if (artifact.kind === "flashcards") {
      return (artifact.payload as FlashcardsPayload).cards ?? [];
    }
    return (artifact.payload as MultipleChoicePayload).questions ?? [];
  }, [artifact]);

  const [queue, setQueue] = useState<QueueEntry[]>(() => buildInitialQueue(items.length));
  const [position, setPosition] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [mnemonicOpen, setMnemonicOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [readinessDelta, setReadinessDelta] = useState<number | null>(null);
  const [answerResults, setAnswerResults] = useState<AnswerResult[]>([]);
  const [pendingFinal, setPendingFinal] = useState<PendingFinalResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const attemptIdRef = useRef(createStudyAttemptId());
  const feedbackRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);

  const total = items.length;
  const currentEntry = queue[position] ?? { itemIndex: 0, recovery: false };
  const itemIndex = currentEntry.itemIndex;
  const progressTotal = Math.max(1, queue.length);
  const completedSteps = pendingFinal ? queue.length : position;

  useEffect(() => {
    if (!open) return;
    // Returning from another app (or an iOS tab reload) restores the student's
    // exact place instead of restarting the set from card one.
    const restored = readStudyRunnerState({ artifactId: artifact.id, itemCount: items.length });
    setQueue(restored?.queue ?? buildInitialQueue(items.length));
    setPosition(restored?.position ?? 0);
    setCorrect(restored?.correct ?? 0);
    setIncorrect(restored?.incorrect ?? 0);
    setRevealed(restored?.revealed ?? false);
    setPicked(restored?.picked ?? null);
    setConfidence((restored?.confidence as ConfidenceLevel | null) ?? null);
    setMnemonicOpen(restored?.mnemonicOpen ?? false);
    setDone(false);
    setReadiness(null);
    setReadinessDelta(null);
    setAnswerResults([]);
    setPendingFinal(null);
    setSaveError(null);
    setExitConfirmOpen(false);
    setSubmitting(false);
    setStartedAt(Date.now());
    attemptIdRef.current = createStudyAttemptId();
  }, [open, artifact.id, items.length]);

  // Persist only safe, re-derivable progress on every step.
  useEffect(() => {
    if (!open || done) return;
    writeStudyRunnerState({
      artifactId: artifact.id,
      queue,
      position,
      revealed,
      picked,
      confidence,
      correct,
      incorrect,
      mnemonicOpen,
    });
  }, [
    open, done, artifact.id, queue, position, revealed, picked, confidence,
    correct, incorrect, mnemonicOpen,
  ]);


  useEffect(() => {
    if (open && revealed && !pendingFinal) feedbackRef.current?.focus();
  }, [open, pendingFinal, position, revealed]);

  useEffect(() => {
    if (open && !done && !pendingFinal && !revealed) questionRef.current?.focus();
  }, [done, open, pendingFinal, position, revealed]);

  useEffect(() => {
    if (open && pendingFinal) completionRef.current?.focus();
  }, [open, pendingFinal]);

  // Defense in depth: malformed/empty artifacts must close cleanly instead of
  // leaving the parent in a true "studying" state with a null dialog.
  useEffect(() => {
    if (open && items.length === 0) onOpenChange(false);
  }, [items.length, onOpenChange, open]);

  const record = (wasCorrect: boolean) => {
    if (!confidence || pendingFinal) return;

    const conceptId = conceptIdForItem(items[itemIndex], itemIndex, items.length, artifact.concept_ids);
    const result = conceptId
      ? { conceptId, correct: wasCorrect, confidence, recovery: currentEntry.recovery }
      : null;
    const nextResults = result ? [...answerResults, result] : answerResults;
    let nextQueue = queue;

    if (!currentEntry.recovery) {
      if (wasCorrect) setCorrect((value) => value + 1);
      else {
        setIncorrect((value) => value + 1);
        nextQueue = [...queue, { itemIndex, recovery: true }];
        setQueue(nextQueue);
      }
    }
    setAnswerResults(nextResults);

    const isFinalStep = position >= nextQueue.length - 1;
    if (isFinalStep) {
      const finalCorrect = currentEntry.recovery
        ? correct
        : wasCorrect ? correct + 1 : correct;
      setPendingFinal({
        correct: finalCorrect,
        incorrect: Math.max(0, total - finalCorrect),
        results: nextResults,
      });
      return;
    }

    setPosition((value) => value + 1);
    setRevealed(false);
    setPicked(null);
    setConfidence(null);
  };

  const finish = async (
    finalCorrect: number,
    _finalIncorrect: number,
    results: AnswerResult[],
  ) => {
    setSubmitting(true);
    setSaveError(null);
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    try {
      const { data, error } = await supabase.functions.invoke("record-study-result", {
        body: {
          attemptId: attemptIdRef.current,
          artifactId: artifact.id,
          correct: finalCorrect,
          total,
          durationSeconds,
          perConcept: summarizeStudyResults(results),
        },
      });
      if (error) throw error;

      const response = data as {
        ok?: unknown;
        sessionId?: unknown;
        readiness?: unknown;
        readinessDelta?: unknown;
      } | null;
      if (response?.ok !== true || typeof response.sessionId !== "string") {
        throw new Error("The saved session could not be confirmed.");
      }

      setDone(true);
      // Saved work is no longer "in progress"; a resume must not replay it.
      clearStudyRunnerState();
      const nextReadiness = typeof response.readiness === "number" ? response.readiness : null;
      const nextReadinessDelta = typeof response.readinessDelta === "number" ? response.readinessDelta : null;
      setReadiness(nextReadiness);
      setReadinessDelta(nextReadinessDelta);
      window.dispatchEvent(new CustomEvent("coach:refresh"));
      onCompleted?.({
        readiness: nextReadiness ?? 0,
        readinessDelta: nextReadinessDelta,
        correct: finalCorrect,
        total,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again.";
      setSaveError("Your answers are still here. Try saving again.");
      toast.error(`Couldn't save results: ${detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    clearStudyRunnerState();
    setQueue(buildInitialQueue(items.length));
    setPosition(0);
    setMnemonicOpen(false);
    setCorrect(0);
    setIncorrect(0);
    setRevealed(false);
    setPicked(null);
    setConfidence(null);
    setDone(false);
    setReadiness(null);
    setReadinessDelta(null);
    setStartedAt(Date.now());
    setAnswerResults([]);
    setPendingFinal(null);
    setSaveError(null);
    setExitConfirmOpen(false);
    setSubmitting(false);
    attemptIdRef.current = createStudyAttemptId();
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (submitting) return;
    const hasUnsavedAnswers = !done && (answerResults.length > 0 || pendingFinal !== null);
    if (!nextOpen && hasUnsavedAnswers) {
      setExitConfirmOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  if (!items.length) return null;

  const stepLabel = currentEntry.recovery
    ? `Quick retry · ${position + 1} of ${queue.length}`
    : `${position + 1} of ${queue.length}`;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] min-w-0 max-h-[calc(100dvh_-_1rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md sm:p-6 gap-3">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display">
            {done ? "Session saved" : artifact.kind === "flashcards" ? "Flashcards" : "Multiple choice"}
          </DialogTitle>
          {!done && (
            <DialogDescription className="text-xs leading-relaxed">
              {artifact.study_scope_label ? `Reviewing: ${studentScopeLabel(artifact.study_scope_label)}. ` : ""}
              Choose how sure you are before checking. Missed items return once so you can correct them.
            </DialogDescription>
          )}
          {done && <DialogDescription>Your first attempts were saved to concept memory.</DialogDescription>}
        </DialogHeader>
        <p role="status" aria-live="polite" className="sr-only">
          {submitting ? "Saving results" : done ? "Study results saved" : currentEntry.recovery ? "Quick retry" : ""}
        </p>

        {!done ? (
          <div className="space-y-4">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground">
              <span>{stepLabel}</span>
              <span className="min-w-0 text-right break-words">{correct} correct · {incorrect} missed</span>
            </div>
            <Progress value={(completedSteps / progressTotal) * 100} className="h-1" />

            {pendingFinal ? (
              <div
                ref={completionRef}
                role="status"
                aria-live="polite"
                tabIndex={-1}
                className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-sm font-medium text-foreground">Practice complete</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Retries help you learn without changing your first-try score.
                </p>
              </div>
            ) : artifact.kind === "flashcards" ? (
              (() => {
                const card = (artifact.payload as FlashcardsPayload).cards[itemIndex];
                return (
                  <div className="min-w-0 space-y-3">
                    <div
                      ref={revealed ? feedbackRef : questionRef}
                      data-testid={revealed ? "study-feedback" : undefined}
                      role={revealed ? "status" : undefined}
                      aria-live={revealed ? "polite" : undefined}
                      aria-label={!revealed ? `Question ${position + 1}: ${retrievalPrompt(card.front, card.conceptName)}` : undefined}
                      tabIndex={-1}
                      className="w-full min-w-0 min-h-44 overflow-hidden rounded-2xl border border-border/60 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                    >
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        {revealed ? "Answer" : currentEntry.recovery ? "Try again from memory" : "Question"}
                      </p>
                      {revealed && card.conceptName && (
                        <p className="text-[11px] text-primary mb-3">Concept: {card.conceptName}</p>
                      )}
                      <p
                        className={`break-words text-base text-foreground leading-relaxed sm:text-lg${
                          revealed && isLongStudyText(card.back) ? " max-h-56 overflow-y-auto pr-1" : ""
                        }`}
                      >
                        {revealed ? cleanStudyText(card.back) : retrievalPrompt(card.front, card.conceptName)}
                      </p>
                      {!revealed && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Answer in your head or out loud — nothing to type.
                        </p>
                      )}
                      {revealed && card.sourceExcerpt && (
                        <p className="mt-4 break-words border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
                          Source from your notes: “{card.sourceExcerpt}”
                        </p>
                      )}
                    </div>
                    {revealed && card.conceptId && card.conceptName && card.sourceExcerpt
                      && (artifact.client_class_id || artifact.class_id) && (
                      <MemoryTrickPanel
                        defaultOpen={mnemonicOpen}
                        onOpenChange={setMnemonicOpen}
                        conceptId={card.conceptId}
                        conceptName={card.conceptName}
                        exactTarget={card.sourceExcerpt}
                        sourceExcerpt={card.sourceExcerpt}
                        classId={(artifact.client_class_id ?? artifact.class_id)!}
                        captureId={captureIdForArtifact(artifact)}
                        studyScope={studyScopeForArtifact(artifact)}
                        onHelpful={async (feedback) => {
                          const saved = await recordMemoryTrickFeedback({
                            artifactId: feedback.artifactId,
                            conceptId: feedback.conceptId,
                            technique: feedback.technique,
                            helpful: true,
                          });
                          if (saved) toast.success("We’ll use that to choose future memory tricks.");
                        }}
                        onTryAnother={async (feedback) => {
                          await recordMemoryTrickFeedback({
                            artifactId: feedback.artifactId,
                            conceptId: feedback.conceptId,
                            technique: feedback.technique,
                            helpful: false,
                          });
                        }}
                      />
                    )}
                    {!revealed ? (
                      <div className="space-y-3">
                        <ConfidencePicker value={confidence} onChange={setConfidence} />
                        <Button className="w-full" disabled={!confidence} onClick={() => setRevealed(true)}>
                          Reveal answer
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 border-t border-border/50 pt-4 min-[430px]:grid-cols-2">
                        <Button variant="outline" onClick={() => record(false)}>
                          <X className="h-4 w-4 mr-1.5" /> {currentEntry.recovery ? "Still learning" : "Review again"}
                        </Button>
                        <Button onClick={() => record(true)}>
                          <Check className="h-4 w-4 mr-1.5" /> {currentEntry.recovery ? "Got it this time" : "I knew it"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              (() => {
                const question = (artifact.payload as MultipleChoicePayload).questions[itemIndex];
                return (
                  <div
                    ref={revealed ? undefined : questionRef}
                    tabIndex={revealed ? undefined : -1}
                    aria-label={revealed ? undefined : `Question ${position + 1}: ${cleanStudyText(question.prompt)}`}
                    className="space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="break-words text-base text-foreground">{cleanStudyText(question.prompt)}</p>
                    <div className="space-y-2">
                      {question.choices.map((choice, choiceIndex) => {
                        const isPicked = picked === choiceIndex;
                        const isAnswer = choiceIndex === question.answerIndex;
                        const cls = revealed
                          ? isAnswer
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : isPicked
                              ? "border-destructive/60 bg-destructive/10 text-foreground"
                              : "border-border/40 text-muted-foreground"
                          : isPicked
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border/40 text-foreground hover:border-primary/40";
                        return (
                          <button
                            key={choiceIndex}
                            type="button"
                            disabled={revealed}
                            aria-pressed={!revealed ? isPicked : undefined}
                            onClick={() => setPicked(choiceIndex)}
                            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${cls}`}
                          >
                            <span className="min-w-0 break-words">{cleanStudyText(choice)}</span>
                            {revealed && isAnswer && (
                              <span className="shrink-0 text-xs font-semibold text-primary">
                                {isPicked ? "Correct · your answer" : "Correct answer"}
                              </span>
                            )}
                            {revealed && isPicked && !isAnswer && (
                              <span className="shrink-0 text-xs font-semibold text-destructive">Your answer</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {!revealed ? (
                      <div className="space-y-3">
                        <ConfidencePicker value={confidence} onChange={setConfidence} />
                        <div className="flex justify-end">
                          <Button disabled={picked === null || !confidence} onClick={() => setRevealed(true)}>
                            Check answer
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          ref={feedbackRef}
                          data-testid="study-feedback"
                          role="status"
                          aria-live="polite"
                          tabIndex={-1}
                          className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <p className="break-words text-sm font-semibold text-foreground">
                            {picked === question.answerIndex
                              ? "Correct."
                              : `Not quite. Correct answer: ${cleanStudyText(question.choices[question.answerIndex])}`}
                          </p>
                          {question.conceptName && (
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                              Concept: {question.conceptName}
                            </p>
                          )}
                          <p className="break-words text-xs leading-relaxed text-muted-foreground">{cleanStudyText(question.rationale)}</p>
                          {question.sourceExcerpt && (
                            <p className="border-t border-border/40 pt-2 text-xs leading-relaxed text-muted-foreground">
                              Check the source: “{question.sourceExcerpt}”
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={() => record(picked === question.answerIndex)}>
                            {position >= queue.length - 1 && (currentEntry.recovery || picked === question.answerIndex)
                              ? "Finish"
                              : "Next"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            )}

            {submitting && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving results…
              </p>
            )}
            {saveError && !submitting && (
              <p role="alert" className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
                {saveError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-center py-2">
            <p className="text-3xl font-display font-semibold text-primary">
              {Math.round((correct / total) * 100)}%
            </p>
            <p className="text-sm text-muted-foreground">
              {correct} of {total} correct on the first try · Concept memory updated.
            </p>
            {readiness !== null && (
              <p className="text-sm text-foreground">
                {readinessDelta !== null && readinessDelta > 0 ? (
                  <>
                    Readiness <span className="font-semibold text-primary">+{Math.round(readinessDelta)} points</span>
                    {" · now "}<span className="font-semibold text-primary">{Math.round(readiness)}%</span>.
                  </>
                ) : readinessDelta !== null && readinessDelta < 0 ? (
                  <>
                    We found what to review next · readiness is now{" "}
                    <span className="font-semibold text-primary">{Math.round(readiness)}%</span>.
                  </>
                ) : (
                  <>
                    Readiness is <span className="font-semibold text-primary">{Math.round(readiness)}%</span>.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Study again
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : pendingFinal ? (
            <Button
              className="w-full"
              disabled={submitting}
              onClick={() => finish(pendingFinal.correct, pendingFinal.incorrect, pendingFinal.results)}
            >
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {saveError ? "Try saving again" : "Finish session"}
            </Button>
          ) : (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => requestOpenChange(false)} disabled={submitting}>
              End session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
        <AlertDialogContent className="w-[calc(100vw_-_2rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Leave study session?</AlertDialogTitle>
            <AlertDialogDescription>
              Your answers have not been saved. Keep studying to protect your progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep studying</AlertDialogCancel>
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

function ConfidencePicker({
  value,
  onChange,
}: {
  value: ConfidenceLevel | null;
  onChange: (v: ConfidenceLevel) => void;
}) {
  const options: { id: ConfidenceLevel; label: string }[] = [
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

function buildInitialQueue(length: number): QueueEntry[] {
  return Array.from({ length }, (_, itemIndex) => ({ itemIndex, recovery: false }));
}

function conceptIdForItem(
  item: unknown,
  itemIndex: number,
  itemCount: number,
  artifactConceptIds: string[],
) {
  const explicit = item && typeof item === "object" && "conceptId" in item
    ? (item as { conceptId?: unknown }).conceptId
    : undefined;
  if (typeof explicit === "string" && explicit) return explicit;
  if (itemCount === artifactConceptIds.length) return artifactConceptIds[itemIndex];
  if (artifactConceptIds.length === 1) return artifactConceptIds[0];
  return undefined;
}

function studentScopeLabel(label: string) {
  if (label.toLowerCase() === "recent material") return "what you just learned";
  if (label.toLowerCase() === "mixed class review") return "everything in this class";
  return label;
}

function studyScopeForArtifact(artifact: LearningArtifact): StudyScope {
  return {
    type: artifact.study_scope_type,
    id: artifact.study_scope_id,
    label: artifact.study_scope_label ?? "Study set",
    ...(artifact.study_scope_type === "exam" ? { examId: artifact.study_scope_id } : {}),
  };
}

function captureIdForArtifact(artifact: LearningArtifact) {
  if (!artifact.capture_id || artifact.study_scope_type !== "recent") return undefined;
  return artifact.study_scope_id === `capture-${artifact.capture_id}`
    ? artifact.capture_id
    : undefined;
}

function summarizeStudyResults(results: AnswerResult[]) {
  const byConcept = new Map<string, {
    firstAttempts: AnswerResult[];
    recovered: boolean;
  }>();
  for (const result of results) {
    const current = byConcept.get(result.conceptId) ?? { firstAttempts: [], recovered: false };
    if (result.recovery) {
      current.recovered = current.recovered || result.correct;
    } else {
      current.firstAttempts.push(result);
    }
    byConcept.set(result.conceptId, current);
  }
  return [...byConcept].flatMap(([conceptId, score]) => {
    if (!score.firstAttempts.length) return [];
    const correctCount = score.firstAttempts.filter((result) => result.correct).length;
    const correct = correctCount / score.firstAttempts.length >= 0.5;
    return [{
      conceptId,
      correct,
      confidence: aggregateConfidence(score.firstAttempts, correct),
      recovered: !correct && score.recovered,
    }];
  });
}

function aggregateConfidence(results: AnswerResult[], correct: boolean): ConfidenceLevel {
  const rank: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
  const sorted = results.map((result) => result.confidence).sort((a, b) => rank[a] - rank[b]);
  return correct ? sorted[0] ?? "medium" : sorted.at(-1) ?? "medium";
}

function createStudyAttemptId() {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
