import { describe, expect, it } from "vitest";
import {
  buildCapturePolicyGroundedExcerptMap,
  buildExactMnemonicTarget,
  buildGroundedExcerptMap,
  MAX_GROUNDED_EXCERPT_CHARS,
  selectCaptureGroundingSource,
} from "./grounded-excerpt";

describe("grounded source excerpts", () => {
  it("uses confirmed assignment text instead of conflicting OCR", () => {
    const decision = selectCaptureGroundingSource({
      kind: "scan-assignment",
      raw_text: "What is 19% of 50?",
      practice_source_status: "confirmed",
      practice_source_text: "What is 14% of 50?",
      practice_source_version: 2,
      practice_source_hash: "a".repeat(64),
      practice_concept_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(decision).toMatchObject({
      kind: "confirmed-assignment",
      sourceText: "What is 14% of 50?",
      sourceVersion: 2,
    });
    expect(decision).not.toMatchObject({ sourceText: expect.stringContaining("19%") });
    if (decision.kind !== "confirmed-assignment") throw new Error("expected confirmed source");
    const excerpts = buildGroundedExcerptMap([{
      id: "confirmed-percent",
      name: "Percent of a Number",
      definition: "14% means 14 ÷ 100 = 0.14, and 0.14 × 50 = 7.",
      examples: [decision.sourceText],
      capture_id: "assignment-capture",
    }], new Map([["assignment-capture", decision.sourceText]]));
    expect(excerpts.get("confirmed-percent")).toBe("What is 14% of 50?");
    expect(excerpts.get("confirmed-percent")).not.toContain("19%");
  });

  it("fails closed instead of exposing unconfirmed assignment OCR", () => {
    const decision = selectCaptureGroundingSource({
      kind: "scan-assignment",
      raw_text: "What is 19% of 50?",
      practice_source_status: "needs_review",
      practice_source_text: "What is 19% of 50?",
      practice_source_version: 1,
      practice_source_hash: null,
      practice_concept_id: null,
    });

    expect(decision).toEqual({ kind: "assignment-confirmation-required" });
    expect(decision).not.toHaveProperty("sourceText");
  });

  it("excludes assignment-only evidence from class/recent while keeping shared material evidence", () => {
    const percentConcept = {
      name: "Percent of a Number",
      definition: "14% means 14 ÷ 100 = 0.14, and 0.14 × 50 = 7.",
      examples: ["What is 14% of 50?"],
      capture_id: "confirmed-assignment",
    };
    const excerpts = buildCapturePolicyGroundedExcerptMap([
      // Put the sibling first so it would steal the assignment excerpt if the
      // pinned-concept filter were ever removed.
      { id: "assignment-sibling", ...percentConcept },
      { id: "assignment-pinned", ...percentConcept },
      {
        id: "unconfirmed-concept",
        name: "Percent of a Number",
        definition: "35% means 35 ÷ 100 = 0.35, and 0.35 × 40 = 14.",
        examples: ["What is 35% of 40?"],
        capture_id: "unconfirmed-assignment",
      },
      {
        id: "ordinary-note",
        name: "Osmosis",
        definition: "Osmosis moves water across a membrane.",
        capture_id: "ordinary-capture",
      },
      {
        id: "shared-concept",
        name: "Photosynthesis",
        definition: "Photosynthesis converts light energy into chemical energy.",
        capture_id: "confirmed-assignment",
      },
    ], [
      {
        id: "confirmed-assignment",
        kind: "scan-assignment",
        raw_text: "What is 19% of 50?",
        practice_source_status: "confirmed",
        practice_source_text: "What is 14% of 50?",
        practice_source_version: 2,
        practice_source_hash: "a".repeat(64),
        practice_concept_id: "assignment-pinned",
      },
      {
        id: "unconfirmed-assignment",
        kind: "scan-assignment",
        raw_text: "What is 35% of 40?",
        practice_source_status: "needs_review",
        practice_source_text: "What is 35% of 40?",
        practice_source_version: 1,
        practice_source_hash: null,
        practice_concept_id: null,
      },
      {
        id: "ordinary-capture",
        kind: "quick-note",
        raw_text: "Osmosis moves water across a membrane.",
      },
      {
        id: "shared-material",
        kind: "scan-material",
        raw_text: "Photosynthesis converts light energy into chemical energy.",
      },
    ], {
      captureIdsByConcept: new Map([
        ["assignment-sibling", ["confirmed-assignment"]],
        ["assignment-pinned", ["confirmed-assignment"]],
        ["unconfirmed-concept", ["unconfirmed-assignment"]],
        ["ordinary-note", ["ordinary-capture"]],
        ["shared-concept", ["confirmed-assignment", "shared-material"]],
      ]),
    });

    expect(excerpts.has("assignment-pinned")).toBe(false);
    expect(excerpts.has("assignment-sibling")).toBe(false);
    expect(excerpts.has("unconfirmed-concept")).toBe(false);
    expect(excerpts.get("ordinary-note")).toBe("Osmosis moves water across a membrane.");
    expect(excerpts.get("shared-concept")).toBe(
      "Photosynthesis converts light energy into chemical energy.",
    );
    expect([...excerpts.values()].join(" ")).not.toContain("14%");
    expect([...excerpts.values()].join(" ")).not.toContain("19%");
    expect([...excerpts.values()].join(" ")).not.toContain("35%");
  });

  it("assigns relevant, bounded, non-repeated chunks from one capture", () => {
    const raw = [
      "Mitosis makes two genetically identical daughter cells.",
      "Meiosis makes four genetically different cells used in sexual reproduction.",
      "The teacher said the contrast will be on Friday's test.",
      "Extra background ".repeat(80),
    ].join(" ");
    const excerpts = buildGroundedExcerptMap([
      {
        id: "mitosis",
        name: "Mitosis",
        definition: "Mitosis makes identical cells.",
        capture_id: "capture-1",
      },
      {
        id: "meiosis",
        name: "Meiosis",
        definition: "Meiosis makes different cells.",
        capture_id: "capture-1",
      },
    ], new Map([["capture-1", raw]]));

    expect(excerpts.get("mitosis")).toContain("Mitosis");
    expect(excerpts.get("meiosis")).toContain("Meiosis");
    expect(excerpts.get("mitosis")!.length).toBeLessThanOrEqual(MAX_GROUNDED_EXCERPT_CHARS);
    expect(excerpts.get("meiosis")!.length).toBeLessThanOrEqual(MAX_GROUNDED_EXCERPT_CHARS);
    expect(excerpts.get("mitosis")).not.toBe(excerpts.get("meiosis"));
    expect(excerpts.get("mitosis")).not.toBe(raw);
  });

  it("never repeats one short full capture across several concepts", () => {
    const raw = "Dessert has two S letters because you want seconds.";
    const excerpts = buildGroundedExcerptMap([
      { id: "first", name: "Dessert", capture_id: "capture-1" },
      { id: "second", name: "Seconds", capture_id: "capture-1" },
    ], new Map([["capture-1", raw]]));

    expect([...excerpts.values()]).toEqual([raw]);
  });

  it("does not label an unrelated same-capture sentence as concept evidence", () => {
    const excerpts = buildGroundedExcerptMap([
      { id: "mitosis", name: "Mitosis", definition: "Cell division", capture_id: "capture-1" },
    ], new Map([["capture-1", "The homework is due on Friday morning."]]));

    expect(excerpts.has("mitosis")).toBe(false);
  });

  it("does not accept one generic shared word as grounded evidence", () => {
    const excerpts = buildGroundedExcerptMap([
      {
        id: "cell-transport",
        name: "Cell transport",
        definition: "Osmosis moves water across membranes.",
        capture_id: "capture-1",
      },
    ], new Map([["capture-1", "The cell phone battery died during class."]]));

    expect(excerpts.has("cell-transport")).toBe(false);
  });

  it("preserves an exact thin equation despite one-character number tokens", () => {
    const excerpts = buildGroundedExcerptMap([
      {
        id: "addition",
        name: "2 + 2 = 4",
        definition: "2 + 2 equals 4.",
        capture_id: "capture-math",
      },
    ], new Map([["capture-math", "2 + 2 = 4"]]));

    expect(excerpts.get("addition")).toBe("2 + 2 = 4");
  });

  it("preserves a plain percent problem despite short numeric tokens", () => {
    const raw = "14% of 50";
    const excerpts = buildGroundedExcerptMap([
      {
        id: "percent",
        name: "Percent of a Number",
        definition: "14% means 14 ÷ 100 = 0.14, and 0.14 × 50 = 7.",
        examples: ["What is 14% of 50?"],
        capture_id: "capture-percent",
      },
    ], new Map([["capture-percent", raw]]));

    expect(excerpts.get("percent")).toBe(raw);
  });

  it("matches the exact captured discount wording without accepting a substring", () => {
    const raw = "$80 jacket 25% off";
    const excerpts = buildGroundedExcerptMap([{
      id: "discount",
      name: "Percent Discount",
      definition: "25% of $80 is $20, so the sale price is $60.",
      examples: [raw],
      capture_id: "capture-discount",
    }], new Map([["capture-discount", raw]]));

    expect(excerpts.get("discount")).toBe(raw);
  });

  it("does not match a supported problem hidden inside an unsupported sentence", () => {
    const raw = "Page 159: 14% of 50";
    const excerpts = buildGroundedExcerptMap([{
      id: "percent",
      name: "Percent of a Number",
      definition: "14% means 14 ÷ 100 = 0.14, and 0.14 × 50 = 7.",
      examples: ["14% of 50"],
      capture_id: "capture-percent",
    }], new Map([["capture-percent", raw]]));

    expect(excerpts.has("percent")).toBe(false);
  });

  it("chooses a bounded exact mnemonic target without blending in the trick", () => {
    const target = buildExactMnemonicTarget({
      id: "dessert",
      name: "Dessert spelling",
      definition: "Dessert is spelled with two consecutive S letters.",
      examples: ["You may want seconds of dessert."],
    }, "Dessert has two S letters.");
    expect(target).toBe("Dessert has two S letters.");
    expect(target).not.toContain("want seconds");
  });
});
