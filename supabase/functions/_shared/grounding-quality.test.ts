import { describe, expect, it } from "vitest";
import { assessSourceSufficiency } from "./grounding-quality";

describe("grounding source quality", () => {
  it.each(["", "Help me", "Study this", "Mitosis", "I don't understand"]) (
    "rejects non-academic or underspecified source: %s",
    (source) => expect(assessSourceSufficiency(source).sufficient).toBe(false),
  );

  it.each([
    "2+2=4",
    "Mitosis has four stages.",
    "Professor said mitosis will be on the test.",
  ])("accepts concrete academic evidence: %s", (source) => {
    expect(assessSourceSufficiency(source).sufficient).toBe(true);
  });
});
