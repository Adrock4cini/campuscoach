/**
 * Quick Capture — Supabase persistence layer.
 *
 * The rest of the app talks to this module, never to the Supabase
 * client directly, so the mock/demo UI keeps working when Supabase
 * is unreachable or the tables are empty. Every function follows the
 * same shape:
 *
 *   1. Try the live write / read.
 *   2. Writes return `null` on failure so callers can preserve unsaved work.
 *      Reads throw so real UI never mistakes a network failure for an empty
 *      student account.
 *
 * When real transcription / OCR / storage upload is wired in, only
 * `saveCapture` grows — the public surface stays the same.
 */

import { supabase } from "@/integrations/supabase/client";
import { getAnonUserId } from "@/hooks/useClassIntelligence";
import type { CaptureKind, CaptureResult } from "@/lib/capture/types";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface CapturePersistInput {
  localId: string;
  kind: CaptureKind;
  clientClassId: string;
  topic?: string;
  chapter?: string;
  capturedOn?: string;      // ISO date
  rawText?: string;
  processingStatus?: "queued" | "processing" | "ready" | "failed";
  flashcardsReady?: boolean;
  keyConcepts?: string[];
  summary?: string;
  meta?: Record<string, unknown>;
}

export interface CampusBrainSignalInput {
  clientClassId?: string | null;
  sourceType: string;                 // e.g. "capture:record-lecture"
  sourceId?: string | null;
  topic?: string | null;
  weight?: number;
  payload?: Record<string, unknown>;
}

export interface PersistedCapture {
  id: string;
  kind: string;
  clientClassId: string | null;
  topic: string | null;
  processingStatus: string;
  flashcardsReady: boolean;
  createdAt: string;
  summary: string | null;
  keyConcepts: string[];
  rawText: string | null;
}

