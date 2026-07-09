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
  const scope = useMemo(() => ({ classId }), [classId]);
  const { artifact, loading, generating, error, generate } =
    useLearningArtifact(kind, scope);

  const count = artifact
    ? kind === "flashcards"
      ? (artifact.payload as FlashcardsPayload).cards?.length ?? 0
      : (artifact.payload as MultipleChoicePayload).questions?.length ?? 0
    : 0;

  const KindIcon = KIND_META[kind].icon;

  return (
    <Card className="border-border/40">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <KindIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Generated from your captures
            </span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Concept-backed
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {(Object.keys(KIND_META) as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
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
            <p className="text-xs text-muted-foreground">
              Built from {artifact.concept_ids.length} concept
              {artifact.concept_ids.length === 1 ? "" : "s"} you've captured.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No {KIND_META[kind].label.toLowerCase()} yet. Capture a lecture, board
            photo, or note in this class and Campus Brain will build a study set
            grounded in your concepts.
          </p>
        )}

        {error && (
          <p className="text-xs text-destructive">
            Couldn't reach the generator: {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={artifact ? "outline" : "default"}
            onClick={() => generate({ regenerate: !!artifact })}
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
        </div>
      </CardContent>
    </Card>
  );
}
