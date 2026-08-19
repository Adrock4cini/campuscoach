/**
 * Capture draft persistence.
 *
 * A student typing a note or lining up a photo can be interrupted at any
 * moment. The typed draft, chosen class, date, and topic survive
 * background/foreground and an ordinary reload. Photos themselves are
 * in-memory `File` handles and cannot be serialised, so the draft records
 * only that photos were pending — the student is told, never silently
 * surprised.
 */

import type { CaptureKind } from "@/lib/capture/types";

export const CAPTURE_DRAFT_KEY = "campus-coach:capture-draft";

export interface CaptureDraft {
  kind: CaptureKind;
  classId: string;
  date: string;
  topic: string;
  text: string;
  /** Photos could not be persisted; the flow re-asks for them. */
  hadPhotos?: boolean;
}

function safeStorage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

export function writeCaptureDraft(draft: CaptureDraft, storage?: Storage | null): void {
  const store = safeStorage(storage);
  if (!store || !draft.kind) return;
  const hasContent = Boolean(draft.text.trim() || draft.classId || draft.hadPhotos);
  if (!hasContent) {
    clearCaptureDraft(store);
    return;
  }
  try {
    store.setItem(CAPTURE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Drafting must keep working even when storage is unavailable.
  }
}

export function clearCaptureDraft(storage?: Storage | null): void {
  try {
    safeStorage(storage)?.removeItem(CAPTURE_DRAFT_KEY);
  } catch {
    // Best effort.
  }
}

export function readCaptureDraft(
  options?: { allowedClassIds?: readonly string[]; storage?: Storage | null },
): CaptureDraft | null {
  const store = safeStorage(options?.storage);
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(CAPTURE_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (!isShortString(record.kind, 60) || !record.kind) return null;
  if (!isShortString(record.classId, 200)) return null;
  if (!isShortString(record.date, 20)) return null;
  if (!isShortString(record.topic, 300)) return null;
  if (!isShortString(record.text, 20000)) return null;

  const allowed = options?.allowedClassIds;
  // A draft pointing at a deleted class must never resurrect that class.
  const classId = allowed && allowed.length > 0 && record.classId && !allowed.includes(record.classId)
    ? ""
    : record.classId;

  return {
    kind: record.kind as CaptureKind,
    classId,
    date: record.date,
    topic: record.topic,
    text: record.text,
    hadPhotos: record.hadPhotos === true,
  };
}
