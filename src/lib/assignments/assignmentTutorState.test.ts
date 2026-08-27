import { beforeEach, describe, expect, it } from "vitest";
import {
  assignmentTutorReducer,
  assignmentTutorStateStorageKey,
  clearAssignmentTutorState,
  createAssignmentTutorState,
  readAssignmentTutorState,
  writeAssignmentTutorState,
  type AssignmentTutorState,
  type AssignmentTutorStateContext,
} from "./assignmentTutorState";

const ATTEMPT_ID = "123e4567-e89b-42d3-a456-426614174000";

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

const context: AssignmentTutorStateContext = {
  artifactId: "artifact-1",
  assignmentId: "assignment-1",
  captureId: "capture-1",
  problemId: "problem-1",
  originalChoiceCount: 4,
  transferChoiceCount: 4,
};

const storageKey = (value = context) => assignmentTutorStateStorageKey(value);

function progressedState(): AssignmentTutorState {
  let state = createAssignmentTutorState(context, { attemptId: ATTEMPT_ID, startedAt: 1_000 });
  state = assignmentTutorReducer(state, { type: "use-hint" });
  state = assignmentTutorReducer(state, { type: "show-walkthrough" });
  state = assignmentTutorReducer(state, { type: "start-original-attempt" });
  state = assignmentTutorReducer(state, { type: "select-original", index: 2 });
  state = assignmentTutorReducer(state, { type: "check-original" });
  state = assignmentTutorReducer(state, { type: "start-transfer-attempt" });
  state = assignmentTutorReducer(state, { type: "select-transfer", index: 1 });
  state = assignmentTutorReducer(state, { type: "set-confidence", confidence: "medium" });
  return assignmentTutorReducer(state, { type: "check-transfer" });
}

