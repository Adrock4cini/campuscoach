import { describe, expect, it } from "vitest";
import { detectCaptureClassMismatch } from "./capture-class-guard";

describe("photo capture class guard", () => {
  it("blocks distinctive accounting material from BIOL", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "BIOL",
      sourceText: "Record the debits and credits for each journal entry in the ledger.",
      conceptNames: ["Debits and credits", "Journal entries"],
    })).toEqual({
      detectedSubject: "Accounting, business & economics",
      detectedSubjectId: "business_accounting",
      selectedClassName: "BIOL",
    });
  });

  it("allows legitimate math material into Math", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "NEW 0831 Math",
      sourceText: "Find 30 percent of 80 and show each arithmetic step.",
      conceptNames: ["Percent of a number", "Arithmetic"],
    })).toBeNull();
  });

  it("allows uncertain material instead of inventing a mismatch", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "HVAC",
      sourceText: "Chapter 4 review questions",
      conceptNames: ["Review"],
    })).toBeNull();
  });
});
