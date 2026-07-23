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
import { createAssignment } from "@/lib/realData/assignments";
import {
  buildCaptureStoragePath,
  hashCaptureImage,
  validateCaptureImages,
} from "@/lib/capture/imageCapture";

const CAPTURE_SOURCE_BUCKET = "capture-sources";

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
  assignmentId?: string | null;
  examId?: string | null;
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
  materials: PersistedMaterial[];
}

export interface PersistedMaterial {
  id: string;
  storagePath: string;
  mimeType: string | null;
  originalName: string | null;
  pageIndex: number | null;
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
        assignment_id: input.assignmentId ?? null,
        exam_id: input.examId ?? null,
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
  materials?: MaterialQueryRow[] | null;
}

interface ProcessedContentRow {
  summary: string | null;
  key_concepts: unknown;
  model?: string | null;
  created_at?: string | null;
}

interface MaterialQueryRow {
  id: string;
  storage_path: string | null;
  mime_type: string | null;
  original_name: string | null;
  page_index: number | null;
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
    materials: (row.materials ?? [])
      .filter((material) => !!material.storage_path)
      .map((material) => ({
        id: material.id,
        storagePath: material.storage_path!,
        mimeType: material.mime_type,
        originalName: material.original_name,
        pageIndex: material.page_index,
      }))
      .sort((a, b) => (a.pageIndex ?? 0) - (b.pageIndex ?? 0)),
  };
}

export async function getCapturesForClass(
  clientClassId: string,
  limit = 25
): Promise<PersistedCapture[]> {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select("*, processed_content(summary, key_concepts, model, created_at), materials(id, storage_path, mime_type, original_name, page_index)")
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
      .select("*, processed_content(summary, key_concepts, model, created_at), materials(id, storage_path, mime_type, original_name, page_index)")
      .eq("user_id", getAnonUserId())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!data) throw new Error("Capture query returned no data");
    return data.map(rowToCapture);
  } catch (err) {
    warn("getRecentCaptures.catch", err);
    throw err;
  }
}

/**
 * Convenience: given a completed local `CaptureResult`, mirror it to
 * Supabase. Called from `commitCapture` — never throws.
 */
