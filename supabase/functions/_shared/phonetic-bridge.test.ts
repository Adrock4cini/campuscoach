import { describe, expect, it } from "vitest";
import {
  findCuratedPhoneticBridge,
  scorePhoneticBridge,
  soundOverlap,
} from "./phonetic-bridge.ts";
import { bridgeAnswerTerm, techniqueDisplayLabel, inventedCueDisclosure, nextTechniqueFamily } from "./mnemonic-quality.ts";

describe("phonetic bridges", () => {
  it("accepts a Marilyn/apples-style bridge for Maryland -> Annapolis", () => {
    const score = scorePhoneticBridge({
      bridge: "Marilyn picks apples.",
      cueTerm: "Maryland",
      answerTerm: "Annapolis",
    });
    expect(score.rejections).toEqual([]);
    expect(score.twoWayMapping).toBe(true);
  });

  it("accepts an anatomy term bridge", () => {
    const score = scorePhoneticBridge({
      bridge: "A claw rests on your collar.",
      cueTerm: "clavicle",
      answerTerm: "collarbone",
    });
    expect(score.rejections).toEqual([]);
  });

  it("rejects a sentence with no connection to either side", () => {
    const score = scorePhoneticBridge({
      bridge: "The quiet dog waited by the river.",
      cueTerm: "Maryland",
      answerTerm: "Annapolis",
    });
    expect(score.rejections).toContain("bridge-does-not-cue-the-prompt");
    expect(score.rejections).toContain("bridge-does-not-cue-the-answer");
  });

  it("rejects a bridge that cues the prompt but not the answer", () => {
    const score = scorePhoneticBridge({
      bridge: "Marilyn waves hello.",
      cueTerm: "Maryland",
      answerTerm: "Annapolis",
    });
    expect(score.rejections).toContain("bridge-does-not-cue-the-answer");
  });

  it("rejects wordplay dressed up as etymology", () => {
    const score = scorePhoneticBridge({
      bridge: "Marilyn picks apples.",
      cueTerm: "Maryland",
      answerTerm: "Annapolis",
      explanation: "Annapolis is named after the apple orchards of Maryland.",
    });
    expect(score.rejections).toContain("bridge-implies-a-false-fact");
  });

  it("rejects a bridge longer than the fact it replaces", () => {
    const score = scorePhoneticBridge({
      bridge: "Marilyn slowly picks shining apples beside the harbour while singing quietly to seven sailors today",
      cueTerm: "Maryland",
      answerTerm: "Annapolis",
    });
    expect(score.rejections).toContain("bridge-harder-than-the-fact");
  });

  it("scores real sound overlap above unrelated words", () => {
    expect(soundOverlap("Marilyn", "Maryland")).toBeGreaterThan(soundOverlap("river", "Maryland"));
  });

  it("reuses a curated bridge with no model call", () => {
    const curated = findCuratedPhoneticBridge("Maryland", "The capital of Maryland is Annapolis.");
    expect(curated?.bridge).toContain("Marilyn");
    expect(findCuratedPhoneticBridge("Ohio", "Columbus")).toBeNull();
  });

  it("derives the answer half of a paired fact", () => {
    expect(bridgeAnswerTerm("The capital of Maryland is Annapolis", "Maryland")).toBe("annapolis");
  });

  it("labels the technique as invented wordplay", () => {
    expect(techniqueDisplayLabel("phonetic_bridge")).toBe("Wordplay memory");
    expect(inventedCueDisclosure("phonetic_bridge")).toMatch(/made-up/i);
    expect(inventedCueDisclosure("visual_image")).toBeNull();
  });

  it("switches away from wordplay when the student asks for another way", () => {
    expect(nextTechniqueFamily("phonetic_bridge", { subjectProfileId: null })).not.toBe("sound");
  });
});
