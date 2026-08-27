import { beforeEach, describe, expect, it } from "vitest";
import {
  CAPTURE_DRAFT_VERSION,
  clearCaptureDraft,
  readCaptureDraft,
  writeCaptureDraft,
} from "./captureDraft";

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

describe("capture draft", () => {
  let storage: Storage;
  const owner = { mode: "real" as const, userId: "user-1" };
  beforeEach(() => { storage = memoryStorage(); });

  it("survives backgrounding and a reload", () => {
    writeCaptureDraft({
      kind: "quick-note",
      classId: "class-1",
      date: "2026-08-19",
      topic: "Listings",
      text: "ask about exclusions",
      assignmentId: "assignment-1",
      assignmentTitle: "Chapter 4 homework",
      assignmentDueDate: "2026-08-28",
      examId: "exam-1",
    }, { owner, storage });
    expect(readCaptureDraft({ owner, storage })).toMatchObject({
      kind: "quick-note",
      classId: "class-1",
      text: "ask about exclusions",
      assignmentId: "assignment-1",
      assignmentTitle: "Chapter 4 homework",
      assignmentDueDate: "2026-08-28",
      examId: "exam-1",
    });
  });

  it("drops a class that no longer exists instead of resurrecting it", () => {
    writeCaptureDraft({
      kind: "quick-note", classId: "deleted", date: "2026-08-19", topic: "", text: "note",
    }, { owner, storage });
    expect(readCaptureDraft({ owner, allowedClassIds: ["class-1"], storage })?.classId).toBe("");
  });

  it("remembers that photos were pending without pretending to keep them", () => {
    writeCaptureDraft({
      kind: "scan-material", classId: "class-1", date: "2026-08-19", topic: "", text: "", hadPhotos: true,
    }, { owner, storage });
    expect(readCaptureDraft({ owner, storage })?.hadPhotos).toBe(true);
  });

  it("stores nothing for an empty draft and clears on submit", () => {
    writeCaptureDraft({ kind: "quick-note", classId: "", date: "", topic: "", text: "  " }, { owner, storage });
    expect(readCaptureDraft({ owner, storage })).toBeNull();
    writeCaptureDraft({ kind: "quick-note", classId: "c", date: "d", topic: "", text: "x" }, { owner, storage });
    clearCaptureDraft(storage);
    expect(readCaptureDraft({ owner, storage })).toBeNull();
  });

  it("survives corrupt storage", () => {
    storage.setItem("campus-coach:capture-draft", "nope");
    expect(readCaptureDraft({ owner, storage })).toBeNull();
  });

  it.each([
    ["assignmentId", 42],
    ["assignmentId", ""],
    ["assignmentId", "a".repeat(201)],
    ["examId", { id: "exam-1" }],
    ["examId", ""],
    ["examId", "e".repeat(201)],
  ])("rejects a corrupt %s instead of restoring an unsafe link", (field, value) => {
    storage.setItem("campus-coach:capture-draft", JSON.stringify({
      version: CAPTURE_DRAFT_VERSION,
      ownerKey: "real:user-1",
      kind: "scan-assignment",
      classId: "class-1",
      date: "2026-08-19",
      topic: "",
      text: "",
      [field]: value,
    }));

    expect(readCaptureDraft({ owner, storage })).toBeNull();
  });

  it("never restores a real student's draft into demo mode or another account", () => {
    writeCaptureDraft({
      kind: "quick-note",
      classId: "class-1",
      date: "2026-08-19",
      topic: "Private topic",
      text: "private assignment note",
    }, { owner, storage });

    expect(readCaptureDraft({ owner: { mode: "demo" }, storage })).toBeNull();
    expect(readCaptureDraft({ owner: { mode: "real", userId: "user-2" }, storage })).toBeNull();
    expect(readCaptureDraft({ owner: { mode: "real", userId: null }, storage })).toBeNull();
    expect(readCaptureDraft({ owner, storage })?.text).toBe("private assignment note");
  });
});
