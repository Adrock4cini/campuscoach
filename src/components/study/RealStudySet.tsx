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

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Sparkles, ListChecks, Play } from "lucide-react";
import { RealStudyRunner } from "@/components/study/RealStudyRunner";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { useLearningArtifact } from "@/lib/learningArtifacts/useLearningArtifact";
import type {
  FlashcardsPayload,
  MultipleChoicePayload,
} from "@/lib/learningArtifacts/types";

interface Props {
  classId?: string;
}

type Kind = "flashcards" | "multiple_choice";

const KIND_META: Record<Kind, { label: string; icon: React.ElementType }> = {
  flashcards: { label: "Flashcards", icon: Sparkles },
  multiple_choice: { label: "Multiple choice", icon: ListChecks },
};

export function RealStudySet({ classId }: Props) {
  const [kind, setKind] = useState<Kind>("flashcards");
  const [studying, setStudying] = useState(false);
  const scope = useMemo(() => ({ classId }), [classId]);
  const { artifact, loading, generating, error, generate, reload } =
    useLearningArtifact(kind, scope);

  const count = artifact
    ? kind === "flashcards"
      ? (artifact.payload as FlashcardsPayload).cards?.length ?? 0
      : (artifact.payload as MultipleChoicePayload).questions?.length ?? 0
    : 0;

  const KindIcon = KIND_META[kind].icon;

  return (
    <Card className="border-border/40">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <KindIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Your study set</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Evidence-backed
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
          <p className="text-sm text-muted-foreground">
            No {KIND_META[kind].label.toLowerCase()} yet. Add a quick note or professor hint first. Campus Brain will extract concepts before it builds a study set.
          </p>
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
            ) : artifact ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate
              </>
            )}
          </Button>
          {artifact && count > 0 && (
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
