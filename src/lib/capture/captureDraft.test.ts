import { beforeEach, describe, expect, it } from "vitest";
import { clearCaptureDraft, readCaptureDraft, writeCaptureDraft } from "./captureDraft";

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
  beforeEach(() => { storage = memoryStorage(); });

  it("survives backgrounding and a reload", () => {
    writeCaptureDraft({
      kind: "quick-note", classId: "class-1", date: "2026-08-19", topic: "Listings", text: "ask about exclusions",
    }, storage);
    expect(readCaptureDraft({ storage })).toMatchObject({
      kind: "quick-note", classId: "class-1", text: "ask about exclusions",
    });
  });

  it("drops a class that no longer exists instead of resurrecting it", () => {
    writeCaptureDraft({
      kind: "quick-note", classId: "deleted", date: "2026-08-19", topic: "", text: "note",
    }, storage);
    expect(readCaptureDraft({ allowedClassIds: ["class-1"], storage })?.classId).toBe("");
  });

  it("remembers that photos were pending without pretending to keep them", () => {
    writeCaptureDraft({
      kind: "scan-material", classId: "class-1", date: "2026-08-19", topic: "", text: "", hadPhotos: true,
    }, storage);
    expect(readCaptureDraft({ storage })?.hadPhotos).toBe(true);
  });

  it("stores nothing for an empty draft and clears on submit", () => {
    writeCaptureDraft({ kind: "quick-note", classId: "", date: "", topic: "", text: "  " }, storage);
    expect(readCaptureDraft({ storage })).toBeNull();
    writeCaptureDraft({ kind: "quick-note", classId: "c", date: "d", topic: "", text: "x" }, storage);
    clearCaptureDraft(storage);
    expect(readCaptureDraft({ storage })).toBeNull();
  });

  it("survives corrupt storage", () => {
    storage.setItem("campus-coach:capture-draft", "nope");
    expect(readCaptureDraft({ storage })).toBeNull();
  });
});
