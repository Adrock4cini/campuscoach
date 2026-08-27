import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "./canonical-json";

describe("canonicalJsonStringify", () => {
  it("treats recursively reordered JSONB objects as structurally equal", () => {
    const generated = {
      conceptId: "concept-1",
      original: {
        prompt: "Find 14% of 50.",
        choices: ["5", "7", "9"],
        answerIndex: 1,
      },
      transfer: {
        choices: ["6", "8", "10"],
        answerIndex: 1,
        prompt: "Find 16% of 50.",
      },
    };
    const jsonbRoundTrip = {
      transfer: {
        prompt: "Find 16% of 50.",
        answerIndex: 1,
        choices: ["6", "8", "10"],
      },
      original: {
        answerIndex: 1,
        choices: ["5", "7", "9"],
        prompt: "Find 14% of 50.",
      },
      conceptId: "concept-1",
    };

    expect(canonicalJsonStringify(jsonbRoundTrip))
      .toBe(canonicalJsonStringify(generated));
  });

  it("preserves array order and detects changed values", () => {
    expect(canonicalJsonStringify({ choices: ["A", "B"] }))
      .not.toBe(canonicalJsonStringify({ choices: ["B", "A"] }));
    expect(canonicalJsonStringify({ answerIndex: 0 }))
      .not.toBe(canonicalJsonStringify({ answerIndex: 1 }));
  });
});
