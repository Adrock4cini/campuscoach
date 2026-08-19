import { describe, expect, it } from "vitest";
import {
  buildExactMnemonicTarget,
  buildGroundedExcerptMap,
  MAX_GROUNDED_EXCERPT_CHARS,
} from "./grounded-excerpt";

describe("grounded source excerpts", () => {
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
