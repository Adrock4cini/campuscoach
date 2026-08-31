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
import {
  AUTH_OWNER_CHANGED_MESSAGE,
  getAnonUserId,
  getAuthenticatedUserId,
} from "@/hooks/useClassIntelligence";
import type { CaptureKind, CaptureResult } from "@/lib/capture/types";
import { createAssignmentAttempt } from "@/lib/realData/assignments";
import {
  buildCaptureStoragePath,
  hashCaptureImage,
  validateCaptureImages,
} from "@/lib/capture/imageCapture";
import { todayDateKey } from "@/lib/calendar/dateKey";
import {
  assignmentPracticeSourceFromCaptureRow,
  assignmentPracticeSourceFromUnknown,
  type AssignmentPracticeSource,
} from "@/lib/assignments/assignmentPracticeSource";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

const CAPTURE_SOURCE_BUCKET = "capture-sources";

class CaptureSourceRetryConflictError extends Error {
  constructor() {
    super("This capture was already saved with different photos. Open the saved capture or start a new one.");
    this.name = "CaptureSourceRetryConflictError";
  }
}

class CaptureRequestRetryConflictError extends Error {
  constructor() {
    super("This capture retry no longer matches the saved capture. Open the saved capture or start a new one.");
    this.name = "CaptureRequestRetryConflictError";
  }
}

function isExistingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = String(record.statusCode ?? record.status ?? "");
  const message = String(record.message ?? record.error ?? "").toLowerCase();
  return status === "409"
    || message.includes("already exists")
    || message.includes("duplicate");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface CapturePersistInput {
  localId: string;
  kind: CaptureKind;
  clientClassId: string;
  classUuid: string;
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
  assignmentId: string | null;
  clientClassId: string | null;
  topic: string | null;
  processingStatus: string;
  flashcardsReady: boolean;
  createdAt: string;
  capturedOn: string;
  summary: string | null;
  keyConcepts: string[];
  rawText: string | null;
  practiceSource?: AssignmentPracticeSource;
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

function warn(scope: string, err: unknown) {
  // Never throw from persistence — the UI must keep working.
  console.warn(`[capturePersistence:${scope}]`, err);
}

function isOwnerMismatchError(error: unknown): boolean {
  return error instanceof Error && error.message === AUTH_OWNER_CHANGED_MESSAGE;
}

function assertActiveCaptureOwner(ownerId: string): void {
  if (getAuthenticatedUserId() !== ownerId) {
    throw new Error(AUTH_OWNER_CHANGED_MESSAGE);
  }
}

async function assertAuthenticatedSessionOwner(ownerId: string): Promise<void> {
  assertActiveCaptureOwner(ownerId);
  try {
    const { data, error } = await supabase.auth.getSession();
    if (
      error ||
      !data.session?.access_token ||
      data.session.user.id !== ownerId
    ) {
      throw new Error(AUTH_OWNER_CHANGED_MESSAGE);
    }
  } catch (error) {
    if (isOwnerMismatchError(error)) throw error;
    warn("assertAuthenticatedSessionOwner", error);
    throw new Error(AUTH_OWNER_CHANGED_MESSAGE);
  }
  assertActiveCaptureOwner(ownerId);
}

async function rollbackCreatedAssignment(
  assignmentId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", assignmentId)
      .eq("user_id", userId);
    if (error) {
      warn("rollbackCreatedAssignment", error);
      return false;
    }
    return true;
  } catch (error) {
    warn("rollbackCreatedAssignment.catch", error);
    return false;
  }
}

