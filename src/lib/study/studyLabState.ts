/**
 * Remembers where a student was in Study Lab.
 *
 * ADHD-friendly navigation means leaving Study Lab (to check a note, answer a
 * message, or tap the bottom nav) must not silently dump the student back at
 * an empty default. State is stored per browser session only, is validated on
 * read, and is discarded when it points at a class that no longer exists so a
 * deleted class can never trap the student.
 */

export const STUDY_LAB_STATE_KEY = "campus-coach:study-lab";

export const STUDY_LAB_KINDS = ["flashcards", "multiple_choice", "matching"] as const;
export type StudyLabKind = (typeof STUDY_LAB_KINDS)[number];

export interface StudyLabState {
  classId: string;
  kind: StudyLabKind;
  targetId: string;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isKind(value: unknown): value is StudyLabKind {
  return typeof value === "string" && (STUDY_LAB_KINDS as readonly string[]).includes(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

export function readStudyLabState(options?: {
  allowedClassIds?: readonly string[];
  storage?: Storage | null;
}): StudyLabState | null {
  const storage = options?.storage ?? safeStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(STUDY_LAB_STATE_KEY);
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
  if (!isId(record.classId) || !isKind(record.kind) || !isId(record.targetId)) return null;

  const allowed = options?.allowedClassIds;
  if (allowed && allowed.length > 0 && !allowed.includes(record.classId)) return null;

  return { classId: record.classId, kind: record.kind, targetId: record.targetId };
}

export function writeStudyLabState(
  state: StudyLabState,
  storage: Storage | null = safeStorage(),
): void {
  if (!storage) return;
  if (!isId(state.classId) || !isKind(state.kind) || !isId(state.targetId)) return;
  try {
    storage.setItem(STUDY_LAB_STATE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked session storage must never break studying.
  }
}

export function clearStudyLabState(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(STUDY_LAB_STATE_KEY);
  } catch {
    // Ignore — clearing is best effort.
  }
}
