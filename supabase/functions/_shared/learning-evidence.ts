export type LearningEvidenceTier =
  | "exposure"
  | "recall"
  | "discrimination"
  | "application"
  | "transfer";

export type TeachingTaskKind =
  | "memorize-terms"
  | "understand-concept"
  | "solve-problems"
  | "sequence-events"
  | "compare-ideas"
  | "apply-procedure";

export type EvidenceArtifactKind =
  | "flashcards"
  | "multiple_choice"
  | "matching"
  | "practice";

const EVIDENCE_TIER_BY_ARTIFACT: Record<EvidenceArtifactKind, LearningEvidenceTier> = {
  flashcards: "recall",
  multiple_choice: "discrimination",
  matching: "discrimination",
  practice: "transfer",
};

const MINIMUM_TIER_BY_TASK: Record<TeachingTaskKind, LearningEvidenceTier> = {
  "memorize-terms": "recall",
  "sequence-events": "recall",
  "understand-concept": "discrimination",
  "compare-ideas": "discrimination",
  "solve-problems": "application",
  "apply-procedure": "application",
};

const TIER_ORDER: Record<LearningEvidenceTier, number> = {
  exposure: 0,
  recall: 1,
  discrimination: 2,
  application: 3,
  transfer: 4,
};

const TASK_KINDS = new Set<TeachingTaskKind>([
  "memorize-terms",
  "understand-concept",
  "solve-problems",
  "sequence-events",
  "compare-ideas",
  "apply-procedure",
]);

const EVIDENCE_TIERS = new Set<LearningEvidenceTier>([
  "exposure",
  "recall",
  "discrimination",
  "application",
  "transfer",
]);

export function isLearningEvidenceTier(value: unknown): value is LearningEvidenceTier {
  return typeof value === "string" && EVIDENCE_TIERS.has(value as LearningEvidenceTier);
}

export function isTeachingTaskKind(value: unknown): value is TeachingTaskKind {
  return typeof value === "string" && TASK_KINDS.has(value as TeachingTaskKind);
}

/**
 * The server derives evidence strength from the immutable artifact kind. A
 * browser result payload never gets to promote itself to a stronger tier.
 */
export function evidenceTierForArtifact(kind: string): LearningEvidenceTier | null {
  return kind in EVIDENCE_TIER_BY_ARTIFACT
    ? EVIDENCE_TIER_BY_ARTIFACT[kind as EvidenceArtifactKind]
    : null;
}

/**
 * The target task is frozen from the router snapshot that authored the
 * artifact. Unknown/legacy snapshots stay unclassified instead of guessing.
 */
export function targetTaskKindFromSnapshot(snapshotValue: unknown): TeachingTaskKind | null {
  if (!snapshotValue || typeof snapshotValue !== "object" || Array.isArray(snapshotValue)) {
    return null;
  }
  const snapshot = snapshotValue as Record<string, unknown>;
  const strategy = snapshot.strategy;
  if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) return null;
  const taskKind = (strategy as Record<string, unknown>).taskKind;
  return isTeachingTaskKind(taskKind) ? taskKind : null;
}

/**
 * A preferred format can still be learned from weaker practice, but it cannot
 * prove that a higher-order teaching strategy solved the routed learning task.
 */
export function evidenceMeetsTaskMinimum(
  evidenceTier: LearningEvidenceTier | null | undefined,
  taskKind: string | null | undefined,
): boolean {
  // Historical rows predate the ladder and retain their legacy treatment.
  if (!evidenceTier) return true;
  if (!isTeachingTaskKind(taskKind)) return false;
  return TIER_ORDER[evidenceTier] >= TIER_ORDER[MINIMUM_TIER_BY_TASK[taskKind]];
}
