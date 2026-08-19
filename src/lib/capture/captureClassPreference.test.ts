import { beforeEach, describe, expect, it } from "vitest";
import {
  CAPTURE_CLASS_PREFERENCE_KEY,
  clearLastCaptureClassId,
  readLastCaptureClassId,
  writeLastCaptureClassId,
} from "./captureClassPreference";

describe("capture class preference", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("remembers the last class a capture was saved to", () => {
    writeLastCaptureClassId("math");
    expect(readLastCaptureClassId()).toBe("math");
  });

  it("ignores a remembered class the student no longer has", () => {
    writeLastCaptureClassId("deleted-class");
    expect(readLastCaptureClassId({ allowedClassIds: ["math", "science"] })).toBeNull();
    expect(readLastCaptureClassId({ allowedClassIds: ["deleted-class"] })).toBe("deleted-class");
  });

  it("never stores an empty class id", () => {
    writeLastCaptureClassId("   ");
    expect(sessionStorage.getItem(CAPTURE_CLASS_PREFERENCE_KEY)).toBeNull();
  });

  it("clears the remembered class", () => {
    writeLastCaptureClassId("math");
    clearLastCaptureClassId();
    expect(readLastCaptureClassId()).toBeNull();
  });

  it("survives storage failures without throwing", () => {
    const broken = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    } as unknown as Storage;

    expect(() => writeLastCaptureClassId("math", broken)).not.toThrow();
    expect(readLastCaptureClassId({ storage: broken })).toBeNull();
    expect(() => clearLastCaptureClassId(broken)).not.toThrow();
  });
});
