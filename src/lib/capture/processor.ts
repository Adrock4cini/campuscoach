/**
 * Quick Capture — mock processing pipeline + local store.
 *
 * The pipeline emits the same six steps for every capture kind so
 * students learn one mental model:
 *   1. Campus Brain is processing…
 *   2. Class detected
 *   3. Key concepts found
 *   4. Summary created
 *   5. Flashcards ready
 *   6. Added to Campus Brain
 *
 * Today each step just resolves after a short delay. Later:
 *   - record-lecture   → real audio upload + STT
 *   - scan-board / textbook → image upload + OCR
 *   - upload-file      → storage upload + parse_document
 * The functions in this module are the seam where that happens.
 */

import { classes } from "@/data/demo";
import { contributeStudySignal } from "@/hooks/useClassIntelligence";
import type {
  CaptureContext,
  CaptureKind,
  CaptureResult,
  ProcessingStep,
} from "./types";

const STORE_KEY = "cc_captures_v1";

export const PROCESSING_STEPS: ProcessingStep[] = [
  { id: "queued",            label: "Campus Brain is processing…", duration: 700 },
  { id: "class-detected",    label: "Class detected",              duration: 550 },
  { id: "concepts-found",    label: "Key concepts found",          duration: 700 },
  { id: "summary-created",   label: "Summary created",             duration: 700 },
  { id: "flashcards-ready",  label: "Flashcards ready",            duration: 650 },
  { id: "added-to-brain",    label: "Added to Campus Brain",       duration: 500 },
];

export const CAPTURE_LABELS: Record<CaptureKind, string> = {
  "record-lecture":  "Record Lecture",
  "scan-board":      "Scan Board",
  "scan-textbook":   "Scan Textbook",
  "upload-file":     "Upload File",
  "quick-note":      "Quick Note",
  "professor-hint":  "Professor Hint",
  "ask-brain":       "Ask Campus Brain",
};

/** Simulated concept extraction — replaced by real STT/OCR later. */
function simulateConcepts(kind: CaptureKind, ctx: CaptureContext): string[] {
  const cls = classes.find((c) => c.id === ctx.classId);
  const base = ctx.topic || cls?.currentTopic || "Core concepts";
  const seed = [
    base,
    `${base} — key definitions`,
    `${base} — worked examples`,
  ];
  if (kind === "professor-hint") return [`Professor emphasis: ${base}`];
  if (kind === "quick-note")     return [base];
  if (kind === "ask-brain")      return [`Question about ${base}`];
  return seed;
}

function simulateSummary(kind: CaptureKind, ctx: CaptureContext): string {
  const cls = classes.find((c) => c.id === ctx.classId);
  const topic = ctx.topic || cls?.currentTopic || "today's material";
  switch (kind) {
    case "record-lecture":
      return `Lecture on ${topic} — 3 key ideas surfaced, linked to ${cls?.name}.`;
    case "scan-board":
      return `Board notes on ${topic} — diagrams extracted, terms indexed.`;
    case "scan-textbook":
      return `Textbook pages on ${topic} — summary + practice hooks generated.`;
    case "upload-file":
      return `File processed for ${cls?.name} — content added to your study set.`;
    case "quick-note":
      return `Note captured: ${(ctx.text ?? "").slice(0, 120)}`;
    case "professor-hint":
      return `Hint stored: ${(ctx.text ?? "").slice(0, 120)}`;
    case "ask-brain":
      return `Question queued for Campus Brain: ${(ctx.text ?? "").slice(0, 120)}`;
  }
}

function loadStore(): CaptureResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStore(items: CaptureResult[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, 200)));
}

export function listCaptures(): CaptureResult[] {
  return loadStore();
}

/**
 * Persist the capture locally + feed the Student Model / Campus
 * Brain via `contributeStudySignal`. Anything more expensive
 * (uploads, transcription) hangs off this seam later.
 */
export async function commitCapture(
  kind: CaptureKind,
  context: CaptureContext,
): Promise<CaptureResult> {
  const cls = classes.find((c) => c.id === context.classId);
  const topicName = context.topic || cls?.currentTopic || "General";

  const result: CaptureResult = {
    id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    context,
    createdAt: new Date().toISOString(),
    keyConcepts: simulateConcepts(kind, context),
    summary: simulateSummary(kind, context),
    flashcardCount: kind === "quick-note" || kind === "ask-brain" ? 0 : 6,
  };

  saveStore([result, ...loadStore()]);

  // Notify any listening surface (e.g. Class Memory) so newly captured
  // items can appear without a full refresh.
  try {
    window.dispatchEvent(
      new CustomEvent("capture:committed", { detail: result }),
    );
  } catch {
    /* non-browser env */
  }

  // Mirror to Supabase — non-blocking, gracefully falls back to the
  // local store if the write fails. Import kept lazy so the module
  // stays testable without the Supabase client in scope.
  void (async () => {
    try {
      const { persistCaptureResult } = await import(
        "@/lib/supabase/capturePersistence"
      );
      await persistCaptureResult(result);
    } catch {
      /* offline / not configured — local store is source of truth */
    }
  })();

  // Feed the topic-level signal used by the aggregate intelligence.
  try {
    await contributeStudySignal({
      classId: context.classId,
      topicId: topicName,
      topicName,
      starred: kind === "professor-hint",
      timeSpentMinutes: kind === "record-lecture" ? 45 : 5,
      sourceType: `capture:${kind}`,
      sourceId: result.id,
    });
  } catch {
    /* offline / anon — fine for now */
  }

  return result;
}

