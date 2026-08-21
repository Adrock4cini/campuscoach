/**
 * Concept identity — the dedupe guarantee.
 *
 * GOOD: obvious aliases of one idea collapse to one concept.
 * BAD:  genuinely different concepts must NOT be merged.
 */
import { describe, expect, it } from "vitest";
import {
  conceptCanonicalKey,
  dedupeConceptCandidates,
  isSameConcept,
} from "@/lib/intelligence/conceptIdentity";

describe("conceptCanonicalKey", () => {
  it("collapses percent-of-a-number wordings, including a numeric example", () => {
    const keys = [
      "14% of 50",
      "Percent of a number",
      "Finding a Percentage of a Number",
      "calculating percentages of numbers",
    ].map((name) => conceptCanonicalKey(name));
    expect(new Set(keys).size).toBe(1);
  });

  it("collapses fraction→percent conversion wordings", () => {
    expect(conceptCanonicalKey("Converting Fractions to Percentages"))
      .toBe(conceptCanonicalKey("fraction to percent conversion"));
  });

  it("keeps genuinely different concepts apart", () => {
    expect(conceptCanonicalKey("Percent increase"))
      .not.toBe(conceptCanonicalKey("Percent of a number"));
    expect(conceptCanonicalKey("Photosynthesis"))
      .not.toBe(conceptCanonicalKey("Cellular respiration"));
    expect(isSameConcept({ name: "Mitosis" }, { name: "Meiosis" })).toBe(false);
  });

  it("never collapses distinct number-only names into one bucket", () => {
    expect(conceptCanonicalKey("12", "Twelve times table"))
      .not.toBe(conceptCanonicalKey("7", "Seven times table"));
  });
});

describe("dedupeConceptCandidates", () => {
  it("merges into existing memory and drops in-batch duplicates", () => {
    const result = dedupeConceptCandidates(
      [
        { name: "Percent of a number" },
        { name: "14% of 50" },
        { name: "Percent increase" },
      ],
      [{ id: "existing-1", name: "Finding a percentage of a number" }],
    );

    expect(result.fresh.map((c) => c.name)).toEqual(["Percent increase"]);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].conceptId).toBe("existing-1");
  });

  it("raises emphasis on an existing concept instead of cloning it for a teacher hint", () => {
    const result = dedupeConceptCandidates(
      [{ name: "Percent of a number", professor_emphasis: true }],
      [{ id: "existing-1", name: "percentages of numbers", professor_emphasis: false }],
    );

    expect(result.fresh).toEqual([]);
    expect(result.emphasiseConceptIds).toEqual(["existing-1"]);
  });

  it("does not re-flag emphasis that is already set", () => {
    const result = dedupeConceptCandidates(
      [{ name: "Percent of a number", professor_emphasis: true }],
      [{ id: "existing-1", name: "percent of a number", professor_emphasis: true }],
    );
    expect(result.emphasiseConceptIds).toEqual([]);
  });
});
