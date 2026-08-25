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

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  getCapturesForClass,
  retryCaptureConcepts,
  retryCaptureImages,
  type PersistedCapture,
} from "@/lib/supabase/capturePersistence";
import { listCaptures, CAPTURE_LABELS } from "@/lib/capture/processor";
import type { CaptureKind, CaptureResult } from "@/lib/capture/types";
import { CaptureDetailDrawer, type MemoryItem } from "./CaptureDetailDrawer";
import { StudyFromCaptureDrawer } from "./StudyFromCaptureDrawer";
import type { StudyMode } from "@/lib/study/studyFromCapture";
import { ClassBrainAggregateStrip } from "@/components/intelligence/ClassBrainAggregateStrip";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  classId: string;
  className?: string;
}

const KIND_ICON: Record<CaptureKind, typeof Mic> = {
  "record-lecture": Mic,
  "scan-board": Camera,
  "scan-textbook": BookOpen,
  "scan-assignment": BookOpen,
  "scan-material": Camera,
  "scan-syllabus": BookOpen,
  "upload-file": Upload,
  "quick-note": StickyNote,
  "professor-hint": MessageSquareQuote,
  "ask-brain": Sparkles,
};

/** Bounded status polling: 6 checks, 5s apart (~30s), then hand control back. */
const MAX_STATUS_POLLS = 6;
const STATUS_POLL_MS = 5000;

const PLACEHOLDER_KINDS = new Set<CaptureKind>([
  "record-lecture",
  "scan-board",
  "scan-textbook",
  "upload-file",
  "ask-brain",
]);

function trustworthyConcepts(kind: CaptureKind, concepts: string[]) {
  // Typed notes and professor hints are real source material, but old UI
  // versions attached placeholder "Core concepts" labels before extraction.
  if (kind !== "quick-note" && kind !== "professor-hint") return concepts;
  return concepts.filter((concept) => ![
    "Core concepts",
    "Professor emphasis: Core concepts",
  ].includes(concept));
}

function fromLocal(classId: string): MemoryItem[] {
  return listCaptures()
    .filter((c) => c.context.classId === classId)
    .map((c: CaptureResult) => ({
      id: c.id,
      kind: c.kind,
      topic: c.context.topic || CAPTURE_LABELS[c.kind],
      date: c.context.date || c.createdAt.slice(0, 10),
      keyConcepts: trustworthyConcepts(c.kind, c.keyConcepts),
      summary: c.summary,
      processingStatus: "ready",
      flashcardsReady: c.flashcardCount > 0,
      chapter: undefined,
      rawText: c.context.text ?? null,
      source: "local" as const,
      isPlaceholder: PLACEHOLDER_KINDS.has(c.kind),
      materials: [],
    }));
}

function fromPersisted(rows: PersistedCapture[]): MemoryItem[] {
  return rows.map((r) => {
    const kind = (r.kind as CaptureKind) ?? "quick-note";
    const keyConcepts = trustworthyConcepts(kind, r.keyConcepts ?? []);
    const storedStatus =
      (r.processingStatus as MemoryItem["processingStatus"]) ?? "ready";
    // Repair captures created by the older client that marked the row ready
    // before the extractor returned. A real text capture with no real concept
    // is not study-ready, regardless of the legacy status value.
    const hasProcessableSource = (
      (kind === "quick-note" || kind === "professor-hint")
      && Boolean(r.rawText?.trim())
    ) || (
      (kind === "scan-assignment" || kind === "scan-material")
      && (r.materials?.length ?? 0) > 0
    );
    const processingStatus =
      storedStatus === "ready" && hasProcessableSource && keyConcepts.length === 0
        ? "failed"
        : storedStatus;
    return ({
    id: r.id,
    kind,
    topic: r.topic || CAPTURE_LABELS[kind],
    date: r.capturedOn,
    keyConcepts,
    summary: r.summary ?? "",
    processingStatus,
    flashcardsReady: r.flashcardsReady,
    chapter: undefined,
    rawText: r.rawText,
    source: "supabase" as const,
    isPlaceholder: PLACEHOLDER_KINDS.has(kind),
    materials: (r.materials ?? []).map((material) => ({
      id: material.id,
      storagePath: material.storagePath,
      originalName: material.originalName,
    })),
  });
  });
}

