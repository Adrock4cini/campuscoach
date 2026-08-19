import { beforeEach, describe, expect, it } from "vitest";
import {
  KNOWN_SESSION_KEY,
  classifySessionLoss,
  forgetSignedIn,
  hasRememberedSession,
  rememberSignedIn,
} from "./sessionResilience";

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

describe("session memory", () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it("remembers and forgets a known session", () => {
    expect(hasRememberedSession(storage)).toBe(false);
    rememberSignedIn("user-1", storage);
    expect(storage.getItem(KNOWN_SESSION_KEY)).toBe("1");
    expect(hasRememberedSession(storage)).toBe(true);
    forgetSignedIn(storage);
    expect(hasRememberedSession(storage)).toBe(false);
  });
});

describe("classifySessionLoss", () => {
  it("keeps the student signed in when a known session cannot be read yet", () => {
    expect(classifySessionLoss({
      event: "bootstrap", explicit: false, online: true, remembered: true,
    })).toBe("recovering");
  });

  it("treats an offline resume as reconnecting, never as a logout", () => {
    expect(classifySessionLoss({
      event: "SIGNED_OUT", explicit: false, online: false, remembered: true,
    })).toBe("recovering");
  });

  it("treats a transient INITIAL_SESSION with no session as reconnecting", () => {
    expect(classifySessionLoss({
      event: "INITIAL_SESSION", explicit: false, online: true, remembered: true,
    })).toBe("recovering");
  });

  it("signs out on an explicit sign out", () => {
    expect(classifySessionLoss({
      event: "SIGNED_OUT", explicit: true, online: true, remembered: true,
    })).toBe("signed-out");
  });

  it("signs out on a genuinely revoked session while online", () => {
    expect(classifySessionLoss({
      event: "SIGNED_OUT", explicit: false, online: true, remembered: true,
    })).toBe("signed-out");
  });

  it("sends a never-signed-in visitor to the normal signed-out path", () => {
    expect(classifySessionLoss({
      event: "INITIAL_SESSION", explicit: false, online: true, remembered: false,
    })).toBe("signed-out");
  });
});
