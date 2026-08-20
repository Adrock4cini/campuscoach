import { describe, expect, it } from "vitest";
import {
  candidateFromVerifiedShortcut,
  evaluateMnemonicCandidate,
  nextTechniqueFamily,
  selectBestMnemonicCandidate,
  techniqueDisplayLabel,
  techniqueFamily,
  type MnemonicCandidate,
  type MnemonicQualityContext,
} from "./mnemonicQuality";
import { percentSwap } from "./strategyToolbox";

const anatomy: MnemonicQualityContext = {
  target: "The radius is the forearm bone on the thumb side of the arm.",
  conceptName: "Radius",
  sourceExcerpt: "The radius is the forearm bone on the thumb side of the arm.",
  subjectProfileId: "life_science",
  taskKind: "memorize-terms",
};

describe("Make It Stick — validity gate", () => {
  it("accepts a verified percent-swap shortcut with its conditions", () => {
    const shortcut = percentSwap(14, 50)!;
    const candidate = candidateFromVerifiedShortcut(shortcut);
    const verdict = evaluateMnemonicCandidate(candidate, {
      target: "14% of 50 = 7",
      conceptName: "Percent of a number",
      sourceExcerpt: "Find 14% of 50.",
      subjectProfileId: "math",
      taskKind: "solve-problems",
    });
    expect(verdict.accepted).toBe(true);
    expect(candidate.explanation).toMatch(/commutative/i);
    expect(candidate.explanation.length).toBeGreaterThan(20);
    expect(techniqueDisplayLabel(candidate.technique, true)).toBe("Verified shortcut");
  });

  it("rejects a fabricated etymology", () => {
    const verdict = evaluateMnemonicCandidate({
      mnemonic: "Mitochondria comes from the Latin for tiny engine room.",
      technique: "word_roots",
      explanation: "Picture an engine room powering the cell.",
    }, {
      target: "Mitochondria release energy from glucose for the cell to use.",
      conceptName: "Mitochondria",
      sourceExcerpt: "Mitochondria release energy from glucose for the cell to use.",
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejections).toContain("unverified-etymology");
  });

  it("rejects an unconditioned numeric shortcut claim", () => {
    const verdict = evaluateMnemonicCandidate({
      mnemonic: "Just flip it: 18 × 5 = 90 always.",
      technique: "number_shape",
      explanation: "Flip the numbers.",
    }, {
      target: "To multiply by 5, halve the number and multiply by 10.",
      conceptName: "Times five",
      sourceExcerpt: "To multiply by 5, halve the number and multiply by 10.",
      subjectProfileId: "math",
      taskKind: "solve-problems",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejections).toContain("shortcut-missing-conditions");
  });
});

describe("Make It Stick — usefulness gate", () => {
  it("rejects an acronym that merely encodes a page heading", () => {
    const verdict = evaluateMnemonicCandidate({
      mnemonic: "Remember TCC: The Cell Cycle.",
      technique: "acronym",
      explanation: "TCC stands for the chapter title.",
    }, {
      target: "Chapter 4: The Cell Cycle",
      conceptName: "The cell cycle",
      sourceExcerpt: "Chapter 4: The Cell Cycle",
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejections).toContain("insufficient-source");
  });

  it("rejects a circular mnemonic that only repeats the fact", () => {
    const verdict = evaluateMnemonicCandidate({
      mnemonic: "Mitosis means mitosis — mitosis is just mitosis.",
      technique: "association",
      explanation: "Repeat the word mitosis.",
    }, {
      target: "Mitosis produces two identical daughter cells.",
      conceptName: "Mitosis",
      sourceExcerpt: "Mitosis produces two identical daughter cells.",
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejections).toContain("circular");
  });

  it("rejects an arbitrary acronym that is harder than the fact", () => {
    const verdict = evaluateMnemonicCandidate({
      mnemonic: "Recall QZXPRVK to know it.",
      technique: "acronym",
      explanation: "Each letter stands for a step you will invent yourself.",
    }, anatomy);
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejections.some((reason) => reason.startsWith("acronym") || reason === "no-list-to-encode"))
      .toBe(true);
  });

  it("accepts a grounded anatomy location association", () => {
    const verdict = evaluateMnemonicCandidate({
      mnemonic: "Point your thumb up like a radio dial — the radius runs down to the thumb.",
      technique: "body_map",
      explanation: "Touch your thumb, then trace the bone below it while you say radius.",
    }, anatomy);
    expect(verdict.accepted).toBe(true);
    expect(verdict.family).toBe("spatial");
    expect(techniqueDisplayLabel("body_map")).toBe("Location memory");
  });

  it("shows nothing when the source is insufficient", () => {
    const selection = selectBestMnemonicCandidate([{
      mnemonic: "Picture a busy factory floor.",
      technique: "visual",
      explanation: "Factory imagery for the cell.",
    }], {
      target: "UNIT 3 REVIEW",
      conceptName: "Unit 3",
      sourceExcerpt: "",
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
    });
    expect(selection).toBeNull();
  });
});

describe("Make It Stick — candidate selection from one model call", () => {
  const historyCandidates: MnemonicCandidate[] = [
    {
      mnemonic: "SAM: Stamp Act, Massacre, Tea Party.",
      technique: "acronym",
      explanation: "First letters of the three events.",
    },
    {
      mnemonic: "A stamped letter arrives, a street fight breaks out, then crates splash into the harbour.",
      technique: "story",
      explanation: "Walk the scene forward in the order the events happened.",
    },
  ];

  it("prefers sequence/story over an acronym for history chronology", () => {
    const selection = selectBestMnemonicCandidate(historyCandidates, {
      target: "The Stamp Act came first, then the Boston Massacre, then the Boston Tea Party.",
      conceptName: "Road to revolution",
      sourceExcerpt: "The Stamp Act came first, then the Boston Massacre, then the Boston Tea Party.",
      subjectProfileId: "history_social",
      taskKind: "sequence-events",
    })!;
    expect(selection.candidate.technique).toBe("story");
  });

  it("prefers a worked example over an arbitrary mnemonic in algebra", () => {
    const selection = selectBestMnemonicCandidate([
      {
        mnemonic: "Silly Xavier Ate Ninety Yaks to move the x.",
        technique: "acrostic",
        explanation: "A silly sentence about moving x.",
      },
      {
        mnemonic: "Undo the +3 first: 2x + 3 = 11 → 2x = 8 → x = 4.",
        technique: "worked_example",
        explanation: "Reverse the operations in the order they were applied, because equality is preserved on both sides.",
      },
    ], {
      target: "Solve 2x + 3 = 11 by undoing addition before division.",
      conceptName: "Two-step equations",
      sourceExcerpt: "Solve 2x + 3 = 11 by undoing addition before division.",
      subjectProfileId: "math",
      taskKind: "solve-problems",
    })!;
    expect(selection.candidate.technique).toBe("worked_example");
  });

  it("returns nothing rather than forcing a weak candidate", () => {
    expect(selectBestMnemonicCandidate([
      { mnemonic: "Remember it.", technique: "other", explanation: "Just remember." },
      {
        mnemonic: "Mitosis produces two identical daughter cells.",
        technique: "association",
        explanation: "Say the fact again.",
      },
    ], {
      target: "Mitosis produces two identical daughter cells.",
      conceptName: "Mitosis",
      sourceExcerpt: "Mitosis produces two identical daughter cells.",
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
    })).toBeNull();
  });
});

describe("Make It Stick — try another way", () => {
  it("switches technique family instead of rewording the same one", () => {
    const family = nextTechniqueFamily("body_map", {
      target: anatomy.target,
      conceptName: anatomy.conceptName,
      subjectProfileId: "life_science",
      taskKind: "memorize-terms",
      rejectFamilies: [techniqueFamily("body_map")],
    });
    expect(family).not.toBe("spatial");

    const rejected = selectBestMnemonicCandidate([{
      mnemonic: "Point your thumb up like a radio dial — the radius runs down to the thumb.",
      technique: "body_map",
      explanation: "Touch your thumb, then trace the bone below it.",
    }], { ...anatomy, rejectFamilies: ["spatial"] });
    expect(rejected).toBeNull();
  });
});
