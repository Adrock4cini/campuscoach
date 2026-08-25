/**
 * RealStudySet — authenticated-only StudyLab section that reads the
 * freshest non-stale flashcards artifact for a class and lets the
 * user (re)generate it via the `generate-artifact` edge function.
 *
 * This is intentionally minimal for Sprint B: it proves the
 * Concept → Artifact pipeline end-to-end. UI is not being redesigned.
 * Demo/anon flows are untouched — this component is only rendered when
 * `mode === "real"`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, RefreshCw, Sparkles, ListChecks, Play, Target, Info, Puzzle } from "lucide-react";
import { RealStudyRunner } from "@/components/study/RealStudyRunner";
import { RealMatchingSession } from "@/components/study/RealMatchingSession";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { useLearningArtifact } from "@/lib/learningArtifacts/useLearningArtifact";
import type {
  FlashcardsPayload,
  MatchingPayload,
  MultipleChoicePayload,
} from "@/lib/learningArtifacts/types";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "@/lib/learningArtifacts/types";
import type { StudyScope } from "@/lib/learningArtifacts/types";
import { useRealExams } from "@/lib/realData/hooks";
import { isPastDateKey } from "@/lib/calendar/dateKey";
import { validateMatchingPayload } from "@/lib/learningArtifacts/matchingGame";
import { writeStudyLabState } from "@/lib/study/studyLabState";
import { classifySubject, getSubjectProfile, orderStudyFormats } from "@/lib/study/subjectProfiles";
import {
  evidenceAdjustment,
  evidenceNote,
  orderFormatsByEvidence,
  useStrategyEvidence,
} from "@/lib/study/strategyEvidence";

interface Props {
  classId?: string;
  /** Display name of the class, used only to pick a subject study strategy. */
  className?: string;
  /** Current topic for the class, used only as a secondary subject signal. */
  classTopic?: string;
  initialCaptureId?: string;
  initialExamId?: string;
  initialKind?: Kind;
  initialConceptIds?: string[];
  initialStudyScope?: StudyScope;
  autoStart?: boolean;
}

type Kind = "flashcards" | "multiple_choice" | "matching";

const KIND_META: Record<Kind, { label: string; icon: React.ElementType }> = {
  flashcards: { label: "Flashcards", icon: Sparkles },
  multiple_choice: { label: "Multiple choice", icon: ListChecks },
  matching: { label: "Match Lab", icon: Puzzle },
};

function targetButtonLabel(target: StudyScope) {
  if (target.id.startsWith("coach-")) return "Coach picks";
  if (target.id.startsWith("capture-")) return "This capture";
  if (target.type === "recent") return "Recent";
  if (target.type === "class") return "All";
  return `Test · ${target.label}`;
}

