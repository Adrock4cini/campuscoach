export type SyllabusItemKind = "assignment" | "exam" | "schedule";

export interface ExistingSyllabusDeadline {
  id: string;
  classId: string;
  source: "manual" | "canvas" | "syllabus";
  externalId: string | null;
  title: string;
  date: string;
  sourceTitle: string | null;
  sourceDate: string | null;
  archived: boolean;
}

export interface IncomingSyllabusDeadline {
  key: string;
  title: string;
  date: string;
  included: boolean;
}

export type SyllabusReconciliationAction =
  | { type: "detach"; id: string }
  | { type: "update"; id: string; item: IncomingSyllabusDeadline }
  | { type: "insert"; item: IncomingSyllabusDeadline }
  | { type: "archive"; id: string };

export function normalizeSyllabusTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildStableSyllabusItemKeys<T>(
  kind: SyllabusItemKind,
  items: readonly T[],
  title: (item: T) => string,
): Array<{ item: T; key: string }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const identity = normalizeSyllabusTitle(title(item));
    const occurrence = seen.get(identity) ?? 0;
    seen.set(identity, occurrence + 1);
    return { item, key: `${kind}:${fnv1a(identity)}:${occurrence}` };
  });
}

/**
 * Pure mirror of the SQL reconciliation rules. Updates identify the existing
 * row so status, priority, notes, readiness, captures, and other student state
 * remain on that row. Only target-class syllabus rows can produce actions.
 */
export function planSyllabusDeadlineReconciliation(input: {
  targetClassId: string;
  kind: "assignment" | "exam";
  existing: readonly ExistingSyllabusDeadline[];
  incoming: readonly IncomingSyllabusDeadline[];
}): SyllabusReconciliationAction[] {
  const prefix = `syllabus:${input.targetClassId}:${input.kind}:`;
  const scoped = input.existing.filter((row) => (
    row.classId === input.targetClassId && row.source === "syllabus"
  ));
  const candidates = scoped.filter((row) => !row.archived);
  const actions: SyllabusReconciliationAction[] = [];
  const untouched = new Map<string, ExistingSyllabusDeadline>();
  for (const row of candidates) {
    if (row.title !== row.sourceTitle || row.date !== row.sourceDate) {
      actions.push({ type: "detach", id: row.id });
    } else {
      untouched.set(row.id, row);
    }
  }

  const included = input.incoming.filter((item) => item.included);
  for (const item of included) {
    const exact = [
      ...untouched.values(),
      ...scoped.filter((row) => row.archived && row.title === row.sourceTitle && row.date === row.sourceDate),
    ].find((row) => row.externalId === `${prefix}${item.key}`);
    if (exact) {
      actions.push({ type: "update", id: exact.id, item });
      untouched.delete(exact.id);
      continue;
    }
    const normalizedTitle = normalizeSyllabusTitle(item.title);
    const incomingPairCount = included.filter((candidate) => (
      normalizeSyllabusTitle(candidate.title) === normalizedTitle && candidate.date === item.date
    )).length;
    const pairMatches = [...untouched.values()].filter((row) => (
      normalizeSyllabusTitle(row.sourceTitle ?? "") === normalizedTitle && row.sourceDate === item.date
    ));
    if (incomingPairCount === 1 && pairMatches.length === 1) {
      actions.push({ type: "update", id: pairMatches[0].id, item });
      untouched.delete(pairMatches[0].id);
      continue;
    }
    const incomingTitleCount = included.filter((candidate) => (
      normalizeSyllabusTitle(candidate.title) === normalizedTitle
    )).length;
    const titleMatches = [...untouched.values()].filter((row) => (
      normalizeSyllabusTitle(row.sourceTitle ?? "") === normalizedTitle
    ));
    if (incomingTitleCount === 1 && titleMatches.length === 1) {
      actions.push({ type: "update", id: titleMatches[0].id, item });
      untouched.delete(titleMatches[0].id);
    } else {
      actions.push({ type: "insert", item });
    }
  }

  for (const row of untouched.values()) actions.push({ type: "archive", id: row.id });
  return actions;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