describe("assignment tutor session state", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("restores the exact stage, choices, confidence, help and stable attempt id", () => {
    const state = progressedState();
    writeAssignmentTutorState(state, storage);

    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toEqual(state);
  });

  it("expires a session too old for the result endpoint to accept", () => {
    const state = progressedState();
    writeAssignmentTutorState(state, storage);

    expect(readAssignmentTutorState({
      ...context,
      storage,
      now: state.startedAt + 86_400_001,
    })).toBeNull();
  });

  it.each([
    ["artifactId", "artifact-2"],
    ["assignmentId", "assignment-2"],
    ["captureId", "capture-2"],
    ["problemId", "problem-2"],
  ] as const)("rejects progress for a different %s", (key, value) => {
    writeAssignmentTutorState(progressedState(), storage);
    expect(readAssignmentTutorState({ ...context, [key]: value, storage, now: 2_000 })).toBeNull();
  });

  it("rejects corrupt, unknown-version and answer-bearing snapshots", () => {
    storage.setItem(storageKey(), "{not json");
    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toBeNull();

    storage.setItem(storageKey(), JSON.stringify({ ...progressedState(), version: 4 }));
    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toBeNull();

    storage.setItem(storageKey(), JSON.stringify({
      ...progressedState(),
      answerIndex: 1,
    }));
    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toBeNull();
  });

  it("rejects out-of-range choices and impossible stage combinations", () => {
    storage.setItem(storageKey(), JSON.stringify({
      ...progressedState(),
      transferSelection: 4,
    }));
    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toBeNull();

    storage.setItem(storageKey(), JSON.stringify({
      ...progressedState(),
      stage: "saving",
      transferSelection: null,
    }));
    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toBeNull();
  });

  it("persists only the allow-listed session fields, never answers or source text", () => {
    const unsafe = {
      ...progressedState(),
      answerIndex: 1,
      rationale: "secret rationale",
      sourceExcerpt: "raw assignment source",
    } as AssignmentTutorState & Record<string, unknown>;

    writeAssignmentTutorState(unsafe, storage);
    const raw = storage.getItem(storageKey()) ?? "";

    expect(raw).not.toContain("answerIndex");
    expect(raw).not.toContain("secret rationale");
    expect(raw).not.toContain("raw assignment source");
    expect(Object.keys(JSON.parse(raw))).toEqual([
      "version",
      "artifactId",
      "assignmentId",
      "captureId",
      "problemId",
      "stage",
      "helpUsed",
      "originalSelection",
      "transferSelection",
      "confidence",
      "firstTransferSelection",
      "firstTransferConfidence",
      "submissionLocked",
      "submissionDurationSeconds",
      "resultSaved",
      "resultOutcome",
      "attemptId",
      "startedAt",
    ]);
  });

  it("does not advance through either answer gate without a selection and confidence", () => {
    let state = createAssignmentTutorState(context, { attemptId: ATTEMPT_ID, startedAt: 1_000 });
    expect(assignmentTutorReducer(state, { type: "show-walkthrough" }).stage).toBe("hint");

    state = assignmentTutorReducer(state, { type: "use-hint" });
    state = assignmentTutorReducer(state, { type: "show-walkthrough" });
    state = assignmentTutorReducer(state, { type: "start-original-attempt" });
    expect(assignmentTutorReducer(state, { type: "check-original" }).stage).toBe("original-attempt");

    state = assignmentTutorReducer(state, { type: "select-original", index: 0 });
    state = assignmentTutorReducer(state, { type: "check-original" });
    state = assignmentTutorReducer(state, { type: "start-transfer-attempt" });
    state = assignmentTutorReducer(state, { type: "select-transfer", index: 1 });
    expect(assignmentTutorReducer(state, { type: "check-transfer" }).stage).toBe("transfer-attempt");

    state = assignmentTutorReducer(state, { type: "set-confidence", confidence: "high" });
    expect(assignmentTutorReducer(state, { type: "check-transfer" }).stage).toBe("transfer-feedback");
  });

  it("keeps the same attempt id when transfer feedback is retried", () => {
    const state = progressedState();
    const retry = assignmentTutorReducer(state, { type: "retry-transfer" });

    expect(retry).toMatchObject({
      stage: "transfer-attempt",
      attemptId: ATTEMPT_ID,
      transferSelection: null,
      confidence: null,
    });
    expect(retry.helpUsed).toContain("transfer-retry");
  });

  it("freezes a submitted transfer payload and prevents answer changes after a lost response", () => {
    const state = progressedState();
    const saving = assignmentTutorReducer(state, { type: "start-saving", durationSeconds: 42 });
    const failed = assignmentTutorReducer(saving, { type: "save-failed" });
    const retryAnswer = assignmentTutorReducer(failed, { type: "retry-transfer" });
    const retrySave = assignmentTutorReducer(failed, { type: "start-saving", durationSeconds: 99 });

    expect(failed).toMatchObject({
      stage: "save-error",
      submissionLocked: true,
      submissionDurationSeconds: 42,
    });
    expect(retryAnswer).toEqual(failed);
    expect(retrySave).toMatchObject({
      stage: "saving",
      submissionLocked: true,
      submissionDurationSeconds: 42,
    });
  });

  it("clears only when explicitly told a durable save was confirmed", () => {
    const state = progressedState();
    writeAssignmentTutorState(state, storage);
    expect(storage.getItem(storageKey())).not.toBeNull();
    clearAssignmentTutorState(state, storage);
    expect(storage.getItem(storageKey())).toBeNull();
  });

  it("keeps a locked lost-response outbox when another artifact is opened", () => {
    const first = assignmentTutorReducer(
      assignmentTutorReducer(progressedState(), { type: "start-saving", durationSeconds: 42 }),
      { type: "save-failed" },
    );
    const secondContext: AssignmentTutorStateContext = {
      ...context,
      artifactId: "artifact-2",
      assignmentId: "assignment-2",
      captureId: "capture-2",
      problemId: "problem-2",
    };
    const second = createAssignmentTutorState(secondContext, {
      attemptId: "223e4567-e89b-42d3-a456-426614174000",
      startedAt: 1_100,
    });

    writeAssignmentTutorState(first, storage);
    writeAssignmentTutorState(second, storage);

    expect(readAssignmentTutorState({ ...context, storage, now: 2_000 })).toEqual(first);
    expect(readAssignmentTutorState({ ...secondContext, storage, now: 2_000 })).toEqual(second);
    expect(first.attemptId).not.toBe(second.attemptId);
    expect(storage.length).toBe(2);
  });
});
