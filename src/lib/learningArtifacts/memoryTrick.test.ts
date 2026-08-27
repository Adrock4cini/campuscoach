import { describe, expect, it } from "vitest";
import {
  memoryTrickBoundaryKey,
  parseMemoryTrickArtifact,
  type MemoryTrickBoundary,
} from "./memoryTrick";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "./types";

const boundary: MemoryTrickBoundary = {
  conceptId: "concept-desert",
  conceptName: "Desert vs. dessert",
  exactTarget: "Dessert has two s's; desert has one.",
  sourceExcerpt: "A dessert is a sweet course served after a meal.",
  classId: "english",
  studyScope: { type: "exam", id: "exam-1", label: "Vocabulary test" },
};

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "artifact-secret-id",
    kind: "mnemonic",
    prompt_version: CURRENT_ARTIFACT_PROMPT_VERSION,
    stale: false,
    client_class_id: "english",
    study_scope_type: "exam",
    study_scope_id: "exam-1",
    concept_ids: ["concept-desert"],
    payload: {
      items: [{
        id: "mnemonic-secret-id",
        conceptId: "concept-desert",
        conceptName: "Desert vs. dessert",
        target: "Dessert has two s's; desert has one.",
        mnemonic: "Dessert has two s's because you want seconds.",
        technique: "association",
        origin: "ai_created",
        explanation: "Connect the second s in dessert with asking for seconds.",
        sourceExcerpt: "A dessert is a sweet course served after a meal.",
      }],
    },
    ...overrides,
  };
}

describe("parseMemoryTrickArtifact", () => {
  it("normalizes the settled mnemonic contract without replacing the academic target", () => {
    expect(parseMemoryTrickArtifact(artifact(), boundary)).toEqual({
      artifactId: "artifact-secret-id",
      origin: "ai_created",
      provenanceLabel: "AI-created memory trick",
      technique: "association",
      techniqueLabel: "Association",
      target: "Dessert has two s's; desert has one.",
      sourceExcerpt: "A dessert is a sweet course served after a meal.",
      mnemonic: "Dessert has two s's because you want seconds.",
      howToUse: "Connect the second s in dessert with asking for seconds.",
      selfCheckPrompt: "Without looking, what do you need to remember about Desert vs. dessert?",
      selfCheckAnswer: "Dessert has two s's; desert has one.",
    });
  });

  it("labels only explicitly curated content as a known memory trick", () => {
    const known = artifact();
    (known.payload.items[0] as { origin: string }).origin = "known";
    expect(parseMemoryTrickArtifact(known, boundary)?.provenanceLabel).toBe("Known memory trick");

    const unlabeled = artifact();
    (unlabeled.payload.items[0] as { origin: string }).origin = "probably_known";
    expect(parseMemoryTrickArtifact(unlabeled, boundary)).toBeNull();
  });

  it.each([
    ["another class", { client_class_id: "science" }],
    ["another study target", { study_scope_id: "exam-2" }],
    ["more than one concept", { concept_ids: ["concept-desert", "concept-dune"] }],
    ["a stale row", { stale: true }],
    ["an older generator", { prompt_version: "v8" }],
  ])("fails closed for %s", (_label, overrides) => {
    expect(parseMemoryTrickArtifact(artifact(overrides), boundary)).toBeNull();
  });

  it("rejects an old target after the source boundary changes", () => {
    const staleTarget = artifact();
    staleTarget.payload.items[0].target = "Desert has one s; dessert has two s letters.";
    staleTarget.payload.items[0].sourceExcerpt = "The teacher's revised vocabulary note.";
    expect(parseMemoryTrickArtifact(staleTarget, boundary)).toBeNull();

    const emptyTarget = artifact();
    emptyTarget.payload.items[0].target = "";
    expect(parseMemoryTrickArtifact(emptyTarget, boundary)).toBeNull();

    const wrongConceptName = artifact();
    wrongConceptName.payload.items[0].conceptName = "Another student's concept";
    expect(parseMemoryTrickArtifact(wrongConceptName, boundary)).toBeNull();
  });

  it("changes its boundary key when any source boundary changes", () => {
    expect(memoryTrickBoundaryKey(boundary)).not.toBe(memoryTrickBoundaryKey({
      ...boundary,
      conceptId: "concept-dune",
    }));
    expect(memoryTrickBoundaryKey(boundary)).not.toBe(memoryTrickBoundaryKey({
      ...boundary,
      conceptName: "Dessert spelling",
    }));
    expect(memoryTrickBoundaryKey(boundary)).not.toBe(memoryTrickBoundaryKey({
      ...boundary,
      studyScope: { ...boundary.studyScope, id: "exam-2" },
    }));
    expect(memoryTrickBoundaryKey(boundary)).not.toBe(memoryTrickBoundaryKey({
      ...boundary,
      captureId: "capture-1",
    }));
  });
});
