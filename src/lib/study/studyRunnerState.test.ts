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
});
