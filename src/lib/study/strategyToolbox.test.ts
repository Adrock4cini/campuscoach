import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FALLBACK_STRATEGY_ID,
  SANITY_CHECKS,
  STRATEGY_CATALOG,
  contextualStudentActions,
  detectVerifiedShortcuts,
  divideByFractionShortcut,
  isDeterministicStrategy,
  percentSwap,
  selectStrategies,
  selectStrategy,
  strategyPromptGuidance,
  timesFiveShortcut,
} from "./strategyToolbox";

describe("verified shortcuts (deterministic, no model call)", () => {
  it("proves the percent swap instead of presenting it as magic", () => {
    const trick = percentSwap(14, 50);
    expect(trick).not.toBeNull();
    expect(trick!.statement).toBe("14% of 50 is the same as 50% of 14.");
    expect(trick!.example).toContain("= 7");
    expect(trick!.why).toContain("commutative");
    expect(trick!.verified).toBe(true);
  });

  it("states the conditions and limits of the percent swap", () => {
    const trick = percentSwap(8, 25)!;
    expect(trick.conditions).toMatch(/any two numbers/i);
    expect(trick.conditions).toMatch(/percent increase|percent change/i);
    // The identity holds for decimals and negatives too, so it must not be
    // advertised as whole-number-only.
    expect(percentSwap(2.5, 40)!.example).toContain("= 1");
    expect(percentSwap(-20, 60)).not.toBeNull();
    expect(percentSwap(Number.NaN, 10)).toBeNull();
  });

  it("only emits shortcuts that pass their own numeric check", () => {
    expect(timesFiveShortcut(18)!.example).toContain("= 90");
    expect(divideByFractionShortcut(12, 0.5)!.example).toContain("= 24");
    expect(divideByFractionShortcut(12, 0)).toBeNull();
    for (const shortcut of [percentSwap(14, 50), timesFiveShortcut(7), divideByFractionShortcut(9, 0.25)]) {
      expect(shortcut!.verified).toBe(true);
      expect(shortcut!.conditions.length).toBeGreaterThan(20);
    }
  });

  it("detects shortcuts in the student's own material and never invents one", () => {
    const found = detectVerifiedShortcuts("Homework: find 14% of 50 and then 12 / 0.5.");
    expect(found.map((s) => s.id)).toEqual(["percent-swap", "divide-by-fraction"]);
    expect(detectVerifiedShortcuts("The mitochondria produces ATP.")).toEqual([]);
    expect(SANITY_CHECKS.every((check) => check.body.length > 20)).toBe(true);
  });
});

describe("strategy catalog metadata", () => {
  it("gives every strategy the metadata Study Intelligence selects on", () => {
    for (const strategy of STRATEGY_CATALOG) {
      expect(strategy.whenToUse.length).toBeGreaterThan(10);
      expect(strategy.avoidWhen.length).toBeGreaterThan(5);
      expect(strategy.safety.length).toBeGreaterThan(10);
      expect(["deterministic", "ai"]).toContain(strategy.cost);
      expect(strategy.taskKinds.length).toBeGreaterThan(0);
    }
  });

  it("forces anti-fabrication constraints on the risky strategies", () => {
    const byId = Object.fromEntries(STRATEGY_CATALOG.map((s) => [s.id, s]));
    expect(byId["word-roots"].safety).toMatch(/[Nn]ever invent an etymology/);
    expect(byId["simple-diagram"].safety).toMatch(/[Nn]ever invent/);
    expect(byId["timeline"].safety).toMatch(/[Nn]ever infer or interpolate a date/);
    expect(byId["verified-math-shortcut"].cost).toBe("deterministic");
    expect(byId["read-aloud"].safety).toMatch(/no paid audio service/i);
  });
});

