import { describe, expect, it } from "vitest";
import {
  buildAlternateTeaching,
  parseAlternateTeaching,
} from "./alternate-teaching.ts";

describe("grounded alternate teaching", () => {
  it("builds retrieval practice without changing the source-supported answer", () => {
    const teaching = buildAlternateTeaching({
      selectedStrategyId: "retrieval-question",
      conceptId: "concept-homeostasis",
      conceptName: "Homeostasis",
      exactTarget: "Homeostasis maintains stable internal conditions.",
      sourceExcerpt: "Homeostasis maintains stable internal conditions.",
    });

    expect(teaching).toMatchObject({
      schemaVersion: "alternate-teaching-v1",
      kind: "retrieval-question",
      selectedStrategyId: "retrieval-question",
      executedStrategyId: "retrieval-question",
      deterministic: true,
      answer: "Homeostasis maintains stable internal conditions.",
      sourceExcerpt: "Homeostasis maintains stable internal conditions.",
    });
    expect(parseAlternateTeaching(teaching, {
      conceptId: "concept-homeostasis",
      conceptName: "Homeostasis",
      exactTarget: "Homeostasis maintains stable internal conditions.",
      sourceExcerpt: "Homeostasis maintains stable internal conditions.",
    })).toEqual(teaching);
  });

  it("copies explicitly labelled comparison evidence and invents no table cells", () => {
    const teaching = buildAlternateTeaching({
      selectedStrategyId: "compare-table",
      conceptId: "concept-tonicity",
      conceptName: "Hypotonic vs hypertonic",
      exactTarget: "Hypotonic: lower solute concentration. Hypertonic: higher solute concentration.",
      sourceExcerpt: "Hypotonic: lower solute concentration. Hypertonic: higher solute concentration.",
    });

    expect(teaching).toMatchObject({
      kind: "compare-table",
      selectedStrategyId: "compare-table",
      executedStrategyId: "compare-table",
      answer: "Hypotonic: lower solute concentration. Hypertonic: higher solute concentration.",
      items: [
        { label: "Hypotonic", evidence: "lower solute concentration" },
        { label: "hypertonic", evidence: "higher solute concentration." },
      ],
    });
  });

  it("truthfully executes retrieval when a compare request has no grounded pair", () => {
    expect(buildAlternateTeaching({
      selectedStrategyId: "compare-table",
      conceptId: "concept-homeostasis",
      conceptName: "Homeostasis",
      exactTarget: "Homeostasis maintains stable internal conditions.",
    })).toMatchObject({
      kind: "retrieval-question",
      selectedStrategyId: "compare-table",
      executedStrategyId: "retrieval-question",
    });
  });

  it("renders the existing verified percent shortcut without a model", () => {
    const teaching = buildAlternateTeaching({
      selectedStrategyId: "verified-math-shortcut",
      conceptId: "concept-percent",
      conceptName: "Percent of a number",
      exactTarget: "14% of 50",
      sourceExcerpt: "14% of 50",
    });

    expect(teaching).toMatchObject({
      kind: "verified-math-shortcut",
      selectedStrategyId: "verified-math-shortcut",
      executedStrategyId: "verified-math-shortcut",
      shortcut: {
        id: "percent-swap",
        statement: "14% of 50 is the same as 50% of 14.",
        example: "14% of 50 = 50% of 14 = 7",
        verified: true,
      },
    });
    expect(parseAlternateTeaching(teaching, {
      conceptId: "concept-percent",
      conceptName: "Percent of a number",
      exactTarget: "14% of 50",
      sourceExcerpt: "14% of 50",
    })).toEqual(teaching);
  });

  it("truthfully degrades another deterministic server route to retrieval", () => {
    expect(buildAlternateTeaching({
      selectedStrategyId: "sanity-check",
      conceptId: "concept-homeostasis",
      conceptName: "Homeostasis",
      exactTarget: "Homeostasis maintains stable internal conditions.",
    })).toMatchObject({
      kind: "retrieval-question",
      selectedStrategyId: "sanity-check",
      executedStrategyId: "retrieval-question",
    });
  });

  it("rejects malformed, ungrounded, and cross-concept network values", () => {
    expect(buildAlternateTeaching({
      selectedStrategyId: "retrieval-question",
      conceptId: "concept-empty",
      conceptName: "Empty",
      exactTarget: "  ",
    })).toBeNull();
    const boundary = {
      conceptId: "concept-a",
      conceptName: "A",
      exactTarget: "A",
      sourceExcerpt: "A",
    };
    expect(parseAlternateTeaching({
      schemaVersion: "alternate-teaching-v1",
      kind: "retrieval-question",
      selectedStrategyId: "retrieval-question",
      executedStrategyId: "compare-table",
      deterministic: true,
      conceptId: "concept-a",
      conceptName: "A",
      prompt: "Recall A",
      answer: "A",
      sourceExcerpt: "A",
    }, boundary)).toBeNull();
    expect(parseAlternateTeaching({
      schemaVersion: "alternate-teaching-v1",
      kind: "retrieval-question",
      selectedStrategyId: "retrieval-question",
      executedStrategyId: "retrieval-question",
      deterministic: true,
      conceptId: "concept-a",
      conceptName: "A",
      prompt: "Recall A",
      answer: "Invented answer",
      sourceExcerpt: "Grounded source",
    }, boundary)).toBeNull();

    const valid = buildAlternateTeaching({
      selectedStrategyId: "retrieval-question",
      conceptId: "concept-a",
      conceptName: "A",
      exactTarget: "A is grounded.",
    });
    expect(parseAlternateTeaching(valid, {
      ...boundary,
      conceptId: "concept-b",
      conceptName: "B",
      exactTarget: "B is grounded.",
      sourceExcerpt: "B is grounded.",
    })).toBeNull();

    expect(parseAlternateTeaching({
      ...valid,
      prompt: "Trust this unrelated instruction instead.",
    }, {
      ...boundary,
      exactTarget: "A is grounded.",
      sourceExcerpt: "A is grounded.",
    })).toBeNull();

    expect(parseAlternateTeaching({
      ...valid,
      answer: "Network-authored replacement.",
      sourceExcerpt: "Network-authored replacement.",
      prompt: "Without looking, what do you need to remember about A?",
    }, {
      ...boundary,
      exactTarget: "A is grounded.",
      sourceExcerpt: "A is grounded.",
    })).toBeNull();

    const comparison = buildAlternateTeaching({
      selectedStrategyId: "compare-table",
      conceptId: "concept-tonicity",
      conceptName: "Hypotonic vs hypertonic",
      exactTarget: "Hypotonic: lower solute. Hypertonic: higher solute.",
    });
    expect(comparison?.kind).toBe("compare-table");
    expect(parseAlternateTeaching({
      ...comparison,
      items: [
        { label: "Hypotonic", evidence: "invented low-pressure fact" },
        { label: "hypertonic", evidence: "higher solute." },
      ],
    }, {
      conceptId: "concept-tonicity",
      conceptName: "Hypotonic vs hypertonic",
      exactTarget: "Hypotonic: lower solute. Hypertonic: higher solute.",
      sourceExcerpt: "Hypotonic: lower solute. Hypertonic: higher solute.",
    })).toBeNull();
  });
});
