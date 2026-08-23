import { describe, expect, it } from "vitest";
import { assessQuickNoteText } from "./notePreflight";

describe("quick note preflight", () => {
  it("accepts short but real facts", () => {
    expect(assessQuickNoteText("OIL RIG").usable).toBe(true);
    expect(assessQuickNoteText("pH < 7 = acid").usable).toBe(true);
  });

  it("rejects empty input with its own message", () => {
    const result = assessQuickNoteText("   ");
    expect(result).toMatchObject({ usable: false, reason: "empty" });
  });

  it("rejects content with no words at all", () => {
    expect(assessQuickNoteText("...!!!")).toMatchObject({ usable: false, reason: "no-words" });
    expect(assessQuickNoteText("🙂")).toMatchObject({ usable: false, reason: "no-words" });
    expect(assessQuickNoteText("a")).toMatchObject({ usable: false, reason: "no-words" });
  });
});
