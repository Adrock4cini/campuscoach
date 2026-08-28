/**
 * Strategy-effectiveness evidence — the layer that makes the adaptive loop
 * actually LEARN instead of re-reading a static subject profile forever.
 *
 * What it is:
 *   - A pure, deterministic summary of durable outcome rows
 *     (`public.study_strategy_outcomes`) into per-student, per-context
 *     effectiveness for one strategy or one study format.
 *   - Recency-weighted (exponential half-life) so September evidence stops
 *     dominating in November.
 *   - Sample-gated: a single lucky round never outranks a cold-start default.
 *   - Evidence-strength aware: recognition is useful, but independent
 *     application/transfer carries more weight when we know the evidence tier.
 *
 * What it is deliberately NOT:
 *   - Not a learner-type label. Nothing here ever concludes "visual learner".
 *     Evidence is scoped to subject + task kind and can reverse next week.
 *   - Not a second ranking algorithm. It only produces score adjustments that
 *     `selectStrategies` folds in alongside the existing signals.
 *   - Not cross-student. Every record is owner-scoped by RLS; no aggregation
 *     across students exists in this layer.
 *
 * Mirrored to the app through `src/lib/study/strategyEvidence.ts`.
 */

export type StrategyOutcomeSource = "study_result" | "feedback";
export type LearningEvidenceTier =
  | "exposure"
  | "recall"
  | "discrimination"
  | "application"
  | "transfer";

/**
 * How strongly one observation should influence adaptive strategy ranking.
 * These are deliberately modest multipliers: the evidence still has to clear
 * the recency/sample/lift gates below. A flashcard recall remains useful; a
 * cold transfer problem is simply better proof that a teaching move worked.
 */
export const LEARNING_EVIDENCE_WEIGHT: Record<LearningEvidenceTier, number> = {
  exposure: 0.25,
  recall: 0.6,
  discrimination: 0.8,
  application: 1,
  transfer: 1.2,
};

/** One durable outcome row, already owner-scoped by RLS. */
export interface StrategyOutcomeRecord {
  strategyId?: string | null;
  technique?: string | null;
  /** Study format the outcome came from: flashcards | multiple_choice | matching. */
  format?: string | null;
  subjectProfileId?: string | null;
  taskKind?: string | null;
  /** Items answered correctly (feedback rows use 1 for helpful, 0 for rejected). */
  correct: number;
  /** Items attempted (feedback rows use 1). */
  total: number;
  /** Mastery movement for the attempt, when the caller already had it. */
  masteryDelta?: number | null;
  /** Strength of the underlying student evidence when known. */
  evidenceTier?: LearningEvidenceTier | null;
  source: StrategyOutcomeSource;
  occurredAt: string;
}

export interface EvidenceOptions {
  now?: Date;
  /** Days after which a data point counts half as much. */
  halfLifeDays?: number;
  /** Weighted attempts required before evidence may move the ranking. */
  minSamples?: number;
  /** Effect size required before evidence may move the ranking. */
  minLift?: number;
}

export const EVIDENCE_DEFAULTS = {
  halfLifeDays: 21,
  minSamples: 3,
  minLift: 0.08,
  /** An explicit Helpful / Show-another tap is a strong, cheap signal. */
  feedbackWeight: 1.5,
  /** Neutral prior used until the student has a real baseline. */
  neutralBaseline: 0.6,
} as const;

export interface StrategyEvidence {
  strategyId: string | null;
  format: string | null;
  subjectProfileId: string | null;
  taskKind: string | null;
  /** Recency- and evidence-strength-weighted attempts backing this row. */
  samples: number;
  /** Recency-weighted success rate, 0-1. */
  successRate: number;
  /** The student's own success rate in this subject + task, 0-1. */
  baseline: number;
  /** successRate - baseline. Positive means it works better than their norm. */
  lift: number;
  /** Only meaningful evidence is allowed to move the ranking. */
  meaningful: boolean;
  /** 0-1 — how much of the full evidence weight to apply. */
  confidence: number;
}

function contextKey(subjectProfileId: string | null, taskKind: string | null): string {
  return `${subjectProfileId ?? "*"}|${taskKind ?? "*"}`;
}

function recencyWeight(occurredAt: string, now: Date, halfLifeDays: number): number {
  const then = Date.parse(occurredAt);
  if (!Number.isFinite(then)) return 0;
  const ageDays = Math.max(0, (now.getTime() - then) / 86_400_000);
  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}

interface Bucket {
  weight: number;
  success: number;
}

function accumulate(map: Map<string, Bucket>, key: string, weight: number, success: number) {
  const bucket = map.get(key) ?? { weight: 0, success: 0 };
  bucket.weight += weight;
  bucket.success += success;
  map.set(key, bucket);
}

function evidenceTierWeight(record: StrategyOutcomeRecord): number {
  // Existing rows predate the explicit evidence ladder. Preserve their old
  // behavior until a caller starts supplying the tier; do not silently rewrite
  // historical meaning during the rollout.
  if (!record.evidenceTier) return 1;
  return LEARNING_EVIDENCE_WEIGHT[record.evidenceTier];
}

/**
 * Summarize outcome rows into per-strategy and per-format effectiveness.
 *
 * Evidence never crosses task kinds or subjects: doing well on
 * `memorize-terms` flashcards says nothing about `solve-problems`, so those
 * buckets stay separate and cannot contaminate each other.
 */
