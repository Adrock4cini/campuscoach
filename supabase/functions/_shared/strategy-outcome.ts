/**
 * Reads only the strategy that actually authored an artifact. Older snapshots
 * stored the selected strategy in flat fields even when a deterministic
 * builder executed a different method; those rows deliberately return null
 * attribution so they cannot train the strategy ranker on false evidence.
 */

import { STRATEGY_BY_ID } from "./strategy-catalog.ts";

export interface StrategyOutcomeMetadata {
  taskKind: string | null;
  strategyId: string | null;
  technique: string | null;
  modality: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function executedStrategyOutcomeMetadata(snapshotValue: unknown): StrategyOutcomeMetadata {
  const snapshot = record(snapshotValue);
  const strategy = record(snapshot?.strategy);
  const executed = record(strategy?.executed);
  const executedId = boundedText(executed?.id);
  const catalogStrategy = executedId ? STRATEGY_BY_ID[executedId] : null;
  const executionMatchesCatalog = Boolean(
    catalogStrategy
    && executed?.modality === catalogStrategy.modality
    && (executed?.technique ?? null) === (catalogStrategy.technique ?? null)
    && (executed?.cost === "ai" || executed?.cost === "deterministic")
    && executed?.deterministic === (executed.cost === "deterministic"),
  );
  return {
    taskKind: boundedText(strategy?.taskKind),
    strategyId: executionMatchesCatalog ? catalogStrategy!.id : null,
    technique: executionMatchesCatalog ? catalogStrategy!.technique ?? null : null,
    modality: executionMatchesCatalog ? catalogStrategy!.modality : null,
  };
}
