import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectStrategy } from "./strategy-catalog.ts";
import {
  aiMnemonicStrategyExecution,
  deterministicArtifactStrategyExecution,
  deterministicStrategyExecution,
  executeMnemonicStrategy,
  isRemoteDeterministicMnemonicStrategy,
} from "./strategy-execution.ts";

describe("strategy execution cost boundary", () => {
  it.each([
    ["compare-table", "compare-ideas"],
    ["retrieval-question", "memorize-terms"],
  ] as const)(
    "never calls the mnemonic provider for deterministic %s",
    async (strategyId, taskKind) => {
      const selected = selectStrategy({
        subjectProfileId: "general",
        taskKind,
        requestedStrategyId: strategyId,
        hasGroundedSource: true,
      });
      const provider = vi.fn(async () => ({ payload: "model output" }));

      expect(selected.strategy.id).toBe(strategyId);
      expect(selected.strategy.cost).toBe("deterministic");
      await expect(executeMnemonicStrategy({
        strategyId: selected.strategy.id,
        strategyCost: selected.strategy.cost,
        runAi: provider,
      })).resolves.toEqual({
        kind: "deterministic-fallback",
        strategyId,
        metadata: {
          selectedCost: "deterministic",
          strategyId,
          modality: strategyId === "compare-table" ? "visual" : "practice",
          technique: strategyId === "compare-table" ? "compare_contrast" : null,
          cost: "deterministic",
          deterministic: true,
        },
      });
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it("calls the provider once and records AI execution for an AI mnemonic strategy", async () => {
    const selected = selectStrategy({
      subjectProfileId: "general",
      taskKind: "memorize-terms",
      requestedStrategyId: "familiar-bridge",
      hasGroundedSource: true,
    });
    const provider = vi.fn(async () => ({ payload: "model output" }));

    expect(selected.strategy.cost).toBe("ai");
    await expect(executeMnemonicStrategy({
      strategyId: selected.strategy.id,
      strategyCost: selected.strategy.cost,
      runAi: provider,
    })).resolves.toEqual({
      kind: "ai",
      strategyId: "familiar-bridge",
      value: { payload: "model output" },
    });
    expect(provider).toHaveBeenCalledOnce();
  });

  it("derives AI attribution from the validated displayed technique", () => {
    expect(aiMnemonicStrategyExecution("ai", {
      items: [{ technique: "familiar_bridge" }],
    })).toEqual({
      selectedCost: "ai",
      strategyId: "familiar-bridge",
      modality: "association",
      technique: "familiar_bridge",
      cost: "ai",
      deterministic: false,
    });
  });

  it.each([
    ["mixed techniques", { items: [{ technique: "familiar_bridge" }, { technique: "story" }] }],
    ["an ambiguous technique", { items: [{ technique: "visual" }] }],
    ["an unmapped technique", { items: [{ technique: "association" }] }],
  ])("does not credit a strategy for %s", (_label, payload) => {
    expect(aiMnemonicStrategyExecution("ai", payload)).toMatchObject({
      strategyId: null,
      modality: null,
      cost: "ai",
      deterministic: false,
    });
  });

  it("exposes only grounded remote deterministic mnemonic methods", () => {
    expect(isRemoteDeterministicMnemonicStrategy("compare-table")).toBe(true);
    expect(isRemoteDeterministicMnemonicStrategy("retrieval-question")).toBe(true);
    expect(isRemoteDeterministicMnemonicStrategy("verified-math-shortcut")).toBe(true);
    expect(isRemoteDeterministicMnemonicStrategy("read-aloud")).toBe(false);
    expect(isRemoteDeterministicMnemonicStrategy("sanity-check")).toBe(false);
  });

  it("records deterministic execution even when a catalog strategy normally needs AI", () => {
    expect(deterministicStrategyExecution("ai", "retrieval-question")).toEqual({
      selectedCost: "ai",
      strategyId: "retrieval-question",
      modality: "practice",
      technique: null,
      cost: "deterministic",
      deterministic: true,
    });
  });

  it.each([
    ["flashcards", "retrieval-question"],
    ["multiple_choice", "multiple-choice"],
    ["matching", "matching"],
    ["practice", "worked-example"],
  ] as const)("attributes %s to the method its builder actually executes", (kind, strategyId) => {
    expect(deterministicArtifactStrategyExecution(kind, "ai")).toMatchObject({
      selectedCost: "ai",
      strategyId,
      cost: "deterministic",
      deterministic: true,
    });
  });

  it("wires generate-artifact through the execution boundary and stores actual cost", () => {
    const generator = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/generate-artifact/index.ts",
    ), "utf8");
    const boundary = generator.indexOf("await executeMnemonicStrategy({");
    const providerCallback = generator.indexOf("runAi: async (): Promise<GatewayResult>", boundary);
    const keyLookup = generator.indexOf('Deno.env.get("LOVABLE_API_KEY")', providerCallback);
    const audienceLookup = generator.indexOf("await loadLearnerAudience", providerCallback);
    const provider = generator.indexOf("return callGateway(", providerCallback);
    const deterministicFallback = generator.indexOf('execution.kind === "deterministic-fallback"', boundary);
    const alternateResponse = generator.indexOf("return json({ alternateTeaching });", deterministicFallback);
    const displayedAttribution = generator.indexOf("aiMnemonicStrategyExecution(strategyMetadata.cost, payload)", alternateResponse);

    expect(boundary).toBeGreaterThan(-1);
    expect(providerCallback).toBeGreaterThan(boundary);
    expect(keyLookup).toBeGreaterThan(providerCallback);
    expect(audienceLookup).toBeGreaterThan(providerCallback);
    expect(provider).toBeGreaterThan(providerCallback);
    expect(alternateResponse).toBeGreaterThan(deterministicFallback);
    expect(displayedAttribution).toBeGreaterThan(alternateResponse);
    expect(generator).toContain("selected: {");
    expect(generator).toContain("executed: {");
    expect(generator).toContain("id: executionMetadata.strategyId");
    expect(generator).toContain("cost: executionMetadata.cost");
    expect(generator).toContain("deterministic: executionMetadata.deterministic");
    expect(generator).toContain("return json({ alternateTeaching });");
  });
});
