import {
  STRATEGY_CATALOG,
  STRATEGY_BY_ID,
  type StrategyCost,
  type StrategyModality,
} from "./strategy-catalog.ts";

export interface StrategyExecutionMetadata {
  /** What the catalog said the selected teaching strategy normally costs. */
  selectedCost: StrategyCost;
  /** The strategy that actually authored the response or persisted artifact. */
  strategyId: string | null;
  modality: StrategyModality | null;
  technique: string | null;
  /** What this artifact request actually executed. */
  cost: StrategyCost;
  deterministic: boolean;
}

const REMOTE_DETERMINISTIC_MNEMONIC_STRATEGIES = new Set([
  "compare-table",
  "retrieval-question",
  "verified-math-shortcut",
]);

/** Deterministic mnemonic routes the Edge function can actually render. */
export function isRemoteDeterministicMnemonicStrategy(strategyId: string): boolean {
  return REMOTE_DETERMINISTIC_MNEMONIC_STRATEGIES.has(strategyId);
}

function executionIdentity(executedStrategyId: string) {
  const executed = STRATEGY_BY_ID[executedStrategyId];
  if (!executed) throw new Error(`Unknown executed teaching strategy: ${executedStrategyId}`);
  return {
    strategyId: executed.id,
    modality: executed.modality,
    technique: executed.technique ?? null,
  };
}

export function deterministicStrategyExecution(
  selectedCost: StrategyCost,
  executedStrategyId: string,
): StrategyExecutionMetadata {
  return {
    selectedCost,
    ...executionIdentity(executedStrategyId),
    cost: "deterministic",
    deterministic: true,
  };
}

export type DeterministicArtifactKind =
  | "flashcards"
  | "multiple_choice"
  | "matching"
  | "practice";

const EXECUTED_STRATEGY_BY_ARTIFACT_KIND: Record<DeterministicArtifactKind, string> = {
  flashcards: "retrieval-question",
  multiple_choice: "multiple-choice",
  matching: "matching",
  practice: "worked-example",
};

/**
 * Artifact format and executed teaching method are separate from the strategy
 * selected by the router. These four builders are deterministic and have a
 * fixed, truthful execution identity.
 */
export function deterministicArtifactStrategyExecution(
  kind: DeterministicArtifactKind,
  selectedCost: StrategyCost,
): StrategyExecutionMetadata {
  return deterministicStrategyExecution(selectedCost, EXECUTED_STRATEGY_BY_ARTIFACT_KIND[kind]);
}

export type MnemonicStrategyExecution<T> =
  | {
      kind: "deterministic-fallback";
      strategyId: string;
      metadata: StrategyExecutionMetadata;
    }
  | {
      kind: "ai";
      strategyId: string;
      value: T;
    };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Derives attribution only from the validated mnemonic payload that will be
 * displayed. A mixed technique set, an unmapped technique, or a technique
 * shared by multiple AI strategies remains deliberately unattributed.
 */
export function aiMnemonicStrategyExecution(
  selectedCost: StrategyCost,
  payload: unknown,
): StrategyExecutionMetadata {
  const root = record(payload);
  const items = Array.isArray(root?.items) ? root.items : [];
  const techniques = new Set<string>();
  for (const value of items) {
    const item = record(value);
    if (typeof item?.technique !== "string" || !item.technique.trim()) {
      techniques.clear();
      break;
    }
    techniques.add(item.technique.trim());
  }
  const technique = items.length > 0 && techniques.size === 1
    ? [...techniques][0]
    : null;
  const strategies = technique
    ? STRATEGY_CATALOG.filter((strategy) => (
        strategy.cost === "ai" && strategy.technique === technique
      ))
    : [];
  if (strategies.length === 1) {
    return {
      selectedCost,
      ...executionIdentity(strategies[0].id),
      cost: "ai",
      deterministic: false,
    };
  }
  return {
    selectedCost,
    strategyId: null,
    modality: null,
    technique,
    cost: "ai",
    deterministic: false,
  };
}

/**
 * A mnemonic payload is currently the only artifact shape authored by a model.
 * If routing selected a zero-model strategy, do not silently turn that strategy
 * into an AI prompt or claim the resulting request was deterministic. The caller
 * can instead offer its grounded retrieval/comparison practice fallback.
 */
export async function executeMnemonicStrategy<T>(input: {
  strategyId: string;
  strategyCost: StrategyCost;
  runAi: () => Promise<T>;
}): Promise<MnemonicStrategyExecution<T>> {
  if (input.strategyCost === "deterministic") {
    return {
      kind: "deterministic-fallback",
      strategyId: input.strategyId,
      metadata: deterministicStrategyExecution(input.strategyCost, input.strategyId),
    };
  }

  const value = await input.runAi();
  return {
    kind: "ai",
    strategyId: input.strategyId,
    value,
  };
}
