/**
 * Class Memory — recent captures attached to a specific class.
 *
 * Reads first from Supabase (`getCapturesForClass`) and falls back to
 * the local capture store so the demo keeps working offline. Listens
 * for `capture:committed` window events so freshly-captured items show
 * up without a page refresh.
 *
 * Progressive UI:
 *   Default = icon + topic + date + concept chips + one primary action.
 *   More menu = detail / flashcards / quiz / hint / edit / delete.
 *   Detail drawer opens on click for full metadata, summary, and
 *   Campus Brain insight.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mic,
  Camera,
  BookOpen,
  Upload,
  StickyNote,
  Sparkles,
  MessageSquareQuote,
  MoreHorizontal,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Brain,
} from "lucide-react";
import {
  getCapturesForClass,
  type PersistedCapture,
} from "@/lib/supabase/capturePersistence";
import { listCaptures, CAPTURE_LABELS } from "@/lib/capture/processor";
import type { CaptureKind, CaptureResult } from "@/lib/capture/types";
import { CaptureDetailDrawer, type MemoryItem } from "./CaptureDetailDrawer";
import { StudyFromCaptureDrawer } from "./StudyFromCaptureDrawer";
import type { StudyMode } from "@/lib/study/studyFromCapture";
import { ClassBrainAggregateStrip } from "@/components/intelligence/ClassBrainAggregateStrip";

interface Props {
  classId: string;
  className?: string;
}

const KIND_ICON: Record<CaptureKind, typeof Mic> = {
  "record-lecture": Mic,
  "scan-board": Camera,
  "scan-textbook": BookOpen,
  "upload-file": Upload,
  "quick-note": StickyNote,
  "professor-hint": MessageSquareQuote,
  "ask-brain": Sparkles,
};

function fromLocal(classId: string): MemoryItem[] {
  return listCaptures()
    .filter((c) => c.context.classId === classId)
    .map((c: CaptureResult) => ({
      id: c.id,
      kind: c.kind,
      topic: c.context.topic || CAPTURE_LABELS[c.kind],
      date: c.context.date || c.createdAt.slice(0, 10),
      keyConcepts: c.keyConcepts,
      summary: c.summary,
      processingStatus: "ready",
      flashcardsReady: c.flashcardCount > 0,
      chapter: undefined,
      source: "local" as const,
    }));
}

function fromPersisted(rows: PersistedCapture[]): MemoryItem[] {
  return rows.map((r) => ({
    id: r.id,
    kind: (r.kind as CaptureKind) ?? "quick-note",
    topic: r.topic || CAPTURE_LABELS[(r.kind as CaptureKind) ?? "quick-note"],
    date: r.createdAt.slice(0, 10),
    keyConcepts: r.keyConcepts ?? [],
    summary: r.summary ?? "",
    processingStatus:
      (r.processingStatus as MemoryItem["processingStatus"]) ?? "ready",
    flashcardsReady: r.flashcardsReady,
    chapter: undefined,
    source: "supabase" as const,
  }));
}

function dedupe(items: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.kind}|${i.topic}|${i.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ClassMemory({ classId, className }: Props) {
  const [items, setItems] = useState<MemoryItem[]>(() => fromLocal(classId));
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studyItem, setStudyItem] = useState<MemoryItem | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode | undefined>();
  const [studyOpen, setStudyOpen] = useState(false);
  const navigate = useNavigate();

  const openStudy = (item: MemoryItem, mode?: StudyMode) => {
    setStudyItem(item);
    setStudyMode(mode);
    setStudyOpen(true);
  };

  const refresh = useMemo(
    () => async () => {
      const local = fromLocal(classId);
      const remote = fromPersisted(await getCapturesForClass(classId, 25));
      // Prefer remote (has processed_content), then append any local-only.
      setItems(dedupe([...remote, ...local]));
    },
    [classId],
  );

  useEffect(() => {
    void refresh();
    const onCommit = () => void refresh();
    window.addEventListener("capture:committed", onCommit);
    return () => window.removeEventListener("capture:committed", onCommit);
  }, [refresh]);

  const openDetail = (item: MemoryItem) => {
    setSelected(item);
    setDrawerOpen(true);
  };

  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-medium text-primary mb-1">
              🧠 Class Memory
            </p>
            <h3 className="font-display font-semibold text-foreground">
              What Campus Brain remembers for this class
            </h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {items.length}
          </Badge>
        </div>
        <ClassBrainAggregateStrip classId={classId} className="mb-3" />

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nothing captured yet. Tap the <span className="font-medium">+</span>{" "}
            button to record a lecture, scan the board, or add a quick note —
            it will appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 8).map((item) => (
              <MemoryRow
                key={`${item.source}-${item.id}`}
                item={item}
                onOpen={() => openDetail(item)}
                onStudy={() => openStudy(item)}
                onFlashcards={() => openStudy(item, "flashcards")}
                onQuiz={() => openStudy(item, "quiz")}
              />
            ))}
          </div>
        )}
      </CardContent>

      <CaptureDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        item={selected}
        classId={classId}
        className={className}
        onStudy={(mode) => {
          setDrawerOpen(false);
          if (selected) openStudy(selected, mode);
        }}
      />

      <StudyFromCaptureDrawer
        open={studyOpen}
        onOpenChange={setStudyOpen}
        item={studyItem}
        classId={classId}
        className={className}
        initialMode={studyMode}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

interface RowProps {
  item: MemoryItem;
  onOpen: () => void;
  onStudy: () => void;
  onFlashcards: () => void;
  onQuiz: () => void;
}

function MemoryRow({ item, onOpen, onStudy, onFlashcards, onQuiz }: RowProps) {
  const Icon = KIND_ICON[item.kind] ?? StickyNote;
  const processing = item.processingStatus !== "ready";

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 hover:bg-muted/40 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
        aria-label="Open capture detail"
      >
        <Icon className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">
            {item.topic}
          </p>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {CAPTURE_LABELS[item.kind]}
          </span>
          {processing ? (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> processing
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-success/30 text-success"
            >
              <CheckCircle2 className="h-3 w-3" /> ready
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{item.date}</p>
        {item.keyConcepts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.keyConcepts.slice(0, 4).map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="text-[10px] border-primary/20 text-primary"
              >
                {k}
              </Badge>
            ))}
          </div>
        )}
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="text-primary hover:text-primary hover:bg-primary/10"
          onClick={onStudy}
        >
          Study <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onOpen}>Open detail</DropdownMenuItem>
            <DropdownMenuItem onClick={onFlashcards}>
              Generate flashcards
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onQuiz}>Generate quiz</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("class-memory:add-hint", {
                    detail: { classId: item.topic },
                  }),
                )
              }
            >
              Add professor hint
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpen}>
              Edit class / topic
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* Re-export for convenience so pages can pull the icon map. */
export { KIND_ICON };
