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

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Sparkles, ListChecks, Play, Target } from "lucide-react";
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
  if (target.type === "recent") return "What I just learned";
  if (target.type === "class") return "Everything in this class";
  return `Prepare for ${target.label}`;
}

export function RealStudySet({
  classId,
  initialConceptIds = [],
  initialStudyScope,
  autoStart = false,
}: Props) {
  const [kind, setKind] = useState<Kind>("flashcards");
  const [studying, setStudying] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(initialStudyScope?.id ?? "recent");
  const autoStartKey = useRef<string | null>(null);
  const { items: exams, loading: examsLoading } = useRealExams(classId);

  const initialConceptKey = initialConceptIds.join(",");

  useEffect(() => {
    setSelectedTarget(initialStudyScope?.id ?? "recent");
    setStudying(false);
    autoStartKey.current = null;
  }, [classId, initialConceptKey, initialStudyScope?.id]);

  const studyTargets = useMemo<StudyScope[]>(() => [
    ...(initialStudyScope ? [initialStudyScope] : []),
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
  ], [exams, initialStudyScope]);

  const studyScope = studyTargets.find((target) => target.id === selectedTarget)
    ?? studyTargets[0];
  const isCoachTarget = Boolean(
    initialStudyScope && studyScope.id === initialStudyScope.id,
  );
  const scope = useMemo(() => ({
    classId,
    studyScope,
    conceptIds: isCoachTarget ? initialConceptIds : undefined,
  }), [classId, initialConceptIds, isCoachTarget, studyScope]);
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

  useEffect(() => {
    if (!autoStart || !isCoachTarget || loading || generating || error) return;

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
    void generate({ regenerate: Boolean(artifact) });
  }, [
    artifact,
    autoStart,
    error,
    generate,
    generating,
    isCoachTarget,
    kind,
    loading,
    needsRefresh,
    studyScope.id,
  ]);

  const KindIcon = KIND_META[kind].icon;

  return (
    <Card className="border-border/40">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Target className="h-4 w-4 text-primary" />
            <span>Choose what to study</span>
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
                }}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs transition-colors ${
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
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {isCoachTarget
              ? "Campus Coach picked these from weak, overdue, and high-impact concepts."
              : studyScope.type === "exam"
              ? `Only material for ${studyScope.label} will be included.`
              : studyScope.type === "recent"
                ? "A quick review of the newest material you added."
                : "A broader review that mixes older and newer material."}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <KindIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Your study set</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Built from your notes
            </Badge>
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
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Refresh this set before studying</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              These questions were created by an older generator. Refresh them from your original notes so they stay faithful to what you captured.
            </p>
          </div>
        ) : artifact ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {count} {KIND_META[kind].label.toLowerCase()} ready · updated{" "}
              {new Date(artifact.updated_at).toLocaleDateString()}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Built from {artifact.concept_ids.length} concept
              {artifact.concept_ids.length === 1 ? "" : "s"} extracted from your notes and professor hints. Your answers update mastery and future recommendations.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              {isCoachTarget
                ? "Build your coach-picked study set"
                : studyScope.type === "exam"
                ? `Build a study set for ${studyScope.label}`
                : `No ${KIND_META[kind].label.toLowerCase()} here yet`}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {isCoachTarget
                ? "These cards focus only on the concepts your coach recommended right now."
                : studyScope.type === "exam"
                ? `We’ll look through your notes for material that matches this test and turn it into practice questions.`
                : "Add a quick note or professor hint, then come back to build practice questions from it."}
            </p>
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
            onClick={() => generate({ regenerate: !!artifact })}
            className="w-full sm:w-auto"
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Generating…
              </>
            ) : needsRefresh ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh from notes
              </>
            ) : artifact ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Rebuild from notes
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {studyScope.type === "exam" ? "Build test practice" : "Build study set"}
              </>
            )}
          </Button>
          {artifact && count > 0 && !needsRefresh && (
            <Button className="w-full sm:w-auto" size="sm" onClick={() => setStudying(true)} disabled={generating}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Study now
            </Button>
          )}
        </div>
      </CardContent>

      {artifact && studying && (
        <RealStudyRunner
          open={studying}
          onOpenChange={setStudying}
          artifact={artifact as LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice">}
          onCompleted={() => { reload(); }}
        />
      )}
    </Card>
  );
}