async function resolveCaptureClass(
  clientClassId: string,
  userId: string,
): Promise<string> {
  assertActiveCaptureOwner(userId);
  const { data, error } = await supabase
    .from("classes")
    .select("id")
    .eq("user_id", userId)
    .eq("client_class_id", clientClassId)
    .is("source_archived_at", null)
    .maybeSingle();
  assertActiveCaptureOwner(userId);
  if (error || !data?.id) {
    throw new Error("That class is no longer available.");
  }
  return data.id;
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
  input: CapturePersistInput,
  userId: string,
): Promise<string | null> {
  try {
    assertActiveCaptureOwner(userId);
    const requestIdentity = {
      user_id: userId,
      class_id: input.classUuid,
      client_class_id: input.clientClassId,
      kind: input.kind,
      topic: input.topic ?? null,
      chapter: input.chapter ?? null,
      captured_on: input.capturedOn ?? todayDateKey(),
      raw_text: input.rawText ?? null,
      processing_status: input.processingStatus ?? "ready",
      flashcards_ready: input.flashcardsReady ?? false,
      local_id: input.localId,
      meta: input.meta ?? {},
      assignment_id: input.assignmentId ?? null,
      exam_id: input.examId ?? null,
    };
    const requestFingerprint = await sha256Text(stableJson(requestIdentity));
    const captureValues = {
      ...requestIdentity,
      meta: {
        ...requestIdentity.meta,
        captureRequestFingerprint: requestFingerprint,
      } as never,
    };
    const inserted = await supabase
      .from("captures")
      .insert(captureValues)
      .select("id")
      .maybeSingle();
    let captureId = inserted.data?.id ?? null;
    let captureError = inserted.error;

    // A lost insert response can be retried without reopening protected source
    // fields. Reuse the already-owned row instead of issuing an UPDATE-style
    // upsert that could roll a server-processed capture backward.
    if (captureError?.code === "23505") {
      const recovered = await supabase
        .from("captures")
        .select("id, meta")
        .eq("user_id", userId)
        .eq("local_id", input.localId)
        .maybeSingle();
      if (recovered.error || !recovered.data) {
        captureError = recovered.error ?? captureError;
        captureId = null;
      } else {
        const recoveredMeta = recovered.data.meta;
        const savedFingerprint = recoveredMeta
          && typeof recoveredMeta === "object"
          && !Array.isArray(recoveredMeta)
          ? (recoveredMeta as Record<string, unknown>).captureRequestFingerprint
          : null;
        if (savedFingerprint !== requestFingerprint) {
          throw new CaptureRequestRetryConflictError();
        }
        captureId = recovered.data.id;
        captureError = null;
      }
    }

    assertActiveCaptureOwner(userId);
    if (captureError || !captureId) {
      warn("saveCapture.insert", captureError);
      return null;
    }

    // Best-effort: write processed output alongside.
    if (input.summary || (input.keyConcepts && input.keyConcepts.length)) {
      assertActiveCaptureOwner(userId);
      const { error: pcErr } = await supabase.from("processed_content").insert({
        capture_id: captureId,
        user_id: userId,
        summary: input.summary ?? null,
        key_concepts: input.keyConcepts ?? [],
        model: `mock-v1:${requestFingerprint}`,
      });
      if (pcErr && pcErr.code !== "23505") warn("saveCapture.processed", pcErr);
    }

    // Feed the Campus Brain signal log so the Student Model can
    // rehydrate from history without replaying UI events.
    assertActiveCaptureOwner(userId);
    await saveCampusBrainSignal({
      clientClassId: input.clientClassId,
      sourceType: `capture:${input.kind}`,
      sourceId: captureId,
      topic: input.topic ?? null,
      weight: 1,
      payload: {
        summary: input.summary,
        keyConcepts: input.keyConcepts,
        flashcardsReady: input.flashcardsReady,
      },
    }, userId);
    assertActiveCaptureOwner(userId);

    return captureId;
  } catch (err) {
    if (isOwnerMismatchError(err) || err instanceof CaptureRequestRetryConflictError) throw err;
    warn("saveCapture.catch", err);
    return null;
  }
}

