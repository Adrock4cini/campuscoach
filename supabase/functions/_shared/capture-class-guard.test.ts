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

  it("blocks the reported Accounting concepts from the QA BIOL class", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "QA — NEW 0831 BIOL",
      sourceText: "Accounting Equation: Assets = Liabilities + Equity.",
      conceptNames: [
        "Accounting Equation",
        "Debits (effects)",
        "Credits (effects)",
        "Normal Balance of Cash",
      ],
    })).toEqual({
      detectedSubject: "Accounting, business & economics",
      detectedSubjectId: "business_accounting",
      selectedClassName: "QA — NEW 0831 BIOL",
    });
  });

  it("does not let a weak OCR hit hide strong agreeing Accounting concepts", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "QA — NEW 0831 BIOL",
      sourceText: "Accounting",
      conceptNames: ["Debits", "Credits", "Assets", "Liabilities", "Equity"],
    })).toEqual({
      detectedSubject: "Accounting, business & economics",
      detectedSubjectId: "business_accounting",
      selectedClassName: "QA — NEW 0831 BIOL",
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

  it("keeps a single thin Accounting hint uncertain", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "BIOL",
      sourceText: "Accounting",
      conceptNames: ["Chapter review"],
    })).toBeNull();
  });

  it("does not promote strong concepts when they conflict with weak source evidence", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "BIOL",
      sourceText: "Biology",
      conceptNames: ["Debits", "Credits", "Assets", "Liabilities", "Equity"],
    })).toBeNull();
  });

  it("preserves strong concept detection when OCR has no subject keywords", () => {
    expect(detectCaptureClassMismatch({
      selectedClassName: "BIOL",
      sourceText: "Chapter 3 review",
      conceptNames: ["Debits", "Credits", "Assets", "Liabilities", "Equity"],
    })?.detectedSubjectId).toBe("business_accounting");
  });
});
