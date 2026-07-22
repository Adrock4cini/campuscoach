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
import { Loader2, RefreshCw, Sparkles, ListChecks, Play, Target, Info } from "lucide-react";
import { RealStudyRunner } from "@/components/study/RealStudyRunner";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { useLearningArtifact } from "@/lib/learningArtifacts/useLearningArtifact";
import type {
  FlashcardsPayload,
  MultipleChoicePayload,
} from "@/lib/learningArtifacts/types";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "@/lib/learningArtifacts/types";
import type { StudyScope } from "@/lib/learningArtifacts/types";
import { useRealExams } from "@/lib/realData/hooks";

interface Props {
  classId?: string;
  initialCaptureId?: string;
  initialExamId?: string;
  initialKind?: Kind;
  initialConceptIds?: string[];
  initialStudyScope?: StudyScope;
  autoStart?: boolean;
}

type Kind = "flashcards" | "multiple_choice";

const KIND_META: Record<Kind, { label: string; icon: React.ElementType }> = {
  flashcards: { label: "Flashcards", icon: Sparkles },
  multiple_choice: { label: "Multiple choice", icon: ListChecks },
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
  initialCaptureId,
  initialExamId,
  initialKind = "flashcards",
  initialConceptIds = [],
  initialStudyScope,
  autoStart = false,
}: Props) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [studying, setStudying] = useState(false);
  const captureStudyScope = useMemo<StudyScope | undefined>(() => (
    initialCaptureId
      ? { type: "recent", id: `capture-${initialCaptureId}`, label: "This capture" }
      : undefined
  ), [initialCaptureId]);
  const initialTarget = initialStudyScope ?? captureStudyScope;
  const [selectedTarget, setSelectedTarget] = useState(initialTarget?.id ?? initialExamId ?? "recent");
  const autoStartKey = useRef<string | null>(null);
  const generationInFlight = useRef(false);
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
    ...(initialTarget ? [initialTarget] : []),
    { type: "recent", id: "recent", label: "Recent material" },
    ...exams.map((exam) => ({
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
  const { artifact, loading, generating, error, generate, reload } =
    useLearningArtifact(kind, scope);

  const count = artifact
    ? kind === "flashcards"
      ? (artifact.payload as FlashcardsPayload).cards?.length ?? 0
      : (artifact.payload as MultipleChoicePayload).questions?.length ?? 0
    : 0;

  const needsRefresh = Boolean(
    artifact &&
    artifact.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION,
  );

  const startGeneration = useCallback(async (regenerate: boolean) => {
    // State-driven button disabling lands on the next render. The ref closes
    // the small same-frame window where a fast double tap could create two
    // active artifacts for the same study target.
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    try {
      await generate({ regenerate });
    } finally {
      generationInFlight.current = false;
    }
  }, [generate]);

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
    ? "Campus Coach picked these from weak, overdue, and high-impact concepts."
    : isCaptureTarget
    ? "Only concepts extracted from this capture will be included."
    : studyScope.type === "exam"
    ? `Only material for ${studyScope.label} will be included.`
    : studyScope.type === "recent"
      ? "A quick review of the newest material you added."
      : "A broader review that mixes older and newer material.";
  const sourceDetail = artifact
    ? `Built from ${artifact.concept_ids.length} concept${artifact.concept_ids.length === 1 ? "" : "s"} extracted from your notes and professor hints. Your answers update mastery and future recommendations.`
    : "Practice is generated from this class’s notes and professor hints.";
  const itemLabel = kind === "flashcards"
    ? count === 1 ? "card" : "cards"
    : count === 1 ? "question" : "questions";

  return (
    <Card className="border-border/40">
      <CardContent className="p-4 sm:p-5 space-y-4">
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
                className={`max-w-[12rem] shrink-0 truncate rounded-full border px-3 py-2 text-xs transition-colors ${
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
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {(Object.keys(KIND_META) as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`min-w-0 rounded-full px-2.5 py-2 text-xs transition-colors sm:py-1 ${
                  kind === k
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {KIND_META[k].label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading study set…</p>
        ) : needsRefresh ? (
          <div>
            <p className="text-sm font-medium text-foreground">Refresh this set before studying</p>
          </div>
        ) : artifact ? (
          <p className="text-sm text-foreground">
            {count} {itemLabel} · {formatUpdatedAt(artifact.updated_at)}
          </p>
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
                Add a note or professor hint first.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:items-center sm:flex-wrap">
          <Button
            size="sm"
            variant={artifact ? "outline" : "default"}
            onClick={() => { void startGeneration(Boolean(artifact)); }}
            className="w-full sm:w-auto"
            disabled={generating}
            aria-label={needsRefresh ? "Refresh from notes" : artifact ? "Rebuild from notes" : undefined}
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Generating…
              </>
            ) : needsRefresh ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
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
          {artifact && count > 0 && !needsRefresh && (
            <Button aria-label="Start study session" className="w-full sm:w-auto" size="sm" onClick={() => setStudying(true)} disabled={generating}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Start
            </Button>
          )}
        </div>
      </CardContent>

      {artifact && studying && (
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
    </Card>
  );
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
