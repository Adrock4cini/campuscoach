import type { SetupStatus } from "@/lib/auth/setupStatus";

/**
 * Re-running finished setup is how duplicate classes get created. A completed
 * account only reaches onboarding again with an explicit intent (e.g. an
 * "add classes" entry point).
 */
export function shouldSkipCompletedOnboarding({
  setupStatus,
  intent,
}: {
  setupStatus: SetupStatus;
  /** Value of the `intent` query param, if any. */
  intent?: string | null;
}): boolean {
  if (setupStatus !== "onboarded") return false;
  return intent !== "add" && intent !== "setup";
}

export interface ExistingClassIdentity {
  id: string;
  client_class_id: string;
  name: string;
  term: string | null;
  section: string | null;
}

function key(name: string, term: string | null | undefined, section: string | null | undefined) {
  return [
    name.trim().toLowerCase(),
    (term ?? "").trim().toLowerCase(),
    (section ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * Reuse the row a previous (possibly interrupted) setup already created for the
 * same course identity. Term and section stay part of the key, so the same
 * course name in a different term/section is still a legitimately distinct class.
 */
export function matchExistingClass(
  existing: ExistingClassIdentity[],
  candidate: { name: string; term: string | null; section?: string | null },
): ExistingClassIdentity | null {
  const wanted = key(candidate.name, candidate.term, candidate.section ?? null);
  return existing.find((row) => key(row.name, row.term, row.section) === wanted) ?? null;
}
