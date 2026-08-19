import { describe, expect, it } from "vitest";
import {
  cleanStudyText,
  isLongStudyText,
  retrievalPrompt,
} from "@/lib/study/studyText";

describe("cleanStudyText", () => {
  it("strips pasted source headers from an answer", () => {
    expect(
      cleanStudyText("PART 1 Nail Technology Foundations   The nail plate is the visible nail body."),
    ).toBe("Nail Technology Foundations The nail plate is the visible nail body.");
  });

  it("strips bullets, list numbers, and chapter markers", () => {
    expect(cleanStudyText("• 2) Chapter 4 — Bones of the hand")).toBe("Bones of the hand");
  });

  it("strips a trailing page marker", () => {
    expect(cleanStudyText("The flexor tendons bend the fingers. Page 87")).toBe(
      "The flexor tendons bend the fingers.",
    );
  });

  it("never returns an empty or meaningless answer", () => {
    expect(cleanStudyText("Page 12")).toBe("Page 12");
    expect(cleanStudyText("   ")).toBe("");
  });

  it("leaves normal grounded answers untouched", () => {
    const answer = "Prone means lying face down.";
    expect(cleanStudyText(answer)).toBe(answer);
  });
});

describe("isLongStudyText", () => {
  it("flags long passages for scrollable display instead of truncation", () => {
    expect(isLongStudyText("short answer")).toBe(false);
    expect(isLongStudyText("word ".repeat(80))).toBe(true);
  });
});

describe("retrievalPrompt", () => {
  it("replaces the misleading typed-answer prompt", () => {
    expect(retrievalPrompt("Explain Muscles of the Hand in your own words.")).toBe(
      "What do you remember about Muscles of the Hand?",
    );
  });

  it("falls back to the concept name when the subject is missing", () => {
    expect(retrievalPrompt("Explain  in your own words.", "Nail anatomy")).toBe(
      "What do you remember about Nail anatomy?",
    );
  });

  it("keeps a real grounded question exactly as written", () => {
    expect(retrievalPrompt("Which bone is distal to the carpals?")).toBe(
      "Which bone is distal to the carpals?",
    );
  });
});
