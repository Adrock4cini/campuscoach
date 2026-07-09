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

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  const [startedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const total = items.length;
  const isLast = idx >= total - 1;

  const record = async (wasCorrect: boolean) => {
    if (wasCorrect) setCorrect((c) => c + 1);
    else setIncorrect((c) => c + 1);
    if (isLast) {
      await finish(wasCorrect ? correct + 1 : correct, wasCorrect ? incorrect : incorrect + 1);
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
      setPicked(null);
    }
  };

  const finish = async (finalCorrect: number, _finalIncorrect: number) => {
    setSubmitting(true);
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const { data, error } = await supabase.functions.invoke("record-study-result", {
      body: {
        artifactId: artifact.id,
        correct: finalCorrect,
        total,
        durationSeconds,
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Couldn't save results: ${error.message}`);
      return;
    }
    setDone(true);
    const r = data as { readiness?: number };
    onCompleted?.({ readiness: r?.readiness ?? 0, correct: finalCorrect, total });
  };

  const reset = () => {
    setIdx(0); setCorrect(0); setIncorrect(0);
    setFlipped(false); setPicked(null); setDone(false);
  };

  if (!items.length) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {done ? "Session saved" : artifact.kind === "flashcards" ? "Flashcards" : "Multiple choice"}
          </DialogTitle>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{idx + 1} / {total}</span>
              <span>{correct} correct · {incorrect} missed</span>
            </div>
            <Progress value={((idx) / total) * 100} className="h-1" />

            {artifact.kind === "flashcards" ? (
              (() => {
                const card = (artifact.payload as FlashcardsPayload).cards[idx];
                return (
                  <div>
                    <button
                      onClick={() => setFlipped((f) => !f)}
                      className="w-full min-h-40 rounded-2xl border border-border/60 p-6 text-left hover:border-primary/40 transition-colors"
                    >
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        {flipped ? "Answer" : "Prompt"} — tap to flip
                      </p>
                      <p className="text-base text-foreground">
                        {flipped ? card.back : card.front}
                      </p>
                    </button>
                    <div className="grid grid-cols-2 gap-2 pt-3">
                      <Button variant="outline" onClick={() => record(false)} disabled={!flipped}>
                        <X className="h-4 w-4 mr-1.5" /> Missed
                      </Button>
                      <Button onClick={() => record(true)} disabled={!flipped}>
                        <Check className="h-4 w-4 mr-1.5" /> Got it
                      </Button>
                    </div>
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
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
