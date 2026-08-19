import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Sparkles, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  memoryTrickBoundaryKey,
  parseMemoryTrickArtifact,
  type MemoryTrickBoundary,
  type MemoryTrickContent,
} from "@/lib/learningArtifacts/memoryTrick";
import type { StudyScope } from "@/lib/learningArtifacts/types";
import { useLearningArtifact } from "@/lib/learningArtifacts/useLearningArtifact";
import {
  canReadAloud,
  contextualStudentActions,
  readAloud,
  strategyIdForTechnique,
} from "@/lib/study/strategyToolbox";
import {
  recordStrategyFeedbackOutcome,
  useStrategyEvidence,
} from "@/lib/study/strategyEvidence";
import { evidenceAdjustment, evidenceNote } from "@/lib/study/strategyEvidence";

export interface MemoryTrickFeedbackContext {
  artifactId: string;
  conceptId: string;
  classId: string;
  studyScope: StudyScope;
  origin: MemoryTrickContent["origin"];
  technique: MemoryTrickContent["technique"];
}

export interface MemoryTrickPanelProps extends MemoryTrickBoundary {
  onHelpful?: (context: MemoryTrickFeedbackContext) => void | Promise<void>;
  onTryAnother?: (context: MemoryTrickFeedbackContext) => void | Promise<void>;
  /** Subject family of the class, used only to scope learned evidence. */
  subjectProfileId?: string;
}

/**
 * A deliberately lazy disclosure. Keeping the hook below the closed gate means
 * merely rendering a flashcard or question never reads from Supabase.
 */
export function MemoryTrickPanel(props: MemoryTrickPanelProps) {
  return <ScopedMemoryTrickPanel key={memoryTrickBoundaryKey(props)} {...props} />;
}

function ScopedMemoryTrickPanel(props: MemoryTrickPanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headingId = `${panelId}-heading`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <div className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) {
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          } else {
            setOpen(true);
          }
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Make it stick
        {open
          ? <ChevronUp className="h-4 w-4" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          tabIndex={-1}
          className="mt-2 min-w-0 space-y-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
        >
          <h3 id={headingId} className="sr-only">Memory trick for {props.conceptName}</h3>
          <MemoryTrickLoader {...props} />
        </div>
      )}
    </div>
  );
}

