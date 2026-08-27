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
export const CAPTURE_DRAFT_VERSION = 2;

export type CaptureDraftOwner =
  | { mode: "demo" }
  | { mode: "real"; userId?: string | null };

interface CaptureDraftAccess {
  owner: CaptureDraftOwner;
  storage?: Storage | null;
}

export interface CaptureDraft {
  kind: CaptureKind;
  classId: string;
  date: string;
  topic: string;
  text: string;
  /** Existing assignment/test links must survive a reload with the rest of the context. */
  assignmentId?: string;
  /** Required new-assignment details must survive an interrupted mobile capture. */
  assignmentTitle?: string;
  assignmentDueDate?: string;
  examId?: string;
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

function isOptionalId(value: unknown): value is string | undefined {
  return value === undefined
    || (typeof value === "string" && value.trim().length > 0 && value.length <= 200);
}

function isOptionalShortString(value: unknown, max: number): value is string | undefined {
  return value === undefined || isShortString(value, max);
}

function ownerKey(owner: CaptureDraftOwner): string | null {
  if (owner.mode === "demo") return "demo";
  const userId = owner.userId?.trim();
  return userId && userId.length <= 200 ? `real:${userId}` : null;
}

export function writeCaptureDraft(draft: CaptureDraft, access: CaptureDraftAccess): void {
  const store = safeStorage(access.storage);
  const scopedOwner = ownerKey(access.owner);
  if (!store || !scopedOwner || !draft.kind) return;
  const hasContent = Boolean(
    draft.text.trim()
    || draft.classId
    || draft.assignmentId
    || draft.assignmentTitle?.trim()
    || draft.assignmentDueDate
    || draft.examId
    || draft.hadPhotos,
  );
  if (!hasContent) {
    clearCaptureDraft(store);
    return;
  }
  try {
    store.setItem(CAPTURE_DRAFT_KEY, JSON.stringify({
      version: CAPTURE_DRAFT_VERSION,
      ownerKey: scopedOwner,
      ...draft,
    }));
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
  options: CaptureDraftAccess & { allowedClassIds?: readonly string[] },
): CaptureDraft | null {
  const store = safeStorage(options.storage);
  const scopedOwner = ownerKey(options.owner);
  if (!store || !scopedOwner) return null;
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
  if (record.version !== CAPTURE_DRAFT_VERSION || record.ownerKey !== scopedOwner) return null;
  if (!isShortString(record.kind, 60) || !record.kind) return null;
  if (!isShortString(record.classId, 200)) return null;
  if (!isShortString(record.date, 20)) return null;
  if (!isShortString(record.topic, 300)) return null;
  if (!isShortString(record.text, 20000)) return null;
  if (!isOptionalId(record.assignmentId)) return null;
  if (!isOptionalShortString(record.assignmentTitle, 300)) return null;
  if (!isOptionalShortString(record.assignmentDueDate, 20)) return null;
  if (!isOptionalId(record.examId)) return null;

  const allowed = options.allowedClassIds;
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
    assignmentId: record.assignmentId,
    assignmentTitle: record.assignmentTitle,
    assignmentDueDate: record.assignmentDueDate,
    examId: record.examId,
    hadPhotos: record.hadPhotos === true,
  };
}