/** Log a high-level Campus Brain event. Non-throwing. */
export async function saveCampusBrainSignal(
  input: CampusBrainSignalInput,
  userId: string,
): Promise<boolean> {
  try {
    assertActiveCaptureOwner(userId);
    const payload = {
      user_id: userId,
      client_class_id: input.clientClassId ?? null,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      topic: input.topic ?? null,
      weight: input.weight ?? 1,
      payload: (input.payload ?? {}) as never,
    };
    const { error } = input.sourceId
      ? await supabase
          .from("campus_brain_signals")
          .upsert(payload, { onConflict: "user_id,source_type,source_id" })
      : await supabase.from("campus_brain_signals").insert(payload);
    assertActiveCaptureOwner(userId);
    if (error) {
      warn("saveCampusBrainSignal", error);
      return false;
    }
    return true;
  } catch (err) {
    if (isOwnerMismatchError(err)) throw err;
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
  assignment_id: string | null;
  client_class_id: string | null;
  topic: string | null;
  processing_status: string;
  flashcards_ready: boolean;
  created_at: string;
  captured_on: string;
  raw_text: string | null;
  practice_source_status?: unknown;
  practice_source_text?: unknown;
  practice_source_version?: unknown;
  practice_source_hash?: unknown;
  practice_source_confirmed_at?: unknown;
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
    const aReal = a.model && !a.model.startsWith("mock-v1") ? 1 : 0;
    const bReal = b.model && !b.model.startsWith("mock-v1") ? 1 : 0;
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
    assignmentId: row.assignment_id,
    clientClassId: row.client_class_id,
    topic: row.topic,
    processingStatus: row.processing_status,
    flashcardsReady: !!row.flashcards_ready,
    createdAt: row.created_at,
    capturedOn: row.captured_on,
    summary: processed?.summary ?? null,
    keyConcepts,
    rawText: row.raw_text,
    practiceSource: assignmentPracticeSourceFromCaptureRow(
      row as unknown as Record<string, unknown>,
      row.kind,
    ),
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

export async function getCaptureById(captureId: string): Promise<PersistedCapture | null> {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select("*, processed_content(summary, key_concepts, model, created_at), materials(id, storage_path, mime_type, original_name, page_index)")
      .eq("user_id", getAnonUserId())
      .eq("id", captureId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToCapture(data as CaptureQueryRow) : null;
  } catch (err) {
    warn("getCaptureById.catch", err);
    throw err;
  }
}

export async function getLatestCaptureForAssignment(
  assignmentId: string,
): Promise<PersistedCapture | null> {
  try {
    const { data, error } = await supabase
      .from("captures")
      .select("*, processed_content(summary, key_concepts, model, created_at), materials(id, storage_path, mime_type, original_name, page_index)")
      .eq("user_id", getAnonUserId())
      .eq("assignment_id", assignmentId)
      .eq("kind", "scan-assignment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToCapture(data as CaptureQueryRow) : null;
  } catch (err) {
    warn("getLatestCaptureForAssignment.catch", err);
    throw err;
  }
}

/**
 * Convenience: given a completed local `CaptureResult`, mirror it to
 * Supabase. Called from `commitCapture`. A durable insert failure returns
 * `null`; invalid inputs and incomplete photo uploads throw so the UI can
 * keep the student's original input visible for a retry.
 */
export async function persistCaptureResult(
  result: CaptureResult,
  attachments: File[] = [],
  userId: string,
): Promise<string | null> {
  await assertAuthenticatedSessionOwner(userId);
  const rawText = (result.context.text ?? "").trim();
  const hasImages = attachments.length > 0;
  if (hasImages) {
    const validation = validateCaptureImages(attachments);
    if (!validation.ok) throw new Error(validation.message ?? "These photos cannot be uploaded.");
  }
  // Simulated demo results already contain derived concepts. A real capture
  // arrives with no concepts and must remain "processing" until the edge
  // function confirms that durable concepts and mastery rows exist.
  const hasDerivedContent = result.keyConcepts.length > 0 || result.flashcardCount > 0;
  const needsExtraction = rawText.length > 0 && !hasDerivedContent && !hasImages;
  const classUuid = await resolveCaptureClass(result.context.classId, userId);
  let assignmentId = result.context.assignmentId ?? null;
  let createdAssignmentId: string | null = null;
  if (result.kind === "scan-assignment" && !assignmentId) {
    assertActiveCaptureOwner(userId);
    const title = result.context.assignmentTitle?.trim();
    if (!title) throw new Error("Add an assignment name before saving.");
    const assignmentAttempt = await createAssignmentAttempt(userId, {
      id: result.id,
      title,
      clientClassId: result.context.classId,
      classUuid,
      dueDate: result.context.assignmentDueDate ?? null,
      notes: "Created from Assignment Capture",
    });
    if (assignmentAttempt.conflict) {
      throw new Error("This assignment retry no longer matches the saved assignment. Open the saved assignment or start a new capture.");
    }
    const assignment = assignmentAttempt.assignment;
    if (!assignment) throw new Error("We couldn't create this assignment. Try again.");
    assertActiveCaptureOwner(userId);
    assignmentId = assignment.id;
    if (assignmentAttempt.created) createdAssignmentId = assignment.id;
  }

  try {
    await assertCaptureTargets({
      clientClassId: result.context.classId,
      classUuid,
      assignmentId,
      examId: result.context.examId ?? null,
    }, userId);
  } catch (error) {
    if (createdAssignmentId) {
      await rollbackCreatedAssignment(createdAssignmentId, userId);
    }
    throw error;
  }

  let captureId: string | null;
  try {
    captureId = await saveCapture({
      localId: result.id,
      kind: result.kind,
      clientClassId: result.context.classId,
      classUuid,
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
    }, userId);
  } catch (error) {
    if (createdAssignmentId) await rollbackCreatedAssignment(createdAssignmentId, userId);
    throw error;
  }

  if (!captureId) {
    if (createdAssignmentId) {
      await rollbackCreatedAssignment(createdAssignmentId, userId);
    }
    return null;
  }
  assertActiveCaptureOwner(userId);
  // Surface the durable ids so a failed capture can be retried from the
  // confirmation screen instead of forcing a trip through the class page.
  result.captureId = captureId;

  if (hasImages) {
    let materialIds: string[];
    try {
      materialIds = await uploadCaptureImages(captureId, attachments, userId);
      result.materialIds = materialIds;
    } catch (err) {
      if (isOwnerMismatchError(err)) throw err;
      // A changed retry must never tear down the already-durable capture or its
      // original immutable source. The student can open that capture or begin a
      // new attempt with the changed pages.
      if (err instanceof CaptureSourceRetryConflictError) throw err;
      warn("persistCaptureResult.upload", err);
      // Never tear down a durable capture from the browser. A dropped response
      // or concurrent exact retry may already have adopted its rows/objects.
      // Partial sources remain retryable and bounded; the fenced orphan worker
      // removes only bytes that never receive a material commit.
      throw new Error("We couldn't upload these photos. They are still on this screen—check your connection and try again.");
    }

    try {
      const imageResult = await invokeImageProcessing(captureId, materialIds, userId);
      result.processingStatus = imageResult.processingStatus;
      result.practiceSource = imageResult.practiceSource;
      if (imageResult.processingStatus === "ready") {
        dispatchConceptsExtracted(captureId);
      } else {
        result.processingMessage = "Campus Brain is already reading these pages.";
      }
    } catch (err) {
      if (isOwnerMismatchError(err)) throw err;
      warn("persistCaptureResult.process-images", err);
      result.processingStatus = "failed";
      result.processingMessage = "Your photos are private and saved, but Campus Brain couldn't finish reading them.";
    }
  }

  if (needsExtraction) {
    try {
      const extraction = await invokeConceptExtraction({
        captureId,
        clientClassId: result.context.classId,
        topic: result.context.topic ?? null,
        kind: result.kind,
        rawText,
      }, userId);
      result.processingStatus = extraction.processingStatus;
      if (extraction.practiceSource) result.practiceSource = extraction.practiceSource;
      if (extraction.processingStatus === "ready") {
        dispatchConceptsExtracted(captureId);
      } else {
        result.processingMessage = "Campus Brain is already working on this note.";
      }
    } catch (err) {
      if (isOwnerMismatchError(err)) throw err;
      warn("persistCaptureResult.extract", err);
      result.processingStatus = "failed";
      result.processingMessage = "Your note is safe, but Campus Brain couldn't finish processing it.";
    }
  }

  assertActiveCaptureOwner(userId);
  if (createdAssignmentId) result.context.assignmentId = createdAssignmentId;
  return captureId;
}

async function assertCaptureTargets(input: {
  clientClassId: string;
  classUuid: string;
  assignmentId: string | null;
  examId: string | null;
}, userId: string): Promise<void> {
  assertActiveCaptureOwner(userId);
  if (input.assignmentId) {
    // Ownership is anchored on the stable `client_class_id`. Older rows were
    // created before the class UUID column existed, so a NULL `class_id` is
    // missing plumbing — never proof that the assignment belongs elsewhere.
    const { data, error } = await supabase
      .from("assignments")
      .select("id, class_id")
      .eq("id", input.assignmentId)
      .eq("user_id", userId)
      .eq("client_class_id", input.clientClassId)
      .is("source_archived_at", null)
      .maybeSingle();
    assertActiveCaptureOwner(userId);
    // A failed read is not a boundary violation. Saying "does not belong to
    // this class" for a dropped request teaches the student to distrust a
    // correct choice.
    if (error) throw new Error("We couldn't check this assignment. Check your connection and try again.");
    if (!data || (data.class_id !== null && data.class_id !== input.classUuid)) {
      throw new Error("That assignment does not belong to this class.");
    }
  }
  if (input.examId) {
    assertActiveCaptureOwner(userId);
    const { data, error } = await supabase
      .from("exams")
      .select("id, class_id")
      .eq("id", input.examId)
      .eq("user_id", userId)
      .eq("client_class_id", input.clientClassId)
      .is("source_archived_at", null)
      .maybeSingle();
    assertActiveCaptureOwner(userId);
    if (error) throw new Error("We couldn't check this test. Check your connection and try again.");
    if (!data || (data.class_id !== null && data.class_id !== input.classUuid)) {
      throw new Error("That test does not belong to this class.");
    }
  }
}


async function uploadCaptureImages(
  captureId: string,
  files: File[],
  userId: string,
): Promise<string[]> {
  assertActiveCaptureOwner(userId);
  const materialIds: string[] = [];

  for (let pageIndex = 0; pageIndex < files.length; pageIndex += 1) {
      assertActiveCaptureOwner(userId);
      const file = files[pageIndex];
      const contentHash = await hashCaptureImage(file);
      assertActiveCaptureOwner(userId);
      // Every physical source stays under the capture that introduced it.
      // Cross-capture hash reuse would make retention, per-capture quotas, and
      // deletion provenance ambiguous, so deduplication is intentionally
      // limited to this deterministic exact-retry path.
      const storagePath = buildCaptureStoragePath(userId, captureId, file, contentHash);
      const { error: uploadError } = await supabase.storage
        .from(CAPTURE_SOURCE_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          // Capture bytes are append-only. A lost successful response is
          // recovered from the exact deterministic path; it is never
          // repaired by overwriting the object.
          upsert: false,
        });
      assertActiveCaptureOwner(userId);
      if (uploadError && !isExistingStorageObjectError(uploadError)) throw uploadError;

      const materialValues = {
        capture_id: captureId,
        user_id: userId,
        kind: "image",
        storage_path: storagePath,
        mime_type: file.type.toLowerCase(),
        size_bytes: file.size,
        content_hash: contentHash,
        original_name: file.name,
        page_index: pageIndex,
        visibility: "private",
        anonymized: false,
      };
      let { data: material, error: materialError } = await supabase
        .from("materials")
        .insert(materialValues)
        .select("id, capture_id, user_id, kind, storage_path, mime_type, size_bytes, content_hash, original_name, page_index, visibility, anonymized")
        .maybeSingle();
      assertActiveCaptureOwner(userId);

      if (materialError || !material) {
        // The insert response may be lost after commit. Reconcile only an
        // exact row at this capture/page key; a different file is a changed
        // request and must never update or delete the first source.
        const recovered = await supabase
          .from("materials")
          .select("id, capture_id, user_id, kind, storage_path, mime_type, size_bytes, content_hash, original_name, page_index, visibility, anonymized")
          .eq("user_id", userId)
          .eq("capture_id", captureId)
          .eq("page_index", pageIndex)
          .maybeSingle();
        assertActiveCaptureOwner(userId);
        if (recovered.error) throw materialError ?? recovered.error;
        material = recovered.data;
        materialError = null;
      }
      if (!material) {
        throw materialError ?? new Error("Image link could not be saved.");
      }
      const exactRetry = material.capture_id === materialValues.capture_id
        && material.user_id === materialValues.user_id
        && material.kind === materialValues.kind
        && material.storage_path === materialValues.storage_path
        && material.mime_type === materialValues.mime_type
        && material.size_bytes === materialValues.size_bytes
        && material.content_hash === materialValues.content_hash
        && material.original_name === materialValues.original_name
        && material.page_index === materialValues.page_index
        && material.visibility === materialValues.visibility
        && material.anonymized === materialValues.anonymized;
      if (!exactRetry) {
        throw new CaptureSourceRetryConflictError();
      }
      materialIds.push(material.id);
  }

  return materialIds;
}

async function invokeImageProcessing(
  captureId: string,
  materialIds: string[],
  userId?: string,
): Promise<{
  processingStatus: "processing" | "ready";
  practiceSource: AssignmentPracticeSource;
}> {
  if (userId) assertActiveCaptureOwner(userId);
  const { data, error } = await invokeEdgeFunction("process-capture-images", {
    body: { captureId, materialIds },
  });
  if (userId) assertActiveCaptureOwner(userId);
  const response = data as {
    ok?: boolean;
    processing?: boolean;
    error?: string;
    message?: string;
    practiceSource?: unknown;
  } | null;
  if (error || response?.ok !== true) {
    throw error ?? new Error(response?.message ?? response?.error ?? "Image processing failed");
  }
  return {
    processingStatus: response.processing ? "processing" : "ready",
    // Older servers do not return the review fields. Assignment captures then
    // fail closed to a blank review instead of exposing Tutor immediately.
    practiceSource: assignmentPracticeSourceFromUnknown(
      response.practiceSource ?? response,
      "scan-assignment",
    ),
  };
}

export async function createCaptureSourceUrls(
  paths: string[],
  expiresIn = 300,
): Promise<string[]> {
  if (!paths.length) return [];
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) {
    throw new Error("Private capture links may be created for at most five minutes.");
  }
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

async function invokeConceptExtraction(
  input: ConceptExtractionInput,
  userId?: string,
): Promise<{
  processingStatus: "processing" | "ready";
  practiceSource?: AssignmentPracticeSource;
}> {
  if (userId) assertActiveCaptureOwner(userId);
  const { data, error } = await invokeEdgeFunction("extract-concepts", {
    body: {
      captureId: input.captureId,
      clientClassId: input.clientClassId,
      className: null,
      topic: input.topic ?? null,
      kind: input.kind,
      rawText: input.rawText,
    },
  });
  if (userId) assertActiveCaptureOwner(userId);
  const response = data as {
    ok?: boolean;
    processing?: boolean;
    error?: string;
    message?: string;
    practiceSource?: unknown;
  } | null;
  if (error || response?.ok !== true) {
    throw error ?? new Error(response?.message ?? response?.error ?? "Concept extraction failed");
  }
  return {
    processingStatus: response.processing ? "processing" : "ready",
    ...(input.kind === "scan-assignment"
      ? {
          practiceSource: assignmentPracticeSourceFromUnknown(
            response.practiceSource ?? response,
            "scan-assignment",
          ),
        }
      : {}),
  };
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

export interface CaptureProcessingResult {
  processingStatus: "processing" | "ready";
  practiceSource?: AssignmentPracticeSource;
}

export async function retryCaptureConceptsWithResult(
  capture: RetryCaptureInput,
): Promise<CaptureProcessingResult> {
  const rawText = (capture.rawText ?? "").trim();
  if (!rawText && capture.kind !== "scan-assignment") {
    throw new Error("This capture has no source text to process.");
  }
  const userId = getAnonUserId();

  const extraction = await invokeConceptExtraction({
    captureId: capture.id,
    clientClassId: capture.clientClassId,
    topic: capture.topic,
    kind: capture.kind,
    rawText,
  }, userId);
  if (extraction.processingStatus === "ready") dispatchConceptsExtracted(capture.id);
  return extraction;
}

export async function retryCaptureConcepts(
  capture: RetryCaptureInput,
): Promise<"processing" | "ready"> {
  return (await retryCaptureConceptsWithResult(capture)).processingStatus;
}

export async function retryCaptureImagesWithResult(
  captureId: string,
  materialIds: string[],
): Promise<CaptureProcessingResult> {
  if (!materialIds.length) throw new Error("This capture has no saved images to process.");
  const userId = getAnonUserId();
  const result = await invokeImageProcessing(captureId, materialIds, userId);
  if (result.processingStatus === "ready") dispatchConceptsExtracted(captureId);
  return result;
}

export async function retryCaptureImages(
  captureId: string,
  materialIds: string[],
): Promise<"processing" | "ready"> {
  return (await retryCaptureImagesWithResult(captureId, materialIds)).processingStatus;
}

/**
 * Retry one stuck capture by id, from a surface (Study Lab) that only knows
 * the capture id. Text captures rerun concept extraction, image captures rerun
 * OCR. The edge functions own idempotency: if concepts already exist they
 * repair the capture to `ready` without calling paid AI again.
 */
export async function retryCaptureProcessing(
  captureId: string,
): Promise<"processing" | "ready"> {
  const userId = getAnonUserId();
  const { data: capture, error } = await supabase
    .from("captures")
    .select("id, kind, raw_text, client_class_id, topic")
    .eq("id", captureId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !capture) throw new Error("We couldn't find this capture to retry.");

  const rawText = (capture.raw_text ?? "").trim();
  // Assignment OCR is untrusted until the student confirms the exact problem.
  // Image-backed assignments must return to the image worker even when OCR is
  // already present. Typed assignments have no material rows and use the text
  // endpoint's capture-only review-candidate branch below.
  if (capture.kind !== "scan-assignment" && rawText) {
    return retryCaptureConcepts({
      id: capture.id,
      kind: capture.kind,
      clientClassId: capture.client_class_id ?? "",
      topic: capture.topic,
      rawText,
    });
  }

  const { data: materials, error: materialsError } = await supabase
    .from("materials")
    .select("id")
    .eq("capture_id", captureId)
    .eq("user_id", userId)
    .order("page_index", { ascending: true });
  if (materialsError) throw new Error("We couldn't find this capture to retry.");
  const materialIds = (materials ?? []).map((material) => material.id as string);
  if (capture.kind === "scan-assignment" && !materialIds.length && rawText) {
    return retryCaptureConcepts({
      id: capture.id,
      kind: capture.kind,
      clientClassId: capture.client_class_id ?? "",
      topic: capture.topic,
      rawText,
    });
  }
  return retryCaptureImages(captureId, materialIds);
}