function dedupe(items: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    // Two separate captures can legitimately share a kind, topic, and date
    // (for example, the second half of a six-photo flash-card set). Only the
    // same persisted record should be collapsed.
    const key = `${i.source}:${i.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ClassMemory({ classId, className }: Props) {
  const { mode, user } = useAuth();
  const scopeKey = `${mode}:${user?.id ?? "anonymous"}:${classId}`;
  // Never hydrate browser-local demo captures while auth is resolving or for
  // a signed-in student. Supabase is the only source of truth in real mode.
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loadedScope, setLoadedScope] = useState(scopeKey);
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studyItem, setStudyItem] = useState<MemoryItem | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode | undefined>();
  const [studyOpen, setStudyOpen] = useState(false);
  const [loading, setLoading] = useState(mode !== "demo");
  const [loadError, setLoadError] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pollsUsed, setPollsUsed] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const requestVersion = useRef(0);
  const navigate = useNavigate();

  const openStudy = (item: MemoryItem, requestedMode?: StudyMode) => {
    if (mode === "real" && item.source === "supabase") {
      const format = requestedMode === "quiz" ? "multiple_choice" : "flashcards";
      const params = new URLSearchParams({
        classId,
        captureId: item.id,
        format,
      });
      navigate(`/study-lab?${params.toString()}`);
      return;
    }

    setStudyItem(item);
    setStudyMode(requestedMode);
    setStudyOpen(true);
  };

  // Quietly re-read the same rows without tearing down open drawers or the
  // student's selection. Failures are ignored: the last good list stays.
  const quietRefresh = useMemo(
    () => async () => {
      if (mode !== "real") return;
      const request = requestVersion.current;
      try {
        const remote = fromPersisted(await getCapturesForClass(classId, 25));
        if (request !== requestVersion.current) return;
        setItems(dedupe(remote));
      } catch {
        /* keep the current list; the student can still retry manually */
      }
    },
    [classId, mode],
  );

  const refresh = useMemo(

    () => async () => {
      const request = ++requestVersion.current;
      setLoadedScope(scopeKey);
      setItems([]);
      setSelected(null);
      setDrawerOpen(false);
      setStudyItem(null);
      setStudyOpen(false);
      setLoadError(false);
      if (mode === "loading") {
        setItems([]);
        setLoading(true);
        return;
      }
      if (mode === "demo") {
        setItems(dedupe(fromLocal(classId)));
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const remote = fromPersisted(await getCapturesForClass(classId, 25));
        if (request !== requestVersion.current) return;
        setItems(dedupe(remote));
      } catch {
        if (request !== requestVersion.current) return;
        setLoadError(true);
      } finally {
        if (request === requestVersion.current) setLoading(false);
      }
    },
    [classId, mode, scopeKey],
  );

  useEffect(() => {
    setPollsUsed(0);
    void refresh();
    const onCommit = () => void refresh();
    window.addEventListener("capture:committed", onCommit);
    window.addEventListener("concepts:extracted", onCommit);
    return () => {
      requestVersion.current += 1;
      window.removeEventListener("capture:committed", onCommit);
      window.removeEventListener("concepts:extracted", onCommit);
    };
  }, [refresh]);

  // Extraction finishes on the server with no push channel. Re-read the same
  // rows a bounded number of times so a capture that was still processing when
  // the student opened the class can visibly flip to ready — then stop and let
  // the student ask for another check instead of polling forever.
  const anyProcessing = items.some(
    (item) => item.processingStatus === "queued" || item.processingStatus === "processing",
  );

  useEffect(() => {
    if (mode !== "real") return;
    if (!anyProcessing || loading || pollsUsed >= MAX_STATUS_POLLS) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        await quietRefresh();
        if (!cancelled) setPollsUsed((count) => count + 1);
      })();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [anyProcessing, loading, mode, pollsUsed, quietRefresh]);



  const retryProcessing = async (item: MemoryItem) => {
    const imageRetry = (
      item.kind === "scan-assignment" || item.kind === "scan-material"
    ) && !!item.materials?.length;
    if (!imageRetry && !item.rawText?.trim()) return;
    setRetryingId(item.id);
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id
        ? { ...candidate, processingStatus: "processing" }
        : candidate
    )));
    try {
      if (
        imageRetry
        && item.materials
      ) {
        await retryCaptureImages(item.id, item.materials.map((material) => material.id));
      } else {
        await retryCaptureConcepts({
          id: item.id,
          kind: item.kind,
          clientClassId: classId,
          topic: item.topic,
          rawText: item.rawText,
        });
      }
      await refresh();
    } catch {
      setItems((current) => current.map((candidate) => (
        candidate.id === item.id
          ? { ...candidate, processingStatus: "failed" }
          : candidate
      )));
    } finally {
      setRetryingId(null);
    }
  };

  const openDetail = (item: MemoryItem) => {
    setSelected(item);
    setDrawerOpen(true);
  };

  const scopeIsCurrent = loadedScope === scopeKey;
  const visibleItems = scopeIsCurrent ? items : [];
  const visibleLoading = scopeIsCurrent ? loading : true;
  const visibleLoadError = scopeIsCurrent ? loadError : false;

  // Summary first: what the class is focusing on, what needs attention.
  const conceptCounts = new Map<string, number>();
  for (const item of visibleItems) {
    for (const concept of item.keyConcepts) {
      conceptCounts.set(concept, (conceptCounts.get(concept) ?? 0) + 1);
    }
  }
  const focusTopics = [...conceptCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([concept]) => concept);
  const likelyImportant = focusTopics.slice(0, 3);
  const needsAttention = visibleItems.filter((item) => item.processingStatus === "failed").length;

  const conceptTotal = conceptCounts.size;

  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <button
          type="button"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((v) => !v)}
          className="flex min-h-11 w-full items-center gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary mb-1">🧠 Class Memory</p>
            <h3 className="font-display font-semibold text-foreground">
              Campus Brain · {visibleItems.length} class material{visibleItems.length === 1 ? "" : "s"}
              {conceptTotal > 0 ? ` · ${conceptTotal} concept${conceptTotal === 1 ? "" : "s"}` : ""}
            </h3>
            {likelyImportant.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Likely important: {likelyImportant.join(", ")}
              </p>
            )}
            {needsAttention > 0 && (
              <p className="mt-0.5 text-xs text-warning">
                {needsAttention} capture{needsAttention === 1 ? "" : "s"} needs attention before it can be studied.
              </p>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {showHistory ? "Hide class memory" : `View class memory (${visibleItems.length})`}
          </span>
          <ArrowRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showHistory ? "rotate-90" : ""}`} />
        </button>

        <div className="mt-3 space-y-3">
        {visibleLoading ? (
          <div className="rounded-lg border border-border/40 p-6 text-center text-sm text-muted-foreground">
            Loading Class Memory…
          </div>
        ) : visibleLoadError ? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 text-center">
            <p className="text-sm font-medium text-foreground">Couldn’t load Class Memory</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your saved captures were not deleted. Check your connection and try again.
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nothing captured yet. Tap the <span className="font-medium">+</span>{" "}
            button to add a quick note or teacher hint. It will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {scopeIsCurrent && anyProcessing && pollsUsed >= MAX_STATUS_POLLS && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Still processing. This can take longer on a slow connection.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  onClick={() => {
                    setPollsUsed(0);
                    void quietRefresh();
                  }}
                >
                  Check again
                </Button>
              </div>
            )}
            {showHistory && (
            <>
            <ClassBrainAggregateStrip key={scopeKey} classId={classId} />

            <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
              {focusTopics.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    What your class is focusing on
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {focusTopics.map((topic) => (
                      <Badge key={topic} variant="outline" className="text-[10px] border-primary/20 text-primary">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {likelyImportant.length > 0 && (
                <p className="text-sm text-foreground">
                  <span className="font-medium">Likely important for your next test:</span>{" "}
                  {likelyImportant.join(", ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Campus Coach has learned from {visibleItems.length} class material
                {visibleItems.length === 1 ? "" : "s"}.
              </p>
            </div>

            <div className="space-y-2">
            {visibleItems.map((item) => (
              <MemoryRow
                key={`${item.source}-${item.id}`}
                item={item}
                onOpen={() => openDetail(item)}
                onStudy={() => openStudy(item)}
                onFlashcards={() => openStudy(item, "flashcards")}
                onQuiz={() => openStudy(item, "quiz")}
                onRetry={() => void retryProcessing(item)}
                retrying={retryingId === item.id}
              />
            ))}
            </div>
          </div>
        )}
        </div>
        )}


      </CardContent>

      <CaptureDetailDrawer
        open={scopeIsCurrent && drawerOpen}
        onOpenChange={setDrawerOpen}
        item={scopeIsCurrent ? selected : null}
        classId={classId}
        className={className}
        onStudy={(mode) => {
          setDrawerOpen(false);
          if (selected) openStudy(selected, mode);
        }}
      />

      {mode === "demo" && scopeIsCurrent && (
        <StudyFromCaptureDrawer
          open={studyOpen}
          onOpenChange={setStudyOpen}
          item={studyItem}
          classId={classId}
          className={className}
          initialMode={studyMode}
          persistence="local-only"
        />
      )}
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
  onRetry: () => void;
  retrying: boolean;
}

function MemoryRow({ item, onOpen, onStudy, onFlashcards, onQuiz, onRetry, retrying }: RowProps) {
  const Icon = KIND_ICON[item.kind] ?? StickyNote;
  const processing = item.processingStatus === "queued" || item.processingStatus === "processing";
  const failed = item.processingStatus === "failed";
  const studyReady = !item.isPlaceholder && item.processingStatus === "ready" && item.keyConcepts.length > 0;

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 hover:bg-muted/40 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
        aria-label="Open capture detail"
      >
        <Icon className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">
            {item.topic}
          </p>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {CAPTURE_LABELS[item.kind]}
          </span>
          {item.isPlaceholder ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              preview only
            </Badge>
          ) : failed ? (
            <Badge variant="outline" className="text-[10px] gap-1 border-warning/30 text-warning">
              <AlertTriangle className="h-3 w-3" /> needs attention
            </Badge>
          ) : processing ? (
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
        {failed && (
          item.rawText?.trim()
          || (
            (item.kind === "scan-assignment" || item.kind === "scan-material")
            && item.materials?.length
          )
        ) ? (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 text-warning hover:text-warning hover:bg-warning/10"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Retry
          </Button>
        ) : studyReady ? (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 text-primary hover:text-primary hover:bg-primary/10"
            onClick={onStudy}
          >
            Study <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`More options for ${item.topic}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onOpen}>Open detail</DropdownMenuItem>
            {studyReady && (
              <>
                <DropdownMenuItem onClick={onFlashcards}>
                  Generate flashcards
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onQuiz}>Generate quiz</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* Re-export for convenience so pages can pull the icon map. */
export { KIND_ICON };
