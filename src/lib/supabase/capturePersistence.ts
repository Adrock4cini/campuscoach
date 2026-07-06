/**
 * Quick Capture — Supabase persistence layer.
 *
 * The rest of the app talks to this module, never to the Supabase
 * client directly, so the mock/demo UI keeps working when Supabase
 * is unreachable or the tables are empty. Every function follows the
 * same shape:
 *
 *   1. Try the live write / read.
 *   2. On failure, log and return `null` (or `[]`) so callers can
 *      fall back to their local store.
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
  // eslint-disable-next-line no-console
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

function rowToCapture(row: any): PersistedCapture {
  const processed = Array.isArray(row.processed_content)
    ? row.processed_content[0]
    : row.processed_content;
  return {
    id: row.id,
    kind: row.kind,
    clientClassId: row.client_class_id,
    topic: row.topic,
    processingStatus: row.processing_status,
    flashcardsReady: !!row.flashcards_ready,
    createdAt: row.created_at,
    summary: processed?.summary ?? null,
    keyConcepts: processed?.key_concepts ?? [],
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
      .select("*, processed_content(summary, key_concepts)")
      .eq("user_id", getAnonUserId())
      .eq("client_class_id", clientClassId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      warn("getCapturesForClass", error);
      return [];
    }
    return data.map(rowToCapture);
  } catch (err) {
    warn("getCapturesForClass.catch", err);
    return [];
  }
}

export async function getRecentCaptures(
  limit = 20
): Promise<PersistedCapture[]> {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select("*, processed_content(summary, key_concepts)")
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
  return saveCapture({
    localId: result.id,
    kind: result.kind,
    clientClassId: result.context.classId,
    topic: result.context.topic,
    capturedOn: result.context.date,
    rawText: result.context.text,
    processingStatus: "ready",
    flashcardsReady: result.flashcardCount > 0,
    keyConcepts: result.keyConcepts,
    summary: result.summary,
    meta: { flashcardCount: result.flashcardCount },
  });
}
