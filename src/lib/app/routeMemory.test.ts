import { beforeEach, describe, expect, it } from "vitest";
import { clearLastRoute, isRestorableRoute, readLastRoute, writeLastRoute } from "./routeMemory";

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

describe("route memory", () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it("restores the study surface a student was last on", () => {
    writeLastRoute("/study-lab?classId=abc", storage);
    expect(readLastRoute(storage)).toBe("/study-lab?classId=abc");
  });

  it("never restores auth or one-shot flows", () => {
    for (const path of ["/login", "/signup", "/reset-password", "/onboarding", "/"]) {
      expect(isRestorableRoute(path)).toBe(false);
      writeLastRoute(path, storage);
      expect(readLastRoute(storage)).toBeNull();
    }
  });

  it("rejects off-site or oversized values", () => {
    expect(isRestorableRoute("//evil.example.com")).toBe(false);
    expect(isRestorableRoute("https://evil.example.com")).toBe(false);
    expect(isRestorableRoute(`/x${"y".repeat(400)}`)).toBe(false);
  });

  it("clears on explicit sign out", () => {
    writeLastRoute("/classes", storage);
    clearLastRoute(storage);
    expect(readLastRoute(storage)).toBeNull();
  });
});
