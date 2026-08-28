import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executedStrategyOutcomeMetadata } from "./strategy-outcome.ts";

describe("executed strategy outcome attribution", () => {
  it("learns from executed metadata instead of the router's selected strategy", () => {
    expect(executedStrategyOutcomeMetadata({
      strategy: {
        taskKind: "memorize-terms",
        selected: {
          id: "familiar-bridge",
          modality: "association",
          technique: "familiar_bridge",
        },
        executed: {
          id: "retrieval-question",
          modality: "practice",
          technique: null,
          cost: "deterministic",
          deterministic: true,
        },
      },
    })).toEqual({
      taskKind: "memorize-terms",
      strategyId: "retrieval-question",
      technique: null,
      modality: "practice",
    });
  });

  it("does not credit a nested id whose execution fields contradict the catalog", () => {
    expect(executedStrategyOutcomeMetadata({
      strategy: {
        taskKind: "memorize-terms",
        executed: {
          id: "familiar-bridge",
          modality: "visual",
          technique: "familiar_bridge",
          cost: "ai",
          deterministic: false,
        },
      },
    })).toEqual({
      taskKind: "memorize-terms",
      strategyId: null,
      technique: null,
      modality: null,
    });
  });

  it("does not learn from legacy flat selected-strategy metadata", () => {
    expect(executedStrategyOutcomeMetadata({
      strategy: {
        id: "familiar-bridge",
        modality: "association",
        technique: "familiar_bridge",
        taskKind: "memorize-terms",
      },
    })).toEqual({
      taskKind: "memorize-terms",
      strategyId: null,
      technique: null,
      modality: null,
    });
  });

  it("wires result recording through the executed-only parser", () => {
    const recorder = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");
    expect(recorder).toContain("executedStrategyOutcomeMetadata(snapshot)");
    expect(recorder).toContain("strategy_id: strategyOutcome.strategyId");
    expect(recorder).not.toContain('typeof strategy.id === "string" ? strategy.id : null');
  });
});