function MemoryTrickLoader(props: MemoryTrickPanelProps) {
  const requestedGeneration = useRef(false);
  const scope = useMemo(() => ({
    classId: props.classId,
    captureId: props.captureId,
    conceptIds: [props.conceptId],
    topic: props.conceptName,
    studyScope: props.studyScope,
  }), [props.captureId, props.classId, props.conceptId, props.conceptName, props.studyScope]);
  const { artifact, loading, generating, error, generate, reload } =
    useLearningArtifact("mnemonic", scope);
  const trick = useMemo(
    () => artifact ? parseMemoryTrickArtifact(artifact, props) : null,
    [artifact, props],
  );

  useEffect(() => {
    if (loading || generating || error || artifact || requestedGeneration.current) return;
    requestedGeneration.current = true;
    void generate({ regenerate: false, count: 1 });
  }, [artifact, error, generate, generating, loading]);

  const retry = () => {
    if (loading || generating) return;
    if (artifact) {
      requestedGeneration.current = true;
      void generate({ regenerate: true, count: 1 });
      return;
    }
    if (!requestedGeneration.current) {
      void reload();
      return;
    }
    void generate({ regenerate: false, count: 1 });
  };

  if (loading || generating || (!error && !artifact && !requestedGeneration.current)) {
    return (
      <p role="status" aria-live="polite" className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {loading ? "Checking for a memory trick…" : "Creating a memory trick from this concept…"}
      </p>
    );
  }

  if (error || !trick) {
    return (
      <div role="alert" aria-live="assertive" className="space-y-3">
        <p className="text-sm text-foreground">
          We couldn’t safely build a memory trick from this material.
        </p>
        <Button type="button" variant="outline" onClick={retry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  return <MemoryTrickResult trick={trick} {...props} generate={generate} />;
}

interface MemoryTrickResultProps extends MemoryTrickPanelProps {
  trick: MemoryTrickContent;
  generate: (options?: { regenerate?: boolean; count?: number; strategyId?: string }) => Promise<unknown>;
}

function MemoryTrickResult({
  trick,
  conceptId,
  classId,
  studyScope,
  onHelpful,
  onTryAnother,
  subjectProfileId = "general",
  generate,
}: MemoryTrickResultProps) {
  const [answerVisible, setAnswerVisible] = useState(false);
  const [selfChecking, setSelfChecking] = useState(false);
  const [tryingAnother, setTryingAnother] = useState(false);
  const [pendingStrategy, setPendingStrategy] = useState<string | null>(null);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const alternativesId = useId();
  // Contextual controls only: at most three, one per modality, and only the
  // ones that actually apply to this concept right now.
  // What has actually worked for this student on memorization in this
  // subject. Thin evidence changes nothing; it never becomes a label.
  const { evidence: learnedEvidence } = useStrategyEvidence({
    subjectProfileId,
    taskKind: "memorize-terms",
  });
  const toolboxActions = useMemo(() => contextualStudentActions({
    subjectProfileId: subjectProfileId as never,
    taskKind: "memorize-terms",
    hasGroundedSource: Boolean(trick.sourceExcerpt),
    unavailableModalities: canReadAloud() ? [] : ["verbal" as const],
    observations: { alreadyShown: [trick.technique] },
    evidence: learnedEvidence,
  }, 2), [learnedEvidence, subjectProfileId, trick.sourceExcerpt, trick.technique]);
  /** At most two contextual strategies; the menu adds one trick-refresh option. */
  const alternatives = toolboxActions;
  const currentStrategyId = strategyIdForTechnique(trick.technique);
  const trickNote = useMemo(() => evidenceNote(
    evidenceAdjustment(learnedEvidence, {
      strategyId: currentStrategyId,
      subjectProfileId,
      taskKind: "memorize-terms",
    }).evidence,
  ), [currentStrategyId, learnedEvidence, subjectProfileId]);
  const recordOutcome = (helpful: boolean) => {
    void recordStrategyFeedbackOutcome({
      helpful,
      strategyId: currentStrategyId,
      technique: trick.technique,
      subjectProfileId,
      taskKind: "memorize-terms",
      classId,
      artifactId: trick.artifactId,
    });
  };
  const noMasteryId = useId();
  const selfCheckRef = useRef<HTMLDivElement>(null);
  const feedback: MemoryTrickFeedbackContext = {
    artifactId: trick.artifactId,
    conceptId,
    classId,
    studyScope,
    origin: trick.origin,
    technique: trick.technique,
  };

  const tryAnother = async () => {
    if (tryingAnother) return;
    setTryingAnother(true);
    recordOutcome(false);
    try {
      await onTryAnother?.(feedback);
      await generate({ regenerate: true, count: 1 });
    } finally {
      setTryingAnother(false);
    }
  };

  const runStrategy = async (strategyId: string) => {
    if (pendingStrategy) return;
    if (strategyId === "read-aloud") {
      readAloud(`${trick.target}. ${trick.mnemonic}`);
      return;
    }
    setPendingStrategy(strategyId);
    recordOutcome(false);
    try {
      await onTryAnother?.(feedback);
      await generate({ regenerate: true, count: 1, strategyId });
    } finally {
      setPendingStrategy(null);
    }
  };

  useEffect(() => {
    if (selfChecking) selfCheckRef.current?.focus();
  }, [selfChecking]);

  return (
    <div data-testid="memory-trick-result" className="space-y-4">
      {!selfChecking && (
        <>
          <div data-testid="academic-grounding" className="space-y-2 rounded-xl border border-border/50 bg-background/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What you need to know
            </p>
            <p className="break-words text-sm font-medium leading-relaxed text-foreground">
              {trick.target}
            </p>
            <p className="break-words border-t border-border/40 pt-2 text-xs leading-relaxed text-muted-foreground">
              From your class material: “{trick.sourceExcerpt}”
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="break-words text-base font-medium leading-relaxed text-foreground">{trick.mnemonic}</p>
            <p className="text-[11px] text-muted-foreground">
              {trick.provenanceLabel} · {trick.techniqueLabel}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">How to use it</p>
            <p className="break-words text-sm leading-relaxed text-foreground">{trick.howToUse}</p>
          </div>
        </>
      )}

      <div
        ref={selfCheckRef}
        tabIndex={selfChecking ? -1 : undefined}
        aria-label="Quick self-check"
        className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick self-check</p>
        {!selfChecking ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              When the trick feels familiar, hide it and recall the fact without peeking.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAnswerVisible(false);
                setSelfChecking(true);
              }}
              className="w-full sm:w-auto"
            >
              Test myself without looking
            </Button>
          </>
        ) : (
          <>
            <p className="break-words text-sm leading-relaxed text-foreground">{trick.selfCheckPrompt}</p>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                aria-expanded={answerVisible}
                onClick={() => setAnswerVisible((visible) => !visible)}
              >
                {answerVisible ? "Hide answer" : "Check answer"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAnswerVisible(false);
                  setSelfChecking(false);
                }}
              >
                Review the trick
              </Button>
            </div>
            {answerVisible && (
              <p role="status" aria-live="polite" className="break-words text-sm font-medium leading-relaxed text-foreground">
                {trick.selfCheckAnswer}
              </p>
            )}
          </>
        )}
      </div>

      <p id={noMasteryId} className="text-[11px] leading-relaxed text-muted-foreground">
        Reading a trick doesn’t change mastery.
      </p>

      {trickNote && (
        <p className="text-xs font-medium text-primary">{trickNote}</p>
      )}

      {!selfChecking && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-describedby={noMasteryId}
              onClick={() => { recordOutcome(true); void onHelpful?.(feedback); }}
              className="min-h-11 text-muted-foreground"
            >
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              Helpful
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-expanded={alternativesOpen}
              aria-controls={alternativesId}
              aria-describedby={noMasteryId}
              disabled={tryingAnother || pendingStrategy !== null}
              onClick={() => setAlternativesOpen((value) => !value)}
              className="min-h-11"
            >
              {tryingAnother || pendingStrategy !== null
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              Try another way
            </Button>
          </div>

          {alternativesOpen && (
            <div
              id={alternativesId}
              role="group"
              aria-label="Other ways to learn this"
              className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-2"
            >
              {alternatives.map((action) => (
                <Button
                  key={action.strategyId}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pendingStrategy !== null || tryingAnother}
                  onClick={() => {
                    if (action.strategyId === "read-aloud") {
                      void runStrategy(action.strategyId);
                      return;
                    }
                    setAlternativesOpen(false);
                    void runStrategy(action.strategyId);
                  }}
                  className="min-h-11 w-full justify-start rounded-xl"
                >
                  {pendingStrategy === action.strategyId && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {action.label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={tryingAnother || pendingStrategy !== null}
                onClick={() => { setAlternativesOpen(false); void tryAnother(); }}
                className="min-h-11 w-full justify-start rounded-xl"
              >
                A different memory trick
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
