import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStudyLabState,
  readStudyLabState,
  writeStudyLabState,
  STUDY_LAB_STATE_KEY,
} from "@/lib/study/studyLabState";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
});

describe("study lab state", () => {
  it("round-trips the class, format, and focus", () => {
    writeStudyLabState({ classId: "math", kind: "matching", targetId: "exam-1" }, storage);
    expect(readStudyLabState({ storage })).toEqual({
      classId: "math",
      kind: "matching",
      targetId: "exam-1",
    });
  });

  it("drops state for a class the student no longer has", () => {
    writeStudyLabState({ classId: "deleted", kind: "flashcards", targetId: "recent" }, storage);
    expect(readStudyLabState({ storage, allowedClassIds: ["math", "bio"] })).toBeNull();
  });

  it("ignores malformed or unsupported values", () => {
    storage.setItem(STUDY_LAB_STATE_KEY, "not json");
    expect(readStudyLabState({ storage })).toBeNull();
    storage.setItem(STUDY_LAB_STATE_KEY, JSON.stringify({ classId: "math", kind: "essay", targetId: "recent" }));
    expect(readStudyLabState({ storage })).toBeNull();
  });

  it("does not carry a stale focus across a class switch", () => {
    writeStudyLabState({ classId: "math", kind: "matching", targetId: "exam-math" }, storage);
    writeStudyLabState({ classId: "bio", kind: "flashcards", targetId: "exam-bio" }, storage);
    const restored = readStudyLabState({ storage, allowedClassIds: ["math", "bio"] });
    expect(restored).toEqual({ classId: "bio", kind: "flashcards", targetId: "exam-bio" });
    expect(restored?.targetId).not.toBe("exam-math");
  });

  it("clears state on request", () => {
    writeStudyLabState({ classId: "math", kind: "flashcards", targetId: "recent" }, storage);
    clearStudyLabState(storage);
    expect(readStudyLabState({ storage })).toBeNull();
  });
});