/* ------------------------------------------------------------------ */
/* Internal                                                            */
/* ------------------------------------------------------------------ */

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function warn(scope: string, err: unknown) {
  // Never throw from persistence — the UI must keep working.
  console.warn(`[capturePersistence:${scope}]`, err);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Persist a capture + its (currently mock) processed output.
 * Returns the inserted capture id on success, `null` on failure.
 * Also writes a companion row in `campus_brain_signals` so the
 * Student Model can be rebuilt from history later.
 */
export async function saveCapture(
  input: CapturePersistInput
): Promise<string | null> {
  const userId = getAnonUserId();

  try {
    const { data, error } = await supabase
      .from("captures")
      .insert({
        user_id: userId,
        client_class_id: input.clientClassId,
        kind: input.kind,
        topic: input.topic ?? null,
        chapter: input.chapter ?? null,
        captured_on: input.capturedOn ?? todayISO(),
        raw_text: input.rawText ?? null,
        processing_status: input.processingStatus ?? "ready",
        flashcards_ready: input.flashcardsReady ?? false,
        local_id: input.localId,
        meta: (input.meta ?? {}) as never,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      warn("saveCapture.insert", error);
      return null;
    }

    // Best-effort: write processed output alongside.
    if (input.summary || (input.keyConcepts && input.keyConcepts.length)) {
      const { error: pcErr } = await supabase.from("processed_content").insert({
        capture_id: data.id,
        user_id: userId,
        summary: input.summary ?? null,
        key_concepts: input.keyConcepts ?? [],
        model: "mock-v1",
      });
      if (pcErr) warn("saveCapture.processed", pcErr);
    }

    // Feed the Campus Brain signal log so the Student Model can
    // rehydrate from history without replaying UI events.
    await saveCampusBrainSignal({
      clientClassId: input.clientClassId,
      sourceType: `capture:${input.kind}`,
      sourceId: data.id,
      topic: input.topic ?? null,
      weight: 1,
      payload: {
        summary: input.summary,
        keyConcepts: input.keyConcepts,
        flashcardsReady: input.flashcardsReady,
      },
    });

    return data.id;
  } catch (err) {
    warn("saveCapture.catch", err);
    return null;
  }
}

/** Log a high-level Campus Brain event. Non-throwing. */
export async function saveCampusBrainSignal(
  input: CampusBrainSignalInput
): Promise<boolean> {
  try {
    const { error } = await supabase.from("campus_brain_signals").insert({
      user_id: getAnonUserId(),
      client_class_id: input.clientClassId ?? null,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      topic: input.topic ?? null,
      weight: input.weight ?? 1,
      payload: (input.payload ?? {}) as never,
    });
    if (error) {
      warn("saveCampusBrainSignal", error);
      return false;
    }
    return true;
  } catch (err) {
    warn("saveCampusBrainSignal.catch", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

interface CaptureQueryRow {
  id: string;
  kind: string;
  client_class_id: string | null;
  topic: string | null;
  processing_status: string;
  flashcards_ready: boolean;
  created_at: string;
  raw_text: string | null;
  processed_content:
    | ProcessedContentRow
    | ProcessedContentRow[]
    | null;
}

interface ProcessedContentRow {
  summary: string | null;
  key_concepts: unknown;
  model?: string | null;
  created_at?: string | null;
}

export function selectTrustworthyProcessedContent(
  content: CaptureQueryRow["processed_content"],
): ProcessedContentRow | null {
  const rows = Array.isArray(content) ? content : content ? [content] : [];
  if (!rows.length) return null;

  return [...rows].sort((a, b) => {
    const aReal = a.model && a.model !== "mock-v1" ? 1 : 0;
    const bReal = b.model && b.model !== "mock-v1" ? 1 : 0;
    if (aReal !== bReal) return bReal - aReal;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  })[0];
}

function rowToCapture(row: CaptureQueryRow): PersistedCapture {
  // Older clients wrote a mock summary before the real extractor finished.
  // Prefer a real model row so historical captures repair themselves on read.
  const processed = selectTrustworthyProcessedContent(row.processed_content);
  const keyConcepts = Array.isArray(processed?.key_concepts)
    ? processed.key_concepts.filter((value): value is string => typeof value === "string")
    : [];
  return {
    id: row.id,
    kind: row.kind,
    clientClassId: row.client_class_id,
    topic: row.topic,
    processingStatus: row.processing_status,
    flashcardsReady: !!row.flashcards_ready,
    createdAt: row.created_at,
    summary: processed?.summary ?? null,
    keyConcepts,
    rawText: row.raw_text,
  };
}

export async function getCapturesForClass(
  clientClassId: string,
  limit = 25
): Promise<PersistedCapture[]> {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select("*, processed_content(summary, key_concepts, model, created_at)")
      .eq("user_id", getAnonUserId())
      .eq("client_class_id", clientClassId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!data) throw new Error("Capture query returned no data");
    return data.map(rowToCapture);
  } catch (err) {
    warn("getCapturesForClass.catch", err);
    throw err;
  }
}

export async function getRecentCaptures(
  limit = 20
): Promise<PersistedCapture[]> {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select("*, processed_content(summary, key_concepts, model, created_at)")
      .eq("user_id", getAnonUserId())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      warn("getRecentCaptures", error);
      return [];
    }
    return data.map(rowToCapture);
  } catch (err) {
    warn("getRecentCaptures.catch", err);
    return [];
  }
}

/**
 * Convenience: given a completed local `CaptureResult`, mirror it to
 * Supabase. Called from `commitCapture` — never throws.
 */
export async function persistCaptureResult(
  result: CaptureResult
): Promise<string | null> {
  const rawText = (result.context.text ?? "").trim();
  let hasAuthenticatedSession = false;
  try {
    const { data } = await supabase.auth.getSession();
    hasAuthenticatedSession = Boolean(data.session?.access_token);
  } catch (err) {
    warn("persistCaptureResult.session", err);
  }

  // Simulated demo results already contain derived concepts. A real capture
  // arrives with no concepts and must remain "processing" until the edge
  // function confirms that durable concepts and mastery rows exist.
  const hasDerivedContent = result.keyConcepts.length > 0 || result.flashcardCount > 0;
  const needsExtraction = rawText.length > 0 && !hasDerivedContent;
  const captureId = await saveCapture({
    localId: result.id,
    kind: result.kind,
    clientClassId: result.context.classId,
    topic: result.context.topic,
    capturedOn: result.context.date,
    rawText: result.context.text,
    processingStatus: needsExtraction ? "processing" : "ready",
    flashcardsReady: result.flashcardCount > 0,
    keyConcepts: hasDerivedContent ? result.keyConcepts : undefined,
    summary: hasDerivedContent ? result.summary : undefined,
    meta: { flashcardCount: result.flashcardCount },
  });

  if (captureId && needsExtraction) {
    try {
      if (!hasAuthenticatedSession) throw new Error("Authenticated AI session unavailable");
      const extractionStatus = await invokeConceptExtraction({
        captureId,
        clientClassId: result.context.classId,
        topic: result.context.topic ?? null,
        kind: result.kind,
        rawText,
      });
      result.processingStatus = extractionStatus;
      if (extractionStatus === "ready") {
        dispatchConceptsExtracted(captureId);
      } else {
        result.processingMessage = "Campus Brain is already working on this note.";
      }
    } catch (err) {
      warn("persistCaptureResult.extract", err);
      await setCaptureProcessingStatus(captureId, "failed");
      result.processingStatus = "failed";
      result.processingMessage = "Your note is safe, but Campus Brain couldn't finish processing it.";
    }
  }

  return captureId;
}

interface ConceptExtractionInput {
  captureId: string;
  clientClassId: string;
  topic?: string | null;
  kind: string;
  rawText: string;
}

async function invokeConceptExtraction(input: ConceptExtractionInput): Promise<"processing" | "ready"> {
  const { data, error } = await supabase.functions.invoke("extract-concepts", {
    body: {
      captureId: input.captureId,
      clientClassId: input.clientClassId,
      className: null,
      topic: input.topic ?? null,
      kind: input.kind,
      rawText: input.rawText,
    },
  });
  const response = data as { ok?: boolean; processing?: boolean; error?: string; message?: string } | null;
  if (error || response?.ok !== true) {
    throw error ?? new Error(response?.message ?? response?.error ?? "Concept extraction failed");
  }
  return response.processing ? "processing" : "ready";
}

async function setCaptureProcessingStatus(
  captureId: string,
  status: "processing" | "ready" | "failed",
): Promise<void> {
  const { error } = await supabase
    .from("captures")
    .update({ processing_status: status })
    .eq("id", captureId)
    .eq("user_id", getAnonUserId());
  if (error) warn("setCaptureProcessingStatus", error);
}

function dispatchConceptsExtracted(captureId: string) {
  try {
    window.dispatchEvent(new CustomEvent("concepts:extracted", { detail: { captureId } }));
  } catch {
    /* non-browser */
  }
}

export interface RetryCaptureInput {
  id: string;
  kind: string;
  clientClassId: string;
  topic?: string | null;
  rawText?: string | null;
}

export async function retryCaptureConcepts(capture: RetryCaptureInput): Promise<void> {
  const rawText = (capture.rawText ?? "").trim();
  if (!rawText) throw new Error("This capture has no source text to process.");

  await setCaptureProcessingStatus(capture.id, "processing");
  try {
    const extractionStatus = await invokeConceptExtraction({
      captureId: capture.id,
      clientClassId: capture.clientClassId,
      topic: capture.topic,
      kind: capture.kind,
      rawText,
    });
    if (extractionStatus === "ready") dispatchConceptsExtracted(capture.id);
  } catch (err) {
    await setCaptureProcessingStatus(capture.id, "failed");
    throw err;
  }
}
