/**
 * RealStudyRunner — minimal in-place study runner for a real
 * `learning_artifacts` row (flashcards or multiple_choice).
 *
 * On finish it calls the `record-study-result` edge function, which
 * writes the study_sessions row, upserts user_concept_mastery for
 * every concept the artifact was built from, and recomputes/inserts
 * readiness_scores. Concepts remain the permanent memory; this UI
 * never edits them directly.
 *
 * Intentionally unstyled beyond the existing tokens — Sprint C is a
 * behavior change, not a UI redesign.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Loader2, RotateCcw } from "lucide-react";
import type {
  LearningArtifact,
  FlashcardsPayload,
  MultipleChoicePayload,
} from "@/lib/learningArtifacts/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  artifact: LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice">;
  onCompleted?: (result: { readiness: number; correct: number; total: number }) => void;
}

interface AnswerResult {
  conceptId: string;
  correct: boolean;
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
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [answerResults, setAnswerResults] = useState<AnswerResult[]>([]);

  const total = items.length;
  const isLast = idx >= total - 1;

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setCorrect(0);
    setIncorrect(0);
    setFlipped(false);
    setPicked(null);
    setDone(false);
    setReadiness(null);
    setAnswerResults([]);
    setStartedAt(Date.now());
  }, [open, artifact.id]);

  const record = async (wasCorrect: boolean) => {
    const item = items[idx] as { conceptId?: string };
    // v2 artifacts carry explicit attribution. This positional fallback
    // keeps existing v1 artifacts useful when they have one item per concept.
    const conceptId = item.conceptId
      ?? (items.length === artifact.concept_ids.length ? artifact.concept_ids[idx] : undefined)
      ?? (artifact.concept_ids.length === 1 ? artifact.concept_ids[0] : undefined);
    const nextResults = conceptId
      ? [...answerResults, { conceptId, correct: wasCorrect }]
      : answerResults;
    setAnswerResults(nextResults);
    if (wasCorrect) setCorrect((c) => c + 1);
    else setIncorrect((c) => c + 1);
    if (isLast) {
      await finish(
        wasCorrect ? correct + 1 : correct,
        wasCorrect ? incorrect : incorrect + 1,
        nextResults,
      );
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
      setPicked(null);
    }
  };

  const finish = async (
    finalCorrect: number,
    _finalIncorrect: number,
    results: AnswerResult[],
  ) => {
    setSubmitting(true);
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const { data, error } = await supabase.functions.invoke("record-study-result", {
      body: {
        artifactId: artifact.id,
        correct: finalCorrect,
        total,
        durationSeconds,
        perConcept: summarizeByConcept(results),
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Couldn't save results: ${error.message}`);
      return;
    }
    setDone(true);
    const r = data as { readiness?: number | null };
    setReadiness(typeof r?.readiness === "number" ? r.readiness : null);
    // Nudge the Dashboard coach to re-rank now that mastery has changed.
    window.dispatchEvent(new CustomEvent("coach:refresh"));
    onCompleted?.({ readiness: r?.readiness ?? 0, correct: finalCorrect, total });
  };

  const reset = () => {
    setIdx(0); setCorrect(0); setIncorrect(0);
    setFlipped(false); setPicked(null); setDone(false);
    setReadiness(null); setStartedAt(Date.now());
    setAnswerResults([]);
  };

  if (!items.length) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] min-w-0 max-h-[calc(100dvh_-_1rem)] overflow-x-hidden overflow-y-auto rounded-3xl p-4 sm:max-w-md sm:p-6 gap-3">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display">
            {done ? "Session saved" : artifact.kind === "flashcards" ? "Flashcards" : "Multiple choice"}
          </DialogTitle>
          {!done && (
            <DialogDescription className="text-xs leading-relaxed">
              {artifact.study_scope_label ? `Target: ${artifact.study_scope_label}. ` : ""}
              Based on {artifact.concept_ids.length} captured concept{artifact.concept_ids.length === 1 ? "" : "s"}. Your answers update mastery and future recommendations.
            </DialogDescription>
          )}
          {done && <DialogDescription>Your answers were saved to concept memory.</DialogDescription>}
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground">
              <span>{idx + 1} / {total}</span>
              <span className="min-w-0 text-right break-words">{correct} correct · {incorrect} missed</span>
            </div>
            <Progress value={((idx + 1) / total) * 100} className="h-1" />

            {artifact.kind === "flashcards" ? (
              (() => {
                const card = (artifact.payload as FlashcardsPayload).cards[idx];
                return (
                  <div className="min-w-0 space-y-3">
                    <button
                      onClick={() => setFlipped((f) => !f)}
                      className="w-full min-w-0 min-h-44 overflow-hidden rounded-2xl border border-border/60 p-4 text-left hover:border-primary/40 transition-colors sm:p-5"
                    >
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        {flipped ? "Answer" : "Question"}
                      </p>
                      {card.conceptName && (
                        <p className="text-[11px] text-primary mb-3">Concept: {card.conceptName}</p>
                      )}
                      <p className="break-words text-base text-foreground leading-relaxed sm:text-lg">
                        {flipped ? card.back : card.front}
                      </p>
                      {card.sourceExcerpt && (
                        <p className="mt-4 break-words border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
                          From your note: “{card.sourceExcerpt}”
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-5">
                        Tap card to {flipped ? "see the question" : "reveal the answer"}
                      </p>
                    </button>
                    {!flipped ? (
                      <Button className="w-full" onClick={() => setFlipped(true)}>
                        Reveal answer
                      </Button>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2">
                        <Button variant="outline" onClick={() => record(false)}>
                          <X className="h-4 w-4 mr-1.5" /> Review again
                        </Button>
                        <Button onClick={() => record(true)}>
                          <Check className="h-4 w-4 mr-1.5" /> I knew it
                        </Button>
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
                            disabled={revealed}
                            onClick={() => setPicked(i)}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-sm ${cls}`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                    {revealed && (
                      <p className="text-xs text-muted-foreground">{q.rationale}</p>
                    )}
                    <div className="flex justify-end">
                      <Button
                        disabled={!revealed}
                        onClick={() => record(picked === q.answerIndex)}
                      >
                        {isLast ? "Finish" : "Next"}
                      </Button>
                    </div>
                  </div>
                );
              })()
            )}

            {submitting && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving results…
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
                Readiness recalculated to <span className="font-semibold text-primary">{Math.round(readiness)}%</span>.
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
          ) : (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => onOpenChange(false)} disabled={submitting}>
              End session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function summarizeByConcept(results: AnswerResult[]) {
  const byConcept = new Map<string, { correct: number; total: number }>();
  for (const result of results) {
    const current = byConcept.get(result.conceptId) ?? { correct: 0, total: 0 };
    current.total += 1;
    if (result.correct) current.correct += 1;
    byConcept.set(result.conceptId, current);
  }
  return [...byConcept].map(([conceptId, score]) => ({
    conceptId,
    correct: score.correct / score.total >= 0.5,
  }));
}
