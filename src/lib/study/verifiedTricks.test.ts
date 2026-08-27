import { describe, expect, it, vi } from "vitest";
import {
  OMITTED_EXAMPLES,
  VERIFIED_TRICKS,
  selectVerifiedTrick,
  selectVerifiedTricks,
  trickCardLabel,
} from "./verifiedTricks";
import { assignmentHelpEvidence } from "@/lib/assignments/assignmentHelpEvidence";

const ids = (query: Parameters<typeof selectVerifiedTricks>[0]) =>
  selectVerifiedTricks(query, { max: 10 }).map((match) => match.trick.id);

describe("verified tricks library — integrity", () => {
  it("has unique ids and states caveats or a clean bill for every entry", () => {
    const seen = new Set<string>();
    for (const trick of VERIFIED_TRICKS) {
      expect(seen.has(trick.id)).toBe(false);
      seen.add(trick.id);
      expect(trick.why.length).toBeGreaterThan(20);
      expect(trick.conditions.length).toBeGreaterThan(5);
      expect(Array.isArray(trick.caveats)).toBe(true);
      expect(trick.examples.length).toBeGreaterThan(0);
    }
  });

  it("never labels a style or approximation as verified", () => {
    for (const trick of VERIFIED_TRICKS) {
      if (trick.sourceType === "style_guidance" || trick.sourceType === "evidence_based_method") {
        expect(trick.tier).not.toBe("verified");
      }
    }
  });

  it("is a pure lookup — no model call, no network, no storage", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const match = selectVerifiedTrick({ problemText: "What is 14% of 50?" });
    expect(match?.trick.id).toBe("percent-swap");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("math retrieval and conditions", () => {
  it("matches percent swap on a% of b and works the student's own numbers", () => {
    const match = selectVerifiedTrick({ conceptName: "Percent of a number", problemText: "What is 14% of 50?" });
    expect(match?.trick.id).toBe("percent-swap");
    expect(match?.workedExample).toBe("14% of 50 = 50% of 14 = 7");
    expect(match?.trick.transferCheck?.prompt).toContain("18% of 50");
  });

  it("does not offer percent swap on a percent increase question", () => {
    expect(ids({ conceptName: "Percent increase", problemText: "Find the percent increase from 40 to 50." }))
      .not.toContain("percent-swap");
  });

  it("carries correctly on the two-digit x11 trick", () => {
    const match = selectVerifiedTrick({ problemText: "57 × 11 = ?" });
    expect(match?.trick.id).toBe("times-eleven");
    expect(match?.workedExample).toContain("627");
    expect(match?.trick.tier).toBe("conditional");
    expect(match?.trick.caveats.join(" ")).toMatch(/carry/i);
  });

  it("handles x5, x9 and x25", () => {
    expect(selectVerifiedTrick({ problemText: "48 × 5" })?.workedExample).toBe("48 × 5 = 24 × 10 = 240");
    expect(selectVerifiedTrick({ problemText: "7 × 9" })?.workedExample).toBe("7 × 9 = 70 − 7 = 63");
    expect(selectVerifiedTrick({ problemText: "36 × 25" })?.workedExample).toContain("900");
    expect(selectVerifiedTrick({ problemText: "18 × 25" })?.workedExample).toContain("not a multiple of 4");
  });

  it("squares a number ending in 5", () => {
    const match = selectVerifiedTrick({ problemText: "Compute 35 squared." });
    expect(match?.trick.id).toBe("square-ending-in-five");
    expect(match?.workedExample).toContain("1225");
  });

  it("matches difference of squares only on a difference", () => {
    expect(ids({ problemText: "Factor x^2 - 49" })).toContain("difference-of-squares");
    expect(ids({ problemText: "Simplify x^2 + 49" })).not.toContain("difference-of-squares");
  });

  it("offers keep-change-flip only for fraction division", () => {
    expect(ids({ conceptName: "Dividing fractions", problemText: "3/4 ÷ 2/5" })).toContain("keep-change-flip");
    expect(ids({ conceptName: "Multiplying fractions", problemText: "3/4 × 2/5" })).not.toContain("keep-change-flip");
    expect(ids({ conceptName: "Adding fractions", problemText: "3/4 + 2/5" })).not.toContain("keep-change-flip");
  });

  it("keeps the PEMDAS left-to-right caveat explicit", () => {
    const match = selectVerifiedTrick({ conceptName: "Order of operations" });
    expect(match?.trick.id).toBe("order-of-operations");
    expect(match?.trick.trick).toMatch(/left to right/i);
    expect(match?.trick.caveats.join(" ")).toMatch(/does NOT mean multiplication before division/i);
    expect(match?.trick.caveats.join(" ")).toMatch(/8 ÷ 4 × 2 = 4/);
  });

  it("cross-multiplies only an equation of ratios", () => {
    expect(ids({ conceptName: "Proportions", problemText: "Solve 3/4 = x/12" })).toContain("cross-multiplication");
    expect(ids({ conceptName: "Simplify the fraction", problemText: "Reduce 8/12" })).not.toContain("cross-multiplication");
  });

  it("restricts FOIL to two binomials and names the general principle", () => {
    const match = selectVerifiedTrick({ problemText: "Expand (x + 3)(x - 2)" });
    expect(match?.trick.id).toBe("foil-binomials");
    expect(match?.trick.caveats.join(" ")).toMatch(/distributive property/i);
    expect(ids({ problemText: "Expand (x + 3)(x^2 - 2x + 1)" })).not.toContain("foil-binomials");
  });

  it("covers divisibility by 3, 4, 8, 9 and 11", () => {
    const found = ids({ conceptName: "Divisibility rules", problemText: "Is 2915 divisible by 11?" });
    for (const id of ["divisibility-3", "divisibility-4", "divisibility-8", "divisibility-9", "divisibility-11"]) {
      expect(found).toContain(id);
    }
  });

  it("labels casting out nines as an error check, not a proof", () => {
    const match = selectVerifiedTrick({ conceptName: "Checking my answer in arithmetic" });
    expect(match?.trick.id).toBe("casting-out-nines");
    expect(match?.trick.caveats.join(" ")).toMatch(/only detect errors, never prove/i);
  });

  it("marks the rule of 72 as an approximation", () => {
    const match = selectVerifiedTrick({ conceptName: "Compound interest" });
    expect(match?.trick.id).toBe("rule-of-72");
    expect(match?.trick.tier).toBe("conditional");
    expect(match?.trick.trick).toMatch(/≈/);
  });

  it("finds slope rise over run and flags the vertical-line case", () => {
    const match = selectVerifiedTrick({ conceptName: "Slope of a line" });
    expect(match?.trick.id).toBe("slope-rise-run");
    expect(match?.trick.caveats.join(" ")).toMatch(/undefined/i);
  });

  it("keeps 'of means multiply' conditional on 'out of'", () => {
    const match = VERIFIED_TRICKS.find((trick) => trick.id === "of-means-multiply");
    expect(match?.tier).toBe("conditional");
    expect(match?.caveats.join(" ")).toMatch(/out of/i);
  });
});

describe("english retrieval", () => {
  it("matches affect/effect with both exceptions encoded", () => {
    const match = selectVerifiedTrick({ conceptName: "affect vs effect" });
    expect(match?.trick.id).toBe("affect-effect");
    expect(match?.trick.caveats.join(" ")).toMatch(/effect' is also a verb/i);
    expect(match?.trick.tier).toBe("conditional");
  });

  it("matches stationery/stationary and dessert/desert", () => {
    expect(selectVerifiedTrick({ conceptName: "stationery vs stationary" })?.trick.id).toBe("stationery-stationary");
    expect(selectVerifiedTrick({ conceptName: "dessert vs desert" })?.trick.id).toBe("dessert-desert");
  });

  it("never presents I-before-E as a verified rule", () => {
    expect(VERIFIED_TRICKS.some((trick) => trick.id === "i-before-e")).toBe(false);
    expect(ids({ conceptName: "i before e except after c", problemText: "Spell 'weird'." })).not.toContain("i-before-e");
    expect(OMITTED_EXAMPLES.some((entry) => entry.id === "i-before-e")).toBe(true);
  });

  it("rejects fake etymology outright", () => {
    expect(VERIFIED_TRICKS.some((trick) => trick.sourceType === "curated_mnemonic" && /acronym for/i.test(trick.why)))
      .toBe(false);
    expect(OMITTED_EXAMPLES.some((entry) => entry.id === "fake-etymology")).toBe(true);
  });

  it("treats the Oxford comma and active voice as style, not correctness", () => {
    const oxford = VERIFIED_TRICKS.find((trick) => trick.id === "oxford-comma");
    expect(oxford?.tier).toBe("conditional");
    expect(oxford?.sourceType).toBe("style_guidance");
    expect(VERIFIED_TRICKS.find((trick) => trick.id === "active-voice")?.sourceType).toBe("style_guidance");
  });

  it("keeps silent e non-universal", () => {
    const silent = VERIFIED_TRICKS.find((trick) => trick.id === "silent-e");
    expect(silent?.tier).toBe("conditional");
    expect(silent?.caveats.join(" ")).toMatch(/Not universal/i);
  });
});

describe("science retrieval", () => {
  it("matches taxonomy, ROY G BIV, metric prefixes, PMAT and OIL RIG", () => {
    expect(ids({ conceptName: "Taxonomy classification ranks" })).toContain("taxonomy-order");
    expect(ids({ conceptName: "Visible light spectrum" })).toContain("roy-g-biv");
    expect(ids({ conceptName: "Metric unit conversions" })).toContain("metric-prefixes");
    expect(ids({ conceptName: "Phases of mitosis" })).toContain("mitosis-pmat");
    expect(ids({ conceptName: "Oxidation and reduction" })).toContain("oil-rig");
  });

  it("phrases food-chain arrows as energy transfer", () => {
    const match = selectVerifiedTrick({ conceptName: "Food chain" });
    expect(match?.trick.id).toBe("food-chain-arrows");
    expect(match?.trick.trick).toMatch(/energy moves/i);
  });

  it("keeps 'powerhouse' as a cue, not an explanation", () => {
    const match = VERIFIED_TRICKS.find((trick) => trick.id === "mitochondria-powerhouse");
    expect(match?.tier).toBe("conditional");
    expect(match?.caveats.join(" ")).toMatch(/memory cue, not an explanation/i);
  });
});

describe("study strategies stay out of Assignment Help", () => {
  it("excludes the study tier by default and includes it on request", () => {
    expect(ids({ conceptName: "best study technique for memorizing" })).not.toContain("retrieval-practice");
    const withStrategies = selectVerifiedTricks(
      { conceptName: "best study technique for memorizing" },
      { includeStudyStrategies: true, max: 10 },
    ).map((match) => match.trick.id);
    expect(withStrategies).toContain("retrieval-practice");
  });

  it("keeps sleep as a habit, never an in-problem trick", () => {
    const sleep = VERIFIED_TRICKS.find((trick) => trick.id === "sleep-consolidation");
    expect(sleep?.tier).toBe("study_strategy");
    expect(ids({ problemText: "What is 14% of 50?" })).not.toContain("sleep-consolidation");
  });
});

describe("ranking and labelling", () => {
  it("prefers a technique the student has responded to, without locking them in", () => {
    const query = { conceptName: "Divisibility rules" };
    const base = selectVerifiedTricks(query, { max: 10 }).map((m) => m.trick.id);
    const ranked = selectVerifiedTricks(query, { preferredTechniques: ["visual"], max: 10 })
      .map((m) => m.trick.id);
    expect(ranked.sort()).toEqual(base.sort());
  });

  it("labels each card honestly", () => {
    const percent = VERIFIED_TRICKS.find((t) => t.id === "percent-swap")!;
    const dessert = VERIFIED_TRICKS.find((t) => t.id === "dessert-desert")!;
    const retrieval = VERIFIED_TRICKS.find((t) => t.id === "retrieval-practice")!;
    expect(trickCardLabel(percent)).toBe("Verified shortcut");
    expect(trickCardLabel(dessert)).toBe("Memory cue");
    expect(trickCardLabel(retrieval)).toBe("Study method");
  });
});

describe("mastery semantics for a shown trick", () => {
  it("does not move mastery when the student only saw the trick", () => {
    const evidence = assignmentHelpEvidence(
      { conceptId: "c1", outcome: "answer_shown_only", eventId: "e1" },
      null,
    );
    expect(evidence.recordsMastery).toBe(false);
    expect(evidence.masteryUpdate).toBeNull();
    expect(evidence.recordsExposure).toBe(true);
  });

  it("moves mastery when the student passes the transfer check", () => {
    const evidence = assignmentHelpEvidence(
      { conceptId: "c1", outcome: "solved_after_help", eventId: "e2" },
      null,
    );
    expect(evidence.recordsMastery).toBe(true);
    expect(evidence.masteryUpdate).not.toBeNull();
  });
});
