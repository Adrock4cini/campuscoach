import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RealMatchingGame } from "@/components/study/RealMatchingGame";
import { supabase } from "@/integrations/supabase/client";
import type { LearningArtifact, MatchingPayload } from "@/lib/learningArtifacts/types";
import type { MatchingCompletionResult } from "@/lib/learningArtifacts/matchingGame";
import type { ConfidenceLevel } from "@/lib/mastery/updateMastery";
import {
  clearMatchingSessionState,
  readMatchingSessionState,
  writeMatchingSessionState,
  type MatchingResultRequestBody,
} from "@/lib/study/matchingSessionState";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: LearningArtifact<"matching">;
  onCompleted?: () => void;
}

export function RealMatchingSession({ open, onOpenChange, artifact, onCompleted }: Props) {
  const artifactPairIdentities = useMemo(
    () => artifact.payload.pairs.map((pair) => ({ id: pair.id, conceptId: pair.conceptId })),
    [artifact.payload.pairs],
  );
  const [completion, setCompletion] = useState<MatchingCompletionResult | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [completionDurationSeconds, setCompletionDurationSeconds] = useState<number | null>(null);
  const attemptId = useRef(createAttemptId());
  const frozenRequestBody = useRef<MatchingResultRequestBody | null>(null);
  const restoredPendingRequest = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!open) return;
    const restored = readMatchingSessionState({
      artifactId: artifact.id,
      pairs: artifactPairIdentities,
    });
    setCompletion(restored?.completion ?? null);
    setConfidence(restored?.confidence ?? null);
    setStarted(Boolean(restored));
    setSaving(false);
    setSaved(false);
    setSaveError(null);
    setExitConfirmOpen(false);
    setStartedAt(Date.now());
    setCompletionDurationSeconds(restored?.durationSeconds ?? null);
    attemptId.current = restored?.attemptId ?? createAttemptId();
    frozenRequestBody.current = restored?.frozenRequestBody ?? null;
    restoredPendingRequest.current = Boolean(restored?.frozenRequestBody);
  }, [artifact.id, artifactPairIdentities, open]);

  const requestOpenChange = (nextOpen: boolean) => {
    if (saving) return;
    if (!nextOpen && started && !saved) {
      setExitConfirmOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const save = async () => {
    if (!completion || !confidence || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Freeze the exact first request before invoking the network. A timeout
      // may mean the server committed even though the response was lost; the
      // retry must therefore reuse byte-for-byte grading inputs and duration.
      const body: MatchingResultRequestBody = frozenRequestBody.current ?? {
        attemptId: attemptId.current,
        artifactId: artifact.id,
        correct: completion.correctFirstAttempt,
        total: completion.total,
        durationSeconds: completionDurationSeconds
          ?? Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        confidence,
        matchingFirstChoices: completion.firstChoices,
        perConcept: completion.perConcept.map((result) => ({
          conceptId: result.conceptId,
          correct: result.firstAttemptCorrect,
          confidence,
          recovered: result.recovered,
        })),
      };
      frozenRequestBody.current = body;
      writeMatchingSessionState({
        artifactId: artifact.id,
        attemptId: attemptId.current,
        confidence,
        durationSeconds: body.durationSeconds,
        completion,
        frozenRequestBody: body,
      });
      const { data, error } = await supabase.functions.invoke("record-study-result", {
        body,
      });
      if (error) throw error;
      const response = data as { ok?: unknown; sessionId?: unknown } | null;
      if (response?.ok !== true || typeof response.sessionId !== "string") {
        throw new Error("The saved session could not be confirmed.");
      }
      setSaved(true);
      clearMatchingSessionState();
      window.dispatchEvent(new CustomEvent("coach:refresh"));
      onCompleted?.();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again.";
      setSaveError("Your matches are still here. Try saving again.");
      toast.error(`Couldn't save Match Lab: ${detail}`);
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = save;

  // A reload after the server committed but before its response restores and
  // retries the exact frozen body once. The stable attempt id makes this a
  // confirmation/repair, never a second grading event.
  useEffect(() => {
    if (!open || !completion || !confidence || !restoredPendingRequest.current) return;
    restoredPendingRequest.current = false;
    void saveRef.current();
  }, [completion, confidence, open]);

  const recordCompletion = (result: MatchingCompletionResult) => {
    if (!confidence) return;
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    setCompletion(result);
    setCompletionDurationSeconds(durationSeconds);
    writeMatchingSessionState({
      artifactId: artifact.id,
      attemptId: attemptId.current,
      confidence,
      durationSeconds,
      completion: result,
      frozenRequestBody: null,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] max-h-[calc(100dvh_-_1rem)] overflow-y-auto overscroll-contain rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-2xl sm:p-6">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="font-display">{saved ? "Match Lab saved" : "Match Lab"}</DialogTitle>
            <DialogDescription>
              Match from memory. First tries set the score; retries help you learn without inflating it.
            </DialogDescription>
          </DialogHeader>
          <p role="status" aria-live="polite" className="sr-only">
            {saving ? "Saving Match Lab results" : saved ? "Match Lab results saved" : ""}
          </p>

          {!started ? (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">
                Before seeing any match feedback, choose how sure you feel about this material.
              </p>
              <div role="group" aria-label="How sure are you before matching?" className="space-y-2">
                <p className="text-sm font-medium text-foreground">How sure are you right now?</p>
                <div className="grid grid-cols-3 gap-2">
                  {MATCH_CONFIDENCE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={confidence === option.id}
                      onClick={() => setConfidence(option.id)}
                      className={`min-h-11 rounded-xl border px-2 text-xs font-medium transition-colors ${
                        confidence === option.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!confidence}
                onClick={() => {
                  setStartedAt(Date.now());
                  setStarted(true);
                }}
              >
                Start matching
              </Button>
            </div>
          ) : completion ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
              <p className="text-2xl font-semibold text-primary">
                {completion.correctFirstAttempt} of {completion.total}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {saved ? "Match Lab result saved" : "matched on the first try"}
              </p>
            </div>
          ) : (
            <RealMatchingGame
              payload={artifact.payload as MatchingPayload}
              allowedConceptIds={artifact.concept_ids}
              onComplete={recordCompletion}
            />
          )}

          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}

          <DialogFooter>
            {saved ? (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            ) : completion ? (
              <Button
                className="w-full sm:w-auto"
                disabled={saving || !confidence}
                onClick={() => { void save(); }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saveError ? "Try saving again" : "Save Match Lab"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
        <AlertDialogContent className="w-[calc(100vw_-_2rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Match Lab?</AlertDialogTitle>
            <AlertDialogDescription>Your matches have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep matching</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setExitConfirmOpen(false);
                clearMatchingSessionState();
                onOpenChange(false);
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function createAttemptId() {
  if (typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

const MATCH_CONFIDENCE_OPTIONS: Array<{ id: ConfidenceLevel; label: string }> = [
  { id: "low", label: "Guessing" },
  { id: "medium", label: "Somewhat sure" },
  { id: "high", label: "Very sure" },
];