export function summarizeStrategyEvidence(
  records: readonly StrategyOutcomeRecord[],
  options: EvidenceOptions = {},
): StrategyEvidence[] {
  const now = options.now ?? new Date();
  const halfLifeDays = options.halfLifeDays ?? EVIDENCE_DEFAULTS.halfLifeDays;
  const minSamples = options.minSamples ?? EVIDENCE_DEFAULTS.minSamples;
  const minLift = options.minLift ?? EVIDENCE_DEFAULTS.minLift;

  const strategyBuckets = new Map<string, Bucket>();
  const formatBuckets = new Map<string, Bucket>();
  const contextBuckets = new Map<string, Bucket>();
  const identity = new Map<string, {
    strategyId: string | null;
    format: string | null;
    subjectProfileId: string | null;
    taskKind: string | null;
  }>();

  for (const record of records) {
    const total = Number(record.total);
    const correct = Number(record.correct);
    if (!Number.isFinite(total) || total <= 0) continue;
    if (!Number.isFinite(correct) || correct < 0 || correct > total) continue;

    const recency = recencyWeight(record.occurredAt, now, halfLifeDays);
    if (recency <= 0.001) continue;
    const sourceWeight = record.source === "feedback" ? EVIDENCE_DEFAULTS.feedbackWeight : 1;
    let rate = correct / total;
    // Mastery movement is a stronger truth than a single round's score, so it
    // nudges the rate when the caller already computed it. Bounded on purpose.
    if (typeof record.masteryDelta === "number" && Number.isFinite(record.masteryDelta)) {
      rate = Math.min(1, Math.max(0, rate + Math.max(-0.15, Math.min(0.15, record.masteryDelta))));
    }
    const weight = recency * sourceWeight * evidenceTierWeight(record) * total;
    const success = weight * rate;
    const subjectProfileId = record.subjectProfileId ?? null;
    const taskKind = record.taskKind ?? null;
    const context = contextKey(subjectProfileId, taskKind);

    accumulate(contextBuckets, context, weight, success);
    if (record.strategyId) {
      const key = `s:${context}|${record.strategyId}`;
      identity.set(key, { strategyId: record.strategyId, format: null, subjectProfileId, taskKind });
      accumulate(strategyBuckets, key, weight, success);
    }
    if (record.format) {
      const key = `f:${context}|${record.format}`;
      identity.set(key, { strategyId: null, format: record.format, subjectProfileId, taskKind });
      accumulate(formatBuckets, key, weight, success);
    }
  }

  const out: StrategyEvidence[] = [];
  for (const [key, bucket] of [...strategyBuckets, ...formatBuckets]) {
    const who = identity.get(key)!;
    const context = contextBuckets.get(contextKey(who.subjectProfileId, who.taskKind));
    const baseline = context && context.weight >= 1
      ? context.success / context.weight
      : EVIDENCE_DEFAULTS.neutralBaseline;
    const successRate = bucket.success / bucket.weight;
    const lift = successRate - baseline;
    const confidence = Math.min(1, bucket.weight / (minSamples * 2));
    out.push({
      ...who,
      samples: Number(bucket.weight.toFixed(4)),
      successRate,
      baseline,
      lift,
      confidence,
      meaningful: bucket.weight >= minSamples && Math.abs(lift) >= minLift,
    });
  }

  out.sort((a, b) => (b.lift - a.lift) || (b.samples - a.samples));
  return out;
}

/** Score adjustment applied to one strategy in one context. Bounded on purpose. */
export const MAX_EVIDENCE_ADJUSTMENT = 6;

export function evidenceAdjustment(
  evidence: readonly StrategyEvidence[] | undefined,
  match: { strategyId?: string | null; format?: string | null; subjectProfileId?: string | null; taskKind?: string | null },
): { adjustment: number; evidence: StrategyEvidence | null } {
  if (!evidence?.length) return { adjustment: 0, evidence: null };
  const found = evidence.find((row) => (
    row.meaningful
    && (match.strategyId ? row.strategyId === match.strategyId : row.strategyId === null)
    && (match.format ? row.format === match.format : row.format === null)
    // Evidence is only reused inside the same subject + task kind it came from.
    && row.subjectProfileId === (match.subjectProfileId ?? null)
    && row.taskKind === (match.taskKind ?? null)
  ));
  if (!found) return { adjustment: 0, evidence: null };
  const raw = found.lift * 12 * found.confidence;
  const adjustment = Math.max(-MAX_EVIDENCE_ADJUSTMENT, Math.min(MAX_EVIDENCE_ADJUSTMENT, raw));
  return { adjustment, evidence: found };
}

/**
 * Compact, non-labeling student copy. Returns null when there is nothing
 * honest to say — silence beats a badge that pressures the student.
 */
export function evidenceNote(evidence: StrategyEvidence | null | undefined): string | null {
  if (!evidence?.meaningful) return null;
  if (evidence.lift > 0) return "This usually works well for you";
  return null;
}

/**
 * Study format ordering. Learned evidence leads when it is meaningful for this
 * subject + task kind; everything else keeps the cold-start subject order.
 */
export function orderFormatsByEvidence<T extends string>(
  formats: readonly T[],
  subjectOrder: readonly T[],
  evidence: readonly StrategyEvidence[] | undefined,
  context: { subjectProfileId?: string | null; taskKind?: string | null } = {},
): T[] {
  const baseRank = new Map<T, number>(subjectOrder.map((format, index) => [format, index]));
  return [...formats].sort((a, b) => {
    const aAdj = evidenceAdjustment(evidence, { format: a, ...context }).adjustment;
    const bAdj = evidenceAdjustment(evidence, { format: b, ...context }).adjustment;
    if (aAdj !== bAdj) return bAdj - aAdj;
    return (baseRank.get(a) ?? 99) - (baseRank.get(b) ?? 99);
  });
}