export async function persistCaptureResult(
  result: CaptureResult,
  attachments: File[] = [],
): Promise<string | null> {
  const rawText = (result.context.text ?? "").trim();
  const hasImages = attachments.length > 0;
  if (hasImages) {
    const validation = validateCaptureImages(attachments);
    if (!validation.ok) throw new Error(validation.message ?? "These photos cannot be uploaded.");
  }
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
  const needsExtraction = rawText.length > 0 && !hasDerivedContent && !hasImages;
  let assignmentId = result.context.assignmentId ?? null;
  if (result.kind === "scan-assignment" && !assignmentId) {
    const title = result.context.assignmentTitle?.trim();
    if (!title) throw new Error("Add an assignment name before saving.");
    const assignment = await createAssignment(getAnonUserId(), {
      title,
      clientClassId: result.context.classId,
      dueDate: result.context.assignmentDueDate ?? null,
      notes: "Created from Assignment Capture",
    });
    if (!assignment) throw new Error("We couldn't create this assignment. Try again.");
    assignmentId = assignment.id;
    result.context.assignmentId = assignment.id;
  }

  await assertCaptureTargets({
    clientClassId: result.context.classId,
    assignmentId,
    examId: result.context.examId ?? null,
  });

  const captureId = await saveCapture({
    localId: result.id,
    kind: result.kind,
    clientClassId: result.context.classId,
    topic: result.context.topic,
    capturedOn: result.context.date,
    rawText: result.context.text,
    processingStatus: (needsExtraction || hasImages) ? "processing" : "ready",
    flashcardsReady: result.flashcardCount > 0,
    keyConcepts: hasDerivedContent ? result.keyConcepts : undefined,
    summary: hasDerivedContent ? result.summary : undefined,
    meta: {
      flashcardCount: result.flashcardCount,
      sourceImageCount: attachments.length,
      assignmentTitle: result.context.assignmentTitle ?? null,
    },
    assignmentId,
    examId: result.context.examId ?? null,
  });

  if (captureId && hasImages) {
    let materialIds: string[];
    try {
      if (!hasAuthenticatedSession) throw new Error("Authenticated image processing session unavailable");
      materialIds = await uploadCaptureImages(captureId, attachments);
    } catch (err) {
      warn("persistCaptureResult.upload", err);
      await supabase
        .from("captures")
        .delete()
        .eq("id", captureId)
        .eq("user_id", getAnonUserId());
      await supabase
        .from("campus_brain_signals")
        .delete()
        .eq("user_id", getAnonUserId())
        .eq("source_id", captureId);
      throw new Error("We couldn't upload these photos. They are still on this screen—check your connection and try again.");
    }

    try {
      const imageStatus = await invokeImageProcessing(captureId, materialIds);
      result.processingStatus = imageStatus;
      if (imageStatus === "ready") {
        dispatchConceptsExtracted(captureId);
      } else {
        result.processingMessage = "Campus Brain is already reading these pages.";
      }
    } catch (err) {
      warn("persistCaptureResult.process-images", err);
      await setCaptureProcessingStatus(captureId, "failed");
      result.processingStatus = "failed";
      result.processingMessage = "Your photos are private and saved, but Campus Brain couldn't finish reading them.";
    }
  }

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

async function assertCaptureTargets(input: {
  clientClassId: string;
  assignmentId: string | null;
  examId: string | null;
}): Promise<void> {
  const userId = getAnonUserId();
  if (input.assignmentId) {
    const { data, error } = await supabase
      .from("assignments")
      .select("id")
      .eq("id", input.assignmentId)
      .eq("user_id", userId)
      .eq("client_class_id", input.clientClassId)
      .maybeSingle();
    if (error || !data) throw new Error("That assignment does not belong to this class.");
  }
  if (input.examId) {
    const { data, error } = await supabase
      .from("exams")
      .select("id")
      .eq("id", input.examId)
      .eq("user_id", userId)
      .eq("client_class_id", input.clientClassId)
      .maybeSingle();
    if (error || !data) throw new Error("That test does not belong to this class.");
  }
}

async function uploadCaptureImages(captureId: string, files: File[]): Promise<string[]> {
  const userId = getAnonUserId();
  const materialIds: string[] = [];
  const newlyUploadedPaths: string[] = [];

  try {
    for (let pageIndex = 0; pageIndex < files.length; pageIndex += 1) {
      const file = files[pageIndex];
      const contentHash = await hashCaptureImage(file);
      const { data: duplicate, error: duplicateError } = await supabase
        .from("materials")
        .select("storage_path")
        .eq("user_id", userId)
        .eq("content_hash", contentHash)
        .not("storage_path", "is", null)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw duplicateError;

      const storagePath = duplicate?.storage_path
        ?? buildCaptureStoragePath(userId, captureId, file, contentHash);
      if (!duplicate?.storage_path) {
        const { error: uploadError } = await supabase.storage
          .from(CAPTURE_SOURCE_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        newlyUploadedPaths.push(storagePath);
      }

      const { data: material, error: materialError } = await supabase
        .from("materials")
        .insert({
          capture_id: captureId,
          user_id: userId,
          kind: "image",
          storage_path: storagePath,
          mime_type: file.type,
          size_bytes: file.size,
          content_hash: contentHash,
          original_name: file.name,
          page_index: pageIndex,
          visibility: "private",
          anonymized: false,
        })
        .select("id")
        .maybeSingle();
      if (materialError || !material) {
        throw materialError ?? new Error("Image link could not be saved.");
      }
      materialIds.push(material.id);
    }
  } catch (error) {
    await supabase
      .from("materials")
      .delete()
      .eq("capture_id", captureId)
      .eq("user_id", userId);
    if (newlyUploadedPaths.length) {
      await supabase.storage.from(CAPTURE_SOURCE_BUCKET).remove(newlyUploadedPaths);
    }
    throw error;
  }

  return materialIds;
}

async function invokeImageProcessing(
  captureId: string,
  materialIds: string[],
): Promise<"processing" | "ready"> {
  const { data, error } = await supabase.functions.invoke("process-capture-images", {
    body: { captureId, materialIds },
  });
  const response = data as { ok?: boolean; processing?: boolean; error?: string; message?: string } | null;
  if (error || response?.ok !== true) {
    throw error ?? new Error(response?.message ?? response?.error ?? "Image processing failed");
  }
  return response.processing ? "processing" : "ready";
}

export async function createCaptureSourceUrls(
  paths: string[],
  expiresIn = 300,
): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage
    .from(CAPTURE_SOURCE_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error) throw error;
  return (data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => !!url);
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

export async function retryCaptureImages(
  captureId: string,
  materialIds: string[],
): Promise<void> {
  if (!materialIds.length) throw new Error("This capture has no saved images to process.");
  await setCaptureProcessingStatus(captureId, "processing");
  try {
    const status = await invokeImageProcessing(captureId, materialIds);
    if (status === "ready") dispatchConceptsExtracted(captureId);
  } catch (err) {
    await setCaptureProcessingStatus(captureId, "failed");
    throw err;
  }
}
