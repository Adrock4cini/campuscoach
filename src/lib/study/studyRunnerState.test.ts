import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStudyRunnerState,
  readStudyRunnerState,
  writeStudyRunnerState,
  type StudyRunnerState,
} from "./studyRunnerState";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  } as Storage;
}

const state: StudyRunnerState = {
  artifactId: "artifact-1",
  queue: [{ itemIndex: 0, recovery: false }, { itemIndex: 1, recovery: false }],
  position: 1,
  revealed: true,
  picked: 2,
  confidence: "medium",
  correct: 1,
  incorrect: 0,
  mnemonicOpen: true,
};

const studyRunId = "10000000-0000-4000-8000-000000000001";
const attemptId = "20000000-0000-4000-8000-000000000002";

const durableState: StudyRunnerState = {
  ...state,
  studyRunId,
  nextSegmentIndex: 1,
  pendingDurationSeconds: 7,
  evidenceResults: [{
    conceptId: "concept-1",
    correct: false,
    confidence: "high",
    recovery: false,
    firstSelectedIndex: 2,
  }],
  pendingFinal: null,
  evidenceOutbox: {
    pending: [{
      attemptId,
      resultCount: 1,
      answerCount: 1,
      body: {
        attemptId,
        studyRunId,
        segmentIndex: 0,
        segmentFinal: false,
        artifactId: "artifact-1",
        correct: 0,
        total: 1,
        durationSeconds: 4,
        perConcept: [{
          conceptId: "concept-1",
          correct: false,
          confidence: "high",
          recovered: false,
          firstSelectedIndex: 2,
        }],
      },
    }],
    queuedResultCount: 1,
    savedResultCount: 0,
    savedAnswerCount: 0,
    lastResponse: null,
  },
  readinessAggregate: {
    firstReadinessBefore: 25,
    latestReadiness: 30,
    fallbackDelta: 5,
  },
};

describe("study runner restoration", () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it("restores card index, reveal state and Make It Stick after leaving the app", () => {
    writeStudyRunnerState(state, storage);
    const restored = readStudyRunnerState({ artifactId: "artifact-1", itemCount: 2, storage });
    expect(restored).toMatchObject({
      position: 1, revealed: true, picked: 2, confidence: "medium", correct: 1, mnemonicOpen: true,
    });
  });

  it("ignores progress that belongs to a different study set", () => {
    writeStudyRunnerState(state, storage);
    expect(readStudyRunnerState({ artifactId: "artifact-2", itemCount: 2, storage })).toBeNull();
  });

  it("discards progress that points outside a regenerated set", () => {
    writeStudyRunnerState(state, storage);
    expect(readStudyRunnerState({ artifactId: "artifact-1", itemCount: 1, storage })).toBeNull();
  });

  it("survives corrupt storage without throwing", () => {
    storage.setItem("campus-coach:study-runner", "{not json");
    expect(readStudyRunnerState({ artifactId: "artifact-1", itemCount: 2, storage })).toBeNull();
  });

  it("clears once results are saved", () => {
    writeStudyRunnerState(state, storage);
    clearStudyRunnerState(storage);
    expect(readStudyRunnerState({ artifactId: "artifact-1", itemCount: 2, storage })).toBeNull();
  });

  it("restores the stable run, minimal evidence, and exact pending outbox", () => {
    writeStudyRunnerState(durableState, storage);
    const restored = readStudyRunnerState({ artifactId: "artifact-1", itemCount: 2, storage });

    expect(restored).toMatchObject({
      studyRunId,
      nextSegmentIndex: 1,
      pendingDurationSeconds: 7,
      evidenceResults: [{
        conceptId: "concept-1",
        correct: false,
        recovery: false,
        firstSelectedIndex: 2,
      }],
      evidenceOutbox: {
        pending: [{
          attemptId,
          body: {
            attemptId,
            studyRunId,
            segmentIndex: 0,
            perConcept: [{ conceptId: "concept-1", firstSelectedIndex: 2 }],
          },
        }],
      },
      readinessAggregate: { firstReadinessBefore: 25, latestReadiness: 30 },
    });
    expect(storage.getItem("campus-coach:study-runner")).not.toContain("answerText");
  });

  it("rejects injected answer content instead of carrying it through storage", () => {
    const unsafe = structuredClone(durableState) as StudyRunnerState & {
      evidenceResults: Array<Record<string, unknown>>;
    };
    unsafe.evidenceResults[0].answerText = "the student's private response";
    storage.setItem("campus-coach:study-runner", JSON.stringify(unsafe));

    expect(readStudyRunnerState({ artifactId: "artifact-1", itemCount: 2, storage })).toBeNull();
  });

  it("rejects an outbox request attached to a different logical run", () => {
    const mismatched = structuredClone(durableState);
    mismatched.evidenceOutbox!.pending[0].body.studyRunId = "30000000-0000-4000-8000-000000000003";
    storage.setItem("campus-coach:study-runner", JSON.stringify(mismatched));

    expect(readStudyRunnerState({ artifactId: "artifact-1", itemCount: 2, storage })).toBeNull();
  });
});
