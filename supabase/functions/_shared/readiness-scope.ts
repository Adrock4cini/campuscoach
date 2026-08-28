const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ScopedMasteryRow {
  concept_id: string;
  strength: number | null;
}
export interface ScopedReadiness {
  readiness: number;
  readinessBefore: number;
  conceptCount: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clampStrength(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

export function examReadinessScopeFromSnapshot(snapshotValue: unknown): string[] | null {
  const snapshot = record(snapshotValue);
  const scope = record(snapshot?.readinessScope);
  if (scope?.schemaVersion !== 1 || scope.type !== "exam" || !Array.isArray(scope.conceptIds)) {
    return null;
  }
  const ids = [...new Set(scope.conceptIds)];
  if (!ids.length || ids.length > 100
      || ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return null;
  }
  return ids as string[];
}

/** Missing mastery is explicit zero evidence and remains in the denominator. */
export function computeScopedReadiness(
  scopeConceptIds: readonly string[],
  masteryRows: readonly ScopedMasteryRow[],
  previousStrengthByConcept: ReadonlyMap<string, number>,
  changedConceptIds: ReadonlySet<string>,
): ScopedReadiness | null {
  const ids = [...new Set(scopeConceptIds)];
  if (!ids.length) return null;
  const strengthByConcept = new Map(
    masteryRows.map((row) => [row.concept_id, clampStrength(row.strength)]),
  );
  let currentTotal = 0;
  let previousTotal = 0;
  for (const conceptId of ids) {
    const current = strengthByConcept.get(conceptId) ?? 0;
    currentTotal += current;
    previousTotal += changedConceptIds.has(conceptId)
      ? clampStrength(previousStrengthByConcept.get(conceptId))
      : current;
  }
  return {
    readiness: Math.round((currentTotal / ids.length) * 100),
    readinessBefore: Math.round((previousTotal / ids.length) * 100),
    conceptCount: ids.length,
  };
}