function formatUpdatedAt(value: string) {
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function RealStudySet({
  classId,
  className: classDisplayName,
  classTopic,
  initialCaptureId,
  initialExamId,
  initialKind = "flashcards",
  initialConceptIds = [],
  initialStudyScope,
  autoStart = false,
}: Props) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [showWhy, setShowWhy] = useState(false);
  const [studying, setStudying] = useState(false);

  const captureStudyScope = useMemo<StudyScope | undefined>(() => (
    initialCaptureId
      ? { type: "recent", id: `capture-${initialCaptureId}`, label: "This capture" }
      : undefined
  ), [initialCaptureId]);
  const initialTarget = initialStudyScope ?? captureStudyScope;
  const [selectedTarget, setSelectedTarget] = useState(initialTarget?.id ?? initialExamId ?? "recent");
  const autoStartKey = useRef<string | null>(null);
  const generationInFlight = useRef(new Map<string, Promise<unknown>>());
  const currentGenerationKey = useRef("");
  const reloadAfterStudy = useRef(false);
  const { items: exams, loading: examsLoading, error: examsError } = useRealExams(classId);

  const initialConceptKey = initialConceptIds.join(",");

  useEffect(() => {
    setSelectedTarget(initialTarget?.id ?? initialExamId ?? "recent");
    setKind(initialKind);
    setStudying(false);
    autoStartKey.current = null;
    reloadAfterStudy.current = false;
  }, [classId, initialConceptKey, initialExamId, initialKind, initialTarget?.id]);

  const studyTargets = useMemo<StudyScope[]>(() => [
    ...(initialTarget && (initialTarget.type !== "exam" || !isPastDateKey(initialTarget.examDate))
      ? [initialTarget]
      : []),
    { type: "recent", id: "recent", label: "Recent material" },
    ...exams.filter((exam) => !isPastDateKey(exam.exam_date)).map((exam) => ({
      type: "exam" as const,
      id: exam.id,
      examId: exam.id,
      label: exam.title,
      topics: exam.topics,
      examDate: exam.exam_date,
    })),
    { type: "class", id: "class", label: "Mixed class review" },
  ], [exams, initialTarget]);

  const studyScope = studyTargets.find((target) => target.id === selectedTarget)
    ?? studyTargets[0];
  // Subject adaptation is presentation-only here: it reorders the format
  // buttons and names the strategy. Concept selection stays untouched.
  const subject = useMemo(() => classifySubject({
    className: classDisplayName ?? null,
    topics: [classTopic ?? "", ...(studyScope.type === "exam" ? studyScope.topics ?? [] : [])],
  }), [classDisplayName, classTopic, studyScope]);
  const subjectProfile = getSubjectProfile(subject.primary);
  // Learned evidence leads when the student has actually shown a format works
  // better for them in this subject; otherwise the cold-start subject order
  // stands. Formats are compared across task kinds, so evidence is collapsed.
  const { evidence: formatEvidence } = useStrategyEvidence({
    subjectProfileId: subject.primary,
    taskKind: null,
  });
  const orderedKinds = useMemo(() => orderFormatsByEvidence(
    Object.keys(KIND_META) as Kind[],
    orderStudyFormats(subject.primary, Object.keys(KIND_META) as Kind[]) as Kind[],
    formatEvidence,
    { subjectProfileId: subject.primary, taskKind: null },
  ), [formatEvidence, subject.primary]);
  const kindNote = useMemo(() => evidenceNote(
    evidenceAdjustment(formatEvidence, {
      format: kind,
      subjectProfileId: subject.primary,
      taskKind: null,
    }).evidence,
  ), [formatEvidence, kind, subject.primary]);

  const isCoachTarget = Boolean(
    initialStudyScope && studyScope.id === initialStudyScope.id,
  );
  const isCaptureTarget = Boolean(
    initialCaptureId && captureStudyScope && studyScope.id === captureStudyScope.id,
  );
  const scope = useMemo(() => ({
    classId,
    studyScope,
    conceptIds: isCoachTarget ? initialConceptIds : undefined,
    captureId: isCaptureTarget ? initialCaptureId : undefined,
  }), [classId, initialCaptureId, initialConceptIds, isCaptureTarget, isCoachTarget, studyScope]);
  const { artifact, loading, generating, error, captureProcessing, generate, reload } =
    useLearningArtifact(kind, scope);
  const [retryingCapture, setRetryingCapture] = useState(false);
  const startGenerationRef = useRef<((regenerate: boolean) => Promise<void>) | null>(null);


  // A capture that is still extracting must never be an infinite wait: give
  // the student one explicit, non-AI retry that reclaims a stale/orphaned
  // extraction claim and rechecks readiness.
  const retryCaptureProcessingNow = useCallback(async () => {
    if (!scope.captureId) return;
    setRetryingCapture(true);
    try {
      const { retryCaptureProcessing } = await import("@/lib/supabase/capturePersistence");
      await retryCaptureProcessing(scope.captureId);
    } catch {
      /* the generation attempt below reports the resulting state */
    } finally {
      setRetryingCapture(false);
    }
    await startGenerationRef.current?.(false);
  }, [scope.captureId]);

  // Remember where the student was so leaving Study Lab and coming back does
  // not silently reset them to the first class in flashcard mode.
  useEffect(() => {
    if (!classId) return;
    writeStudyLabState({ classId, kind, targetId: studyScope.id });
  }, [classId, kind, studyScope.id]);

  const count = artifact
    ? kind === "flashcards"
      ? (artifact.payload as FlashcardsPayload).cards?.length ?? 0
      : kind === "multiple_choice"
        ? (artifact.payload as MultipleChoicePayload).questions?.length ?? 0
        : (artifact.payload as MatchingPayload).pairs?.length ?? 0
    : 0;

  // Match Lab renders only verified pairs. Checking here keeps "Start" from
  // opening a dialog that can only say the set is unusable.
  const matchingUnusable = Boolean(
    artifact
    && kind === "matching"
    && !validateMatchingPayload(artifact.payload as MatchingPayload, artifact.concept_ids),
  );

  const needsRefresh = Boolean(
    artifact &&
    artifact.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION,
  );

  const generationKey = JSON.stringify({
    kind,
    classId: classId ?? null,
    captureId: scope.captureId ?? null,
    conceptIds: scope.conceptIds ?? null,
    studyScope: scope.studyScope,
  });
  currentGenerationKey.current = generationKey;

  const startGeneration = useCallback(async (regenerate: boolean) => {
    const existing = generationInFlight.current.get(generationKey);
    if (existing) {
      await existing;
      // A → B → A can make the first A response intentionally stale inside
      // the owner/scope-keyed hook. Reloading after its keyed promise settles
      // prevents the returned A scope from becoming stranded.
      if (currentGenerationKey.current === generationKey) await reload();
      return;
    }
    const task = generate({ regenerate });
    generationInFlight.current.set(generationKey, task);
    try {
      await task;
    } finally {
      if (generationInFlight.current.get(generationKey) === task) {
        generationInFlight.current.delete(generationKey);
      }
    }
  }, [generate, generationKey, reload]);
  startGenerationRef.current = startGeneration;


  useEffect(() => {
    if (!autoStart || (!isCoachTarget && !isCaptureTarget) || loading || generating || error) return;

    if (artifact && !needsRefresh) {
      const key = `open:${kind}:${artifact.id}`;
      if (autoStartKey.current === key) return;
      autoStartKey.current = key;
      setStudying(true);
      return;
    }

    const key = `generate:${kind}:${studyScope.id}`;
    if (autoStartKey.current === key) return;
    autoStartKey.current = key;
    void startGeneration(Boolean(artifact));
  }, [
    artifact,
    autoStart,
    error,
    generating,
    isCoachTarget,
    isCaptureTarget,
    kind,
    loading,
    needsRefresh,
    startGeneration,
    studyScope.id,
  ]);

  const KindIcon = KIND_META[kind].icon;
  const targetDetail = isCoachTarget
    ? "Your coach uses your mastery, review timing, teacher emphasis, and the test or capture you selected."
    : isCaptureTarget
    ? "Only concepts extracted from this capture will be included."
    : studyScope.type === "exam"
    ? `Focuses on concepts linked to ${studyScope.label}, named in its topics, or captured in its likely test window. Check the reasons shown before studying.`
    : studyScope.type === "recent"
      ? "A quick review of the newest material you added."
      : "A broader review that mixes older and newer material.";
  const sourceDetail = artifact
    ? `Built from ${artifact.concept_ids.length} concept${artifact.concept_ids.length === 1 ? "" : "s"} extracted from your notes and teacher hints. Your answers update mastery and future recommendations.`
    : "Practice is generated from this class’s notes and teacher hints.";
  const itemLabel = kind === "flashcards"
    ? count === 1 ? "card" : "cards"
    : kind === "multiple_choice"
      ? count === 1 ? "question" : "questions"
      : count === 1 ? "pair" : "pairs";
  const selectionReasons = describeSelectionEvidence(artifact?.study_scope_snapshot);

  return (
    <Card className="overflow-hidden rounded-[28px] border-border/40 bg-card/70 shadow-card backdrop-blur-md">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span>Focus</span>
            </span>
            <InfoPopover label={`About ${studyScope.type === "exam" ? studyScope.label : targetButtonLabel(studyScope)}`}>
              {targetDetail}
            </InfoPopover>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {studyTargets.map((target) => (
              <button
                key={`${target.type}:${target.id}`}
                type="button"
                aria-pressed={studyScope.type === target.type && studyScope.id === target.id}
                onClick={() => {
                  setSelectedTarget(target.id);
                  setStudying(false);
                  reloadAfterStudy.current = false;
                }}
                className={`min-h-11 max-w-[12rem] shrink-0 truncate rounded-full border px-3 text-xs transition-colors ${
                  studyScope.type === target.type && studyScope.id === target.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {targetButtonLabel(target)}
                {target.type === "exam" && target.examDate
                  ? ` · ${new Date(`${target.examDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : ""}
              </button>
            ))}
            {examsLoading && <span className="shrink-0 px-2 py-2 text-xs text-muted-foreground">Loading exams…</span>}
            {examsError && <span className="shrink-0 px-2 py-2 text-xs text-danger">Exams unavailable</span>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <KindIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Study set</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Your notes
            </Badge>
            <InfoPopover label="About this study set">{sourceDetail}</InfoPopover>
          </div>
          <div
            role="group"
            aria-label="Study format"
            className="grid grid-cols-3 gap-1 rounded-2xl border border-border/30 bg-background/35 p-1"
          >
            {orderedKinds.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-11 min-w-0 rounded-xl px-2.5 text-xs font-medium transition-colors ${
                  kind === k
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {KIND_META[k].label}
              </button>
            ))}
          </div>
          {kindNote && (
            <p className="text-xs font-medium text-primary">{kindNote}</p>
          )}
          {subject.primary !== "general" && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{subjectProfile.label}:</span>{" "}
              {subjectProfile.studyFocus}
            </p>
          )}
        </div>

        {loading ? (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading study set…</p>
        ) : needsRefresh ? (
          <div>
            <p className="text-sm font-medium text-foreground">Refresh this set before studying</p>
          </div>
        ) : artifact ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {count} {itemLabel} · {formatUpdatedAt(artifact.updated_at)}
            </p>
            {selectionReasons.length > 0 && (
              <div className="rounded-2xl border border-border/40 bg-background/30 p-3">
                <p className="text-sm font-medium text-foreground">
                  {summarizeSelectionReasons(selectionReasons)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Concepts in this set">
                  {selectionReasons.slice(0, 3).map((reason) => (
                    <span
                      key={reason.conceptId}
                      className="max-w-full truncate rounded-full border border-border/50 bg-card/60 px-2.5 py-1 text-xs text-foreground"
                    >
                      {reason.conceptName}
                    </span>
                  ))}
                  {selectionReasons.length > 3 && (
                    <span className="rounded-full px-1.5 py-1 text-xs text-muted-foreground">
                      +{selectionReasons.length - 3} more
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-expanded={showWhy}
                  onClick={() => setShowWhy((value) => !value)}
                  className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-primary"
                >
                  {showWhy ? "Hide details" : "Why this set?"}
                </button>
                {showWhy && (
                  <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {selectionReasons.map((reason) => (
                      <li key={reason.conceptId} className="break-words">
                        <span className="font-medium text-foreground">{reason.conceptName}:</span>{" "}
                        {reason.labels.join(" · ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

        ) : (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              {isCoachTarget
                ? "Build your coach-picked study set"
                : isCaptureTarget
                ? "Build a study set from this capture"
                : studyScope.type === "exam"
                ? `Build a study set for ${studyScope.label}`
                : `No ${KIND_META[kind].label.toLowerCase()} here yet`}
            </p>
            {!isCoachTarget && !isCaptureTarget && studyScope.type !== "exam" && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Add a note or teacher hint first.
              </p>
            )}
          </div>
        )}

        {matchingUnusable && (
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Match Lab needs a few more details</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Matching needs at least three clearly different term-and-answer pairs. Refresh this
              set after adding a note, or study this material as flashcards now.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-11 w-full rounded-xl sm:w-auto"
              onClick={() => setKind("flashcards")}
            >
              Study as flashcards
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        {captureProcessing && scope.captureId && (
          <div className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="h-11 w-full rounded-xl"
              disabled={retryingCapture || generating}
              onClick={() => { void retryCaptureProcessingNow(); }}
            >
              {retryingCapture ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Retrying…
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry processing
                </>
              )}
            </Button>
            {/* Never an infinite wait: the class-wide path already works and
                switching targets triggers no AI until the student asks. */}
            <Button
              size="sm"
              variant="ghost"
              className="h-11 w-full rounded-xl text-primary"
              onClick={() => {
                setSelectedTarget("class");
                setStudying(false);
              }}
            >
              Study the whole class instead
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {artifact && count > 0 && !needsRefresh && !matchingUnusable && (
            <Button
              aria-label="Start study session"
              className="h-12 w-full rounded-2xl text-base font-semibold shadow-elegant"
              onClick={() => setStudying(true)}
              disabled={generating}
            >
              <Play className="mr-2 h-4 w-4" />
              Start
            </Button>
          )}
          <Button
            size="sm"
            variant={artifact && !needsRefresh ? "ghost" : "outline"}
            onClick={() => { void startGeneration(Boolean(artifact)); }}
            className="h-11 w-full rounded-xl"
            disabled={generating}
            aria-label={needsRefresh ? "Refresh from notes" : artifact ? "Rebuild from notes" : undefined}
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Generating…
              </>
            ) : artifact ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {studyScope.type === "exam" ? "Build test practice" : "Build study set"}
              </>
            )}
          </Button>
        </div>

      </CardContent>

      {artifact && studying && artifact.kind !== "matching" && (
        <RealStudyRunner
          open={studying}
          onOpenChange={(nextOpen) => {
            setStudying(nextOpen);
            if (!nextOpen && reloadAfterStudy.current) {
              reloadAfterStudy.current = false;
              void reload();
            }
          }}
          artifact={artifact as LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice">}
          // Keep the saved-results screen stable. Reloading while it is open
          // can replace the artifact prop and reset the runner back to card 1.
          onCompleted={() => { reloadAfterStudy.current = true; }}
        />
      )}
      {artifact && studying && artifact.kind === "matching" && (
        <RealMatchingSession
          open={studying}
          onOpenChange={(nextOpen) => {
            setStudying(nextOpen);
            if (!nextOpen && reloadAfterStudy.current) {
              reloadAfterStudy.current = false;
              void reload();
            }
          }}
          artifact={artifact as LearningArtifact<"matching">}
          onCompleted={() => { reloadAfterStudy.current = true; }}
        />
      )}
    </Card>
  );
}

type SelectionReason = { conceptId: string; conceptName: string; labels: string[] };

/**
 * Five concepts that share one reason should say the reason once. Only fall
 * back to a neutral count when the reasons genuinely differ.
 */
export function summarizeSelectionReasons(reasons: SelectionReason[]) {
  const count = reasons.length;
  const noun = `${count} concept${count === 1 ? "" : "s"}`;
  if (!count) return noun;
  const shared = reasons[0].labels.find((label) =>
    reasons.every((reason) => reason.labels.includes(label)),
  );
  if (!shared) return `${noun} picked for this set`;
  const lowered = shared.charAt(0).toLowerCase() + shared.slice(1);
  return `${noun} · ${lowered}`;
}

function describeSelectionEvidence(snapshot: Record<string, unknown> | undefined) {

  const raw = snapshot?.selectionEvidence;
  if (!Array.isArray(raw)) return [];
  const fallbackLabel = selectionFallbackLabel(snapshot);
  const reasons: Array<{ conceptId: string; conceptName: string; labels: string[] }> = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const record = item as { conceptId?: unknown; conceptName?: unknown; signals?: unknown };
    if (typeof record.conceptId !== "string" || typeof record.conceptName !== "string") continue;
    const conceptId = record.conceptId.trim();
    const conceptName = record.conceptName.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!conceptId || !conceptName) continue;
    const labels: string[] = [];
    if (Array.isArray(record.signals)) {
      for (const signal of record.signals) {
        const label = signal && typeof signal === "object"
          ? (signal as { label?: unknown }).label
          : null;
        if (typeof label !== "string") continue;
        const clean = label.replace(/\s+/g, " ").trim().slice(0, 100);
        if (clean && !labels.includes(clean)) labels.push(clean);
        if (labels.length >= 2) break;
      }
    }
    reasons.push({ conceptId, conceptName, labels: labels.length ? labels : [fallbackLabel] });
  }
  return reasons;
}

function selectionFallbackLabel(snapshot: Record<string, unknown>) {
  const id = typeof snapshot.id === "string" ? snapshot.id : "";
  const type = typeof snapshot.type === "string" ? snapshot.type : "";
  if (id.startsWith("coach-")) return "Included in your coach-picked set";
  if (id.startsWith("capture-")) return "From the capture you selected";
  if (type === "exam") return "Included in this test review";
  if (type === "recent") return "Included in recent material";
  if (type === "class") return "Included in mixed class review";
  return "Included in this study set";
}

function InfoPopover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="-my-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-xs leading-relaxed text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
