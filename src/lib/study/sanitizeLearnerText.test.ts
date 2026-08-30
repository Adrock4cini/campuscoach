import { describe, expect, it } from "vitest";
import { sanitizeLearnerContent, sanitizeLearnerText } from "./sanitizeLearnerText";

describe("learner-facing sanitation", () => {
  it("strips import/QA prefixes from options and prompts", () => {
    expect(sanitizeLearnerText("DUPLICATE TEST: Superheat")).toBe("Superheat");
    expect(sanitizeLearnerText("duplicate test - Subcooling")).toBe("Subcooling");
    expect(sanitizeLearnerText("QA — Math HS")).toBe("Math HS");
  });

  it("leaves normal academic text untouched", () => {
    expect(sanitizeLearnerText("Hypotonic solution")).toBe("Hypotonic solution");
    expect(sanitizeLearnerText("Test your understanding of percent change"))
      .toBe("Test your understanding of percent change");
  });

  it("never renders an empty string", () => {
    expect(sanitizeLearnerText("DUPLICATE TEST:")).toBe("DUPLICATE TEST:");
  });

  it("sanitizes nested payloads without touching non-strings", () => {
    const payload = {
      questions: [
        { prompt: "DUPLICATE TEST: What is 20% of 50?", options: ["QA: 10", "12"], answerIndex: 0 },
      ],
    };
    expect(sanitizeLearnerContent(payload)).toEqual({
      questions: [
        { prompt: "What is 20% of 50?", options: ["10", "12"], answerIndex: 0 },
      ],
    });
  });
});