describe("strategy selection", () => {
  it("prefers worked examples for math problem solving", () => {
    const top = selectStrategies({
      subjectProfileId: "math",
      taskKind: "solve-problems",
    }).slice(0, 4).map((choice) => choice.strategy.id);
    expect(top).toContain("worked-example");
    expect(top).toContain("verified-math-shortcut");
    expect(top).not.toContain("word-roots");
  });

  it("prefers visual and body-map strategies for anatomy", () => {
    const top = selectStrategies({
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
    }).slice(0, 5).map((choice) => choice.strategy.id);
    expect(top).toContain("body-map");
  });

  it("prefers timeline and story for history sequencing", () => {
    const top = selectStrategies({
      subjectProfileId: "history_social",
      taskKind: "sequence-events",
    }).slice(0, 4).map((choice) => choice.strategy.id);
    expect(top).toContain("timeline");
    expect(top).toContain("mini-story");
  });

  it("prefers association hooks for vocabulary", () => {
    const top = selectStrategies({
      subjectProfileId: "humanities_text",
      taskKind: "memorize-terms",
    }).slice(0, 6).map((choice) => choice.strategy.id);
    expect(top.some((id) => ["sound-alike", "word-roots", "mental-image"].includes(id))).toBe(true);
  });

  it("falls back safely when nothing else is applicable", () => {
    const only = selectStrategies({
      hasGroundedSource: false,
      unavailableModalities: ["visual", "verbal", "association", "shortcut"],
      requestedStrategyId: "simple-diagram",
    });
    expect(only).toHaveLength(1);
    expect(only[0].strategy.id).toBe(FALLBACK_STRATEGY_ID);
    // Ungrounded concepts never get a fabricated diagram.
    const ungrounded = selectStrategies({ hasGroundedSource: false }).map((c) => c.strategy.id);
    expect(ungrounded).not.toContain("simple-diagram");
  });

  it("adapts to observed feedback without assigning a learner-type label", () => {
    const base = selectStrategy({ subjectProfileId: "general", taskKind: "memorize-terms" });
    const afterHelpful = selectStrategy({
      subjectProfileId: "general",
      taskKind: "memorize-terms",
      observations: { preferred: ["mini-story"] },
    });
    expect(afterHelpful.strategy.id).toBe("mini-story");
    expect(afterHelpful.reasons.join(" ")).toContain("rated this approach helpful");

    const afterReject = selectStrategies({
      subjectProfileId: "general",
      taskKind: "memorize-terms",
      observations: { avoid: [base.strategy.id], alreadyShown: [base.strategy.id] },
    })[0];
    expect(afterReject.strategy.id).not.toBe(base.strategy.id);
  });

  it("can restrict selection to zero-cost strategies", () => {
    const choices = selectStrategies({ subjectProfileId: "math", deterministicOnly: true });
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((choice) => isDeterministicStrategy(choice.strategy.id))).toBe(true);
  });
});

describe("student-facing controls", () => {
  it("offers a few contextual actions across different modalities, not a wall", () => {
    const actions = contextualStudentActions({
      subjectProfileId: "math",
      taskKind: "solve-problems",
    });
    expect(actions.length).toBeLessThanOrEqual(3);
    expect(new Set(actions.map((a) => a.modality)).size).toBe(actions.length);
    expect(actions.map((a) => a.label)).toContain("Show a math shortcut");
  });

  it("drops read-aloud when the modality is unavailable", () => {
    const actions = contextualStudentActions({
      taskKind: "understand-concept",
      unavailableModalities: ["verbal"],
    });
    expect(actions.map((a) => a.strategyId)).not.toContain("read-aloud");
  });

  it("emits prompt guidance carrying the strategy's accuracy constraint", () => {
    const guidance = strategyPromptGuidance("word-roots")!;
    expect(guidance).toContain("Real word roots");
    expect(guidance).toContain("Do not use it when");
    expect(guidance).toMatch(/[Nn]ever invent an etymology/);
    expect(strategyPromptGuidance("not-a-strategy")).toBeNull();
  });
});

describe("generator wiring", () => {
  const generator = readFileSync(
    resolve(process.cwd(), "supabase/functions/generate-artifact/index.ts"),
    "utf8",
  );

  it("selects a strategy deterministically before any model call", () => {
    expect(generator).toContain('from "../_shared/strategy-catalog.ts"');
    expect(generator).toContain("const strategyChoice = selectStrategy({");
    expect(generator).toContain("const verifiedShortcuts = detectVerifiedShortcuts(");
    expect(generator.indexOf("const strategyChoice = selectStrategy({"))
      .toBeLessThan(generator.indexOf('fetch("https://ai.gateway.lovable.dev'));
  });

  it("passes strategy guidance and verified shortcuts into the grounded prompt", () => {
    expect(generator).toContain("strategyPromptGuidance(strategyId)");
    expect(generator).toContain("reuse them verbatim with their stated conditions");
    expect(generator).toContain("strategyInstruction,");
    expect(generator).toContain("verifiedShortcutIds:");
  });
});
