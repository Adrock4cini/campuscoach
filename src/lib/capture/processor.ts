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
import {
  AUTH_OWNER_CHANGED_MESSAGE,
  contributeStudySignal,
  getAuthenticatedUserId,
} from "@/hooks/useClassIntelligence";
import type {
  CaptureContext,
  CaptureKind,
  CaptureResult,
  ProcessingStep,
} from "./types";

const STORE_KEY = "cc_captures_v1";

/** UUID-shaped because a capture attempt also becomes a deterministic assignment id. */
export function createCaptureAttemptId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function assertCaptureOwner(ownerId: string | undefined): asserts ownerId is string {
  if (!ownerId || getAuthenticatedUserId() !== ownerId) {
    throw new Error(AUTH_OWNER_CHANGED_MESSAGE);
  }
}

export const PROCESSING_STEPS: ProcessingStep[] = [
  { id: "queued",            label: "Campus Brain is processing…", duration: 700 },
  { id: "class-detected",    label: "Class detected",              duration: 550 },
  { id: "concepts-found",    label: "Key concepts found",          duration: 700 },
  { id: "summary-created",   label: "Summary created",             duration: 700 },
  { id: "flashcards-ready",  label: "Flashcards ready",            duration: 650 },
  { id: "added-to-brain",    label: "Saved in this demo",          duration: 500 },
];

export const CAPTURE_LABELS: Record<CaptureKind, string> = {
  "record-lecture":  "Record Lecture",
  "scan-board":      "Scan Board",
  "scan-textbook":   "Scan Textbook",
  "scan-assignment": "Scan Assignment",
  "scan-material":   "Scan Notes or Book",
  "scan-syllabus":   "Scan Syllabus",
  "upload-file":     "Upload File",
  "quick-note":      "Quick Note",
  "professor-hint":  "Teacher Hint",
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
  const classSuffix = cls?.name ? ` for ${cls.name}` : "";
  switch (kind) {
    case "record-lecture":
      return `Lecture on ${topic} saved${classSuffix}.`;
    case "scan-board":
      return `Board notes on ${topic} — diagrams extracted, terms indexed.`;
    case "scan-textbook":
      return `Textbook pages on ${topic} — summary + practice hooks generated.`;
    case "scan-assignment":
      return `Assignment photos saved${classSuffix} — concepts and problem types are being identified.`;
    case "scan-material":
      return `Photos saved${classSuffix} — concepts are being added to Class Memory.`;
    case "scan-syllabus":
      return `Syllabus ready to build your classes and calendar.`;
    case "upload-file":
      return `File processed${classSuffix} — content added to Class Memory.`;
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
 * Persist one capture through an explicit boundary:
 *   - `requireRemotePersistence: true` is the signed-in path. The durable
 *     Supabase write must succeed before the capture is reported as complete,
 *     and remote intelligence signals may follow.
 *   - otherwise the capture is sample/device-local only. It never attempts a
 *     Supabase write or contributes to shared intelligence.
 *
 * Anything more expensive (uploads, transcription) hangs off this seam later.
 */
export async function commitCapture(
  kind: CaptureKind,
  context: CaptureContext,
  options: {
    simulateDerivedContent?: boolean;
    requireRemotePersistence?: boolean;
    attachments?: File[];
    /** Stable for every retry of the same retained CaptureFlow draft. */
    attemptId?: string;
    /** Authenticated account that initiated this capture. */
    ownerId?: string;
  } = {},
): Promise<CaptureResult> {
  const cls = classes.find((c) => c.id === context.classId);
  const topicName = context.topic || cls?.currentTopic || "General";
  const simulateDerivedContent = options.simulateDerivedContent ?? true;
  const remotePersistence = options.requireRemotePersistence === true;
  if (remotePersistence) assertCaptureOwner(options.ownerId);

  const result: CaptureResult = {
    id: options.attemptId ?? createCaptureAttemptId(),
    kind,
    context: { ...context },
    createdAt: new Date().toISOString(),
    // Real accounts must never present placeholder concepts as AI output.
    // Text captures are persisted below and the extraction edge function owns
    // the actual Concepts that follow.
    keyConcepts: simulateDerivedContent ? simulateConcepts(kind, context) : [],
    summary: simulateSummary(kind, context),
    flashcardCount: simulateDerivedContent && kind !== "quick-note" && kind !== "ask-brain" ? 6 : 0,
  };

  const persist = async () => {
    const { persistCaptureResult } = await import(
      "@/lib/supabase/capturePersistence"
    );
    return persistCaptureResult(result, options.attachments ?? [], options.ownerId!);
  };

  if (remotePersistence) {
    try {
      const persistedId = await persist();
      if (!persistedId) throw new Error("Capture persistence returned no id");
      assertCaptureOwner(options.ownerId);
    } catch (error) {
      console.warn("[capture] required Supabase save failed", error);
      const detail = error instanceof Error ? error.message : "";
      const safeDetail = /^(We couldn't upload these photos|These photos cannot be uploaded|Add an assignment name|We couldn't create this assignment|That assignment does not belong|That test does not belong|Your account changed)/.test(detail)
        ? detail
        : "We couldn't save this capture. Check your connection and try again.";
      throw new Error(safeDetail);
    }
  } else {
    // Demo and signed-out captures remain device-local and keep working
    // offline. Do not even attempt a remote write: sample activity must never
    // enter Supabase, aggregates, or class-intelligence signals.
    saveStore([result, ...loadStore()]);
  }

  // Notify any listening surface (e.g. Class Memory) so newly captured
  // items can appear without a full refresh. For real captures this fires
  // only after Supabase confirms the durable write.
  try {
    window.dispatchEvent(
      new CustomEvent("capture:committed", { detail: result }),
    );
  } catch {
    /* non-browser env */
  }

  if (remotePersistence) {
    // Aggregate-safe signal for the shared Campus Brain (counts + labels only).
    void (async () => {
      try {
        const {
          extractAggregateSignalFromCapture,
          updateCampusBrainAggregate,
        } = await import("@/lib/intelligence/aggregateSignals");
        await updateCampusBrainAggregate(
          extractAggregateSignalFromCapture(result),
          options.ownerId,
        );
      } catch {
        /* offline — aggregate layer will backfill later */
      }
    })();

    // Feed the topic-level signal used by the aggregate intelligence.
    void contributeStudySignal({
      classId: context.classId,
      topicId: topicName,
      topicName,
      starred: kind === "professor-hint",
      timeSpentMinutes: kind === "record-lecture" ? 45 : 5,
      sourceType: `capture:${kind}`,
      sourceId: result.id,
      ownerId: options.ownerId,
      idempotent: true,
    })
      .catch(() => undefined);
  }

  return result;
}
