import { describe, expect, it } from "vitest";
import {
  readMatchingSessionState,
  writeMatchingSessionState,
  type MatchingSessionState,
} from "./matchingSessionState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  } as Storage;
}

const pairs = [
  { id: "pair-a", conceptId: "concept-a" },
  { id: "pair-b", conceptId: "concept-b" },
  { id: "pair-c", conceptId: "concept-c" },
];
const state: MatchingSessionState = {
  artifactId: "artifact-a",
  attemptId: "10000000-0000-4000-8000-000000000001",
  confidence: "medium",
  durationSeconds: 12,
  completion: {
    correctFirstAttempt: 1,
    total: 2,
    firstChoices: [
      { leftPairId: "pair-a", rightPairId: "pair-c" },
      { leftPairId: "pair-b", rightPairId: "pair-b" },
    ],
    perConcept: [
      { conceptId: "concept-a", firstAttemptCorrect: false, recovered: true },
      { conceptId: "concept-b", firstAttemptCorrect: true, recovered: false },
    ],
  },
  frozenRequestBody: null,
};

describe("matching session restoration", () => {
  it("restores only the minimal first-choice transcript", () => {
    const storage = memoryStorage();
    writeMatchingSessionState(state, storage);
    expect(readMatchingSessionState({ artifactId: "artifact-a", pairs, storage })).toEqual(state);
    expect(storage.getItem("campus-coach:matching-session")).not.toContain("answerText");
  });

  it("restores the exact frozen request after a lost response", () => {
    const storage = memoryStorage();
    const frozen = structuredClone(state);
    frozen.frozenRequestBody = {
      attemptId: frozen.attemptId,
      artifactId: frozen.artifactId,
      correct: 1,
      total: 2,
      durationSeconds: 12,
      confidence: "medium",
      matchingFirstChoices: frozen.completion.firstChoices,
      perConcept: [
        { conceptId: "concept-a", correct: false, confidence: "medium", recovered: true },
        { conceptId: "concept-b", correct: true, confidence: "medium", recovered: false },
      ],
    };
    writeMatchingSessionState(frozen, storage);
    expect(readMatchingSessionState({ artifactId: "artifact-a", pairs, storage })?.frozenRequestBody)
      .toEqual(frozen.frozenRequestBody);
  });

  it("rejects answer content and impossible all-correct N-of-N transcripts", () => {
    const storage = memoryStorage();
    const unsafe = structuredClone(state) as MatchingSessionState & Record<string, unknown>;
    unsafe.answerText = "private answer";
    storage.setItem("campus-coach:matching-session", JSON.stringify(unsafe));
    expect(readMatchingSessionState({ artifactId: "artifact-a", pairs, storage })).toBeNull();

    const impossible = structuredClone(state);
    impossible.completion = {
      correctFirstAttempt: 3,
      total: 3,
      firstChoices: pairs.map((pair) => ({ leftPairId: pair.id, rightPairId: pair.id })),
      perConcept: pairs.map((pair) => ({
        conceptId: pair.conceptId,
        firstAttemptCorrect: true,
        recovered: false,
      })),
    };
    writeMatchingSessionState(impossible, storage);
    expect(readMatchingSessionState({ artifactId: "artifact-a", pairs, storage })).toBeNull();
  });
});
