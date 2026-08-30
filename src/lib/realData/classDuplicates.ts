/**
 * Duplicate class diagnostics.
 *
 * Real accounts can end up with two rows that look identical in the list
 * ("QA — HVAC Cert" twice). Nothing here deletes, merges or hides a class:
 * hiding one copy could hide the copy that holds the student's work. Instead
 * we label the copies so the student can tell them apart and clean up
 * deliberately, and we stop new *exact* duplicates from being created.
 *
 * Near-matches ("Biology 101" vs "BIOL 101") are intentionally NOT treated as
 * duplicates — they are ambiguous and must never be merged silently.
 */

export interface DuplicateCandidate {
  id: string;
  name: string;
  term?: string | null;
  section?: string | null;
  createdAt?: string | null;
}

/** Exact-duplicate identity: same trimmed, case-folded name + term + section. */
export function classIdentityKey(item: {
  name: string;
  term?: string | null;
  section?: string | null;
}): string {
  const norm = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return [norm(item.name), norm(item.term), norm(item.section)].join("|");
}

export interface DuplicateLabel {
  /** Short disambiguator to render next to the class name, e.g. "copy 2". */
  suffix: string;
  /** Human diagnostic shown once per duplicate group. */
  note: string;
}

/**
 * Deterministic labels for provably-identical classes, ordered oldest-first so
 * the label never changes between renders.
 */
export function buildDuplicateLabels(
  items: DuplicateCandidate[],
): Record<string, DuplicateLabel> {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const item of items) {
    const key = classIdentityKey(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const labels: Record<string, DuplicateLabel> = {};
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((a, b) => {
      const at = Date.parse(a.createdAt ?? "") || 0;
      const bt = Date.parse(b.createdAt ?? "") || 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });
    ordered.forEach((item, index) => {
      labels[item.id] = {
        suffix: `copy ${index + 1}`,
        note: `${bucket.length} classes share this exact name. Open the one with your work, and delete the empty copy.`,
      };
    });
  }
  return labels;
}

/** True when adding `candidate` would create an exact duplicate of an existing class. */
export function isExactDuplicateClass(
  candidate: { name: string; term?: string | null; section?: string | null },
  existing: DuplicateCandidate[],
  ignoreId?: string,
): boolean {
  const key = classIdentityKey(candidate);
  return existing.some((item) => item.id !== ignoreId && classIdentityKey(item) === key);
}
