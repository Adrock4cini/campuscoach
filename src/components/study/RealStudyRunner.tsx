/**
 * RealStudyRunner — real learning_artifacts study runner (flashcards / MCQ).
 * Saves via record-study-result. Confidence rating calibrates mastery priority.
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
import type {
  LearningArtifact,
  FlashcardsPayload,
  MultipleChoicePayload,
} from "@/lib/learningArtifacts/types";
import type { ConfidenceLevel } from "@/lib/mastery/updateMastery";

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

interface AnswerResult {
  conceptId: string;
  correct: boolean;
  confidence: ConfidenceLevel | null;
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

  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
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

  const total = items.length;
  const isLast = idx >= total - 1;
  const completed = pendingFinal ? total : idx;

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setCorrect(0);
    setIncorrect(0);
    setFlipped(false);
    setPicked(null);
    setConfidence(null);
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
  }, [open, artifact.id]);

  const record = async (wasCorrect: boolean) => {
    if (!confidence) return;
    const item = items[idx] as { conceptId?: string };
    const conceptId = item.conceptId
      ?? (items.length === artifact.concept_ids.length ? artifact.concept_ids[idx] : undefined)
      ?? (artifact.concept_ids.length === 1 ? artifact.concept_ids[0] : undefined);
    const nextResults = conceptId
      ? [...answerResults, { conceptId, correct: wasCorrect, confidence }]
      : answerResults;
    setAnswerResults(nextResults);
    if (wasCorrect) setCorrect((c) => c + 1);
    else setIncorrect((c) => c + 1);
    if (isLast) {
      const finalResult = {
        correct: wasCorrect ? correct + 1 : correct,
        incorrect: wasCorrect ? incorrect : incorrect + 1,
        results: nextResults,
      };
      setPendingFinal(finalResult);
      if (artifact.kind !== "flashcards") {
        await finish(finalResult.correct, finalResult.incorrect, finalResult.results);
      }
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
      setPicked(null);
      setConfidence(null);
    }
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
          perConcept: summarizeByConcept(results),
        },
      });
      if (error) throw error;

      setDone(true);
      const r = data as { readiness?: number | null; readinessDelta?: number | null };
      setReadiness(typeof r?.readiness === "number" ? r.readiness : null);
      setReadinessDelta(typeof r?.readinessDelta === "number" ? r.readinessDelta : null);
      window.dispatchEvent(new CustomEvent("coach:refresh"));
      onCompleted?.({
        readiness: r?.readiness ?? 0,
        readinessDelta: r?.readinessDelta ?? null,
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
    setIdx(0); setCorrect(0); setIncorrect(0);
    setFlipped(false); setPicked(null); setConfidence(null); setDone(false);
    setReadiness(null); setReadinessDelta(null); setStartedAt(Date.now());
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

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] min-w-0 max-h-[calc(100dvh_-_1rem)] overflow-x-hidden overflow-y-auto rounded-3xl p-4 sm:max-w-md sm:p-6 gap-3">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display">
            {done ? "Session saved" : artifact.kind === "flashcards" ? "Flashcards" : "Multiple choice"}
          </DialogTitle>
          {!done && (
            <DialogDescription className="text-xs leading-relaxed">
              {artifact.study_scope_label ? `Reviewing: ${studentScopeLabel(artifact.study_scope_label)}. ` : ""}
              Answer from memory first, then rate how sure you were. Results guide what to review next.
            </DialogDescription>
          )}
          {done && <DialogDescription>Your answers were saved to concept memory.</DialogDescription>}
        </DialogHeader>
        <p role="status" aria-live="polite" className="sr-only">
          {submitting ? "Saving results" : done ? "Study results saved" : ""}
        </p>

        {!done ? (
          <div className="space-y-4">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground">
              <span>{idx + 1} / {total}</span>
              <span className="min-w-0 text-right break-words">{correct} correct · {incorrect} missed</span>
            </div>
            <Progress value={(completed / total) * 100} className="h-1" />

            {artifact.kind === "flashcards" ? (
              (() => {
                const card = (artifact.payload as FlashcardsPayload).cards[idx];
                return (
                  <div className="min-w-0 space-y-3">
                    <button
                      type="button"
                      onClick={() => { if (!flipped) setFlipped(true); }}
                      className="w-full min-w-0 min-h-44 overflow-hidden rounded-2xl border border-border/60 p-4 text-left hover:border-primary/40 transition-colors sm:p-5"
                    >
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        {flipped ? "Answer" : "Question"}
                      </p>
                      {flipped && card.conceptName && (
                        <p className="text-[11px] text-primary mb-3">Concept: {card.conceptName}</p>
                      )}
                      <p className="break-words text-base text-foreground leading-relaxed sm:text-lg">
                        {flipped ? card.back : card.front}
                      </p>
                      {flipped && card.sourceExcerpt && (
                        <p className="mt-4 break-words border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
                          Source from your notes: “{card.sourceExcerpt}”
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-5">
                        {flipped ? "Rate your confidence, then how you did" : "Tap card or Reveal to see the answer"}
                      </p>
                    </button>
                    {pendingFinal ? (
                      <p className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-center text-sm text-foreground">
                        Last card rated. Finish to save your progress.
                      </p>
                    ) : !flipped ? (
                      <Button className="w-full" onClick={() => setFlipped(true)}>Reveal answer</Button>
                    ) : (
                      <div className="space-y-3">
                        <ConfidencePicker value={confidence} onChange={setConfidence} />
                        <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2">
                          <Button variant="outline" disabled={!confidence} onClick={() => void record(false)}>
                            <X className="h-4 w-4 mr-1.5" /> Review again
                          </Button>
                          <Button disabled={!confidence} onClick={() => void record(true)}>
                            <Check className="h-4 w-4 mr-1.5" /> I knew it
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              (() => {
                const q = (artifact.payload as MultipleChoicePayload).questions[idx];
                const revealed = picked !== null;
                return (
                  <div className="space-y-3">
                    <p className="text-base text-foreground">{q.prompt}</p>
                    <div className="space-y-2">
                      {q.choices.map((choice, i) => {
                        const isPicked = picked === i;
                        const isAnswer = i === q.answerIndex;
                        const cls = revealed
                          ? isAnswer
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : isPicked
                              ? "border-destructive/60 bg-destructive/10 text-foreground"
                              : "border-border/40 text-muted-foreground"
                          : "border-border/40 text-foreground hover:border-primary/40";
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={revealed}
                            onClick={() => setPicked(i)}
                            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${cls}`}
                          >
                            <span>{choice}</span>
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
                    {revealed && (
                      <>
                        <p className="text-xs text-muted-foreground">{q.rationale}</p>
                        <ConfidencePicker value={confidence} onChange={setConfidence} />
                      </>
                    )}
                    {!pendingFinal && (
                      <div className="flex justify-end">
                        <Button
                          disabled={!revealed || !confidence}
                          onClick={() => void record(picked === q.answerIndex)}
                        >
                          {isLast ? "Finish" : "Next"}
                        </Button>
                      </div>
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
              {correct} of {total} correct · Concept memory updated.
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
          ) : isLast ? null : (
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
    <div className="space-y-2" role="group" aria-label="How sure were you?">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        How sure were you before checking?
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={value === opt.id}
            className={`min-h-11 rounded-xl border px-2 text-xs font-medium transition-colors ${
              value === opt.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function studentScopeLabel(label: string) {
  if (label.toLowerCase() === "recent material") return "what you just learned";
  if (label.toLowerCase() === "mixed class review") return "everything in this class";
  return label;
}

function summarizeByConcept(results: AnswerResult[]) {
  const byConcept = new Map<string, { correct: number; total: number; highWrong: number }>();
  for (const result of results) {
    const current = byConcept.get(result.conceptId) ?? { correct: 0, total: 0, highWrong: 0 };
    current.total += 1;
    if (result.correct) current.correct += 1;
    if (!result.correct && result.confidence === "high") current.highWrong += 1;
    byConcept.set(result.conceptId, current);
  }
  return [...byConcept].map(([conceptId, score]) => ({
    conceptId,
    correct: score.correct / score.total >= 0.5,
    confidentlyWrong: score.highWrong > 0,
  }));
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
