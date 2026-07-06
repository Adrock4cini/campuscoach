/**
 * Capture Detail Drawer — full metadata + AI outputs for one capture.
 *
 * Progressive disclosure: opened on demand from a Class Memory row.
 * Shows the capture kind, class link, topic/chapter, summary,
 * extracted concepts, a Campus Brain insight, and next study actions.
 */

import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Brain, Sparkles } from "lucide-react";
import { CAPTURE_LABELS } from "@/lib/capture/processor";
import type { CaptureKind } from "@/lib/capture/types";

export interface MemoryItem {
  id: string;
  kind: CaptureKind;
  topic: string;
  date: string;
  keyConcepts: string[];
  summary: string;
  processingStatus: "queued" | "processing" | "ready" | "failed";
  flashcardsReady: boolean;
  chapter?: string;
  source: "local" | "supabase";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MemoryItem | null;
  classId: string;
  className?: string;
  /** Open the Study From Capture drawer instead of navigating away. */
  onStudy?: (mode?: "flashcards" | "quiz" | "practice" | "explain") => void;
}

export function CaptureDetailDrawer({
  open,
  onOpenChange,
  item,
  classId,
  className,
  onStudy,
}: Props) {
  const navigate = useNavigate();
  if (!item) return null;

  const insight = buildInsight(item);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="uppercase tracking-wide">
              {CAPTURE_LABELS[item.kind]}
            </span>
            <span>·</span>
            <span>{item.date}</span>
          </div>
          <SheetTitle className="font-display text-xl">{item.topic}</SheetTitle>
          <SheetDescription>
            Linked to {className ?? "this class"}
            {item.chapter ? ` · Ch. ${item.chapter}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Campus Brain insight */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-1 text-primary text-xs font-medium">
              <Brain className="h-3.5 w-3.5" /> Campus Brain
            </div>
            <p className="text-sm text-foreground">{insight}</p>
          </div>

          {/* Summary */}
          {item.summary && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Summary
              </p>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {item.summary}
              </p>
            </div>
          )}

          {/* Key concepts */}
          {item.keyConcepts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Key concepts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.keyConcepts.map((k) => (
                  <Badge
                    key={k}
                    variant="outline"
                    className="text-xs border-primary/20 text-primary"
                  >
                    {k}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Study actions */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Next study actions
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="justify-between bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
                onClick={() =>
                  navigate(
                    `/study-lab?classId=${classId}&topic=${encodeURIComponent(item.topic)}`,
                  )
                }
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> Study from this
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="justify-between"
                onClick={() =>
                  navigate(
                    `/study-lab/session?mode=flashcards&classId=${classId}&topic=${encodeURIComponent(item.topic)}`,
                  )
                }
              >
                Generate flashcards <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="justify-between"
                onClick={() =>
                  navigate(
                    `/study-lab/session?mode=quiz&classId=${classId}&topic=${encodeURIComponent(item.topic)}`,
                  )
                }
              >
                Generate quiz <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Meta */}
          <div className="text-[11px] text-muted-foreground">
            Source: {item.source === "supabase" ? "Campus Brain memory" : "This device"}
            {" · "}Status: {item.processingStatus}
            {item.flashcardsReady ? " · Flashcards ready" : ""}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function buildInsight(item: MemoryItem): string {
  const c = item.keyConcepts[0];
  switch (item.kind) {
    case "record-lecture":
      return c
        ? `Your professor spent the most time on "${c}" — likely fair game on the next exam.`
        : "Lecture captured. Campus Brain will surface the sticky concepts once you review.";
    case "scan-board":
      return c
        ? `Board scans are strong signal — "${c}" is worth two quick recall passes today.`
        : "Board content captured. Try a 5-minute recall pass before you forget it.";
    case "scan-textbook":
      return c
        ? `Anchor "${c}" with one practice problem before reviewing the rest of the chapter.`
        : "Chapter captured. Skim the section headings, then hit one recall pass.";
    case "professor-hint":
      return "Professor hints predict exam questions better than any other signal — starred and boosted.";
    case "quick-note":
      return "Quick notes fade fastest. A 2-minute flashcard pass will lock this in.";
    case "ask-brain":
      return "Saved to your memory so Campus Brain can revisit this the next time it matters.";
    case "upload-file":
    default:
      return c
        ? `File added. Start with "${c}" — it's the highest-yield concept here.`
        : "File added to Class Memory.";
  }
}
