/**
 * Remembers the class a student last captured into.
 *
 * The "pull this out every class" habit dies if the student has to re-pick the
 * same class every single time. We remember the last class they successfully
 * captured into for the browser session only, and we validate it against the
 * classes they actually have on every read, so a deleted or renamed class can
 * never silently poison a future capture.
 */

export const CAPTURE_CLASS_PREFERENCE_KEY = "campus-coach:last-capture-class";

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

export function readLastCaptureClassId(options?: {
  allowedClassIds?: readonly string[];
  storage?: Storage | null;
}): string | null {
  const storage = options?.storage ?? safeStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(CAPTURE_CLASS_PREFERENCE_KEY);
  } catch {
    return null;
  }
  if (!isId(raw)) return null;

  const allowed = options?.allowedClassIds;
  if (allowed && !allowed.includes(raw)) return null;
  return raw;
}

export function writeLastCaptureClassId(
  classId: string,
  storage: Storage | null = safeStorage(),
): void {
  if (!storage || !isId(classId)) return;
  try {
    storage.setItem(CAPTURE_CLASS_PREFERENCE_KEY, classId);
  } catch {
    // A full or blocked session storage must never break capturing.
  }
}

export function clearLastCaptureClassId(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(CAPTURE_CLASS_PREFERENCE_KEY);
  } catch {
    // Best effort only.
  }
}
