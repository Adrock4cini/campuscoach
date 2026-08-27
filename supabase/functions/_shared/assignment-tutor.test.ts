import { describe, expect, it } from "vitest";
import { buildAssignmentTutorPractice, extractAssignmentTutorSource } from "./assignment-tutor.ts";
import { buildGroundedExcerptMap } from "./grounded-excerpt.ts";
import { validateArtifactPayload } from "./artifact-validation.ts";

function supported(input: Parameters<typeof buildAssignmentTutorPractice>[0]) {
  const result = buildAssignmentTutorPractice(input);
  expect(result.supported).toBe(true);
  if (!result.supported) throw new Error("Expected a supported assignment tutor problem");
  return result.problem;
}

function correctAnswer(problem: { choices: string[]; answerIndex: number }): string {
  return problem.choices[problem.answerIndex];
}

describe("Assignment Tutor v1", () => {
  it("accepts one worksheet item number without changing the confirmed source", () => {
    const sourceExcerpt = "1. What is 14% of 50?";
    const problem = supported({
      conceptId: "numbered-percent",
      conceptName: "Percent of a Number",
      sourceExcerpt,
    });
    expect(problem.sourceExcerpt).toBe(sourceExcerpt);
    expect(correctAnswer(problem.original)).toBe("7");
  });

  it.each(["14% of 50", "$80 jacket 25% off"])(
    "survives the deterministic capture-to-validated-tutor seam: %s",
    (sourceExcerpt) => {
      const extracted = extractAssignmentTutorSource(sourceExcerpt);
      expect(extracted).not.toBeNull();
      const concept = {
        id: "concept-1",
        name: extracted!.concepts[0].name,
        definition: extracted!.concepts[0].definition,
        examples: extracted!.concepts[0].examples,
        capture_id: "capture-1",
      };
      const excerpts = buildGroundedExcerptMap(
        [concept],
        new Map([["capture-1", sourceExcerpt]]),
      );
      expect(excerpts.get(concept.id)).toBe(sourceExcerpt);

      const built = buildAssignmentTutorPractice({
        conceptId: concept.id,
        conceptName: concept.name,
        sourceExcerpt: excerpts.get(concept.id)!,
      });
      expect(built.supported).toBe(true);
      if (!built.supported) return;
      expect(validateArtifactPayload("practice", { problems: [built.problem] }, {
        concepts: [{ id: concept.id, name: concept.name }],
        expectedCount: 1,
        sourceExcerptByConcept: excerpts,
      }).ok).toBe(true);
    },
  );

  it("builds the full percent-of loop from the exact grounded source", () => {
    const sourceExcerpt = "What is 14% of 50?";
    const problem = supported({
      conceptId: "percent-14-of-50",
      conceptName: "Percent of a Number",
      sourceExcerpt,
    });

    expect(problem).toMatchObject({
      id: "practice-percent-14-of-50",
      conceptId: "percent-14-of-50",
      conceptName: "Percent of a Number",
      sourceExcerpt,
      routeKind: "solve-problems",
    });
    expect(problem.original.prompt).toBe("What is 14% of 50?");
    expect(correctAnswer(problem.original)).toBe("7");
    expect(problem.original.choices).toHaveLength(4);
    expect(new Set(problem.original.choices).size).toBe(4);

    expect(problem.hint).toBe("Convert the percent to a decimal, then multiply it by the whole amount.");
    expect(problem.hint).not.toContain(correctAnswer(problem.original));
    expect(problem.hint).not.toMatch(/\d/);

    expect(problem.walkthrough.prompt).not.toBe(problem.original.prompt);
    expect(problem.walkthrough.steps).toHaveLength(2);
    expect(problem.walkthrough.steps.at(-1)).toContain(problem.walkthrough.answer);

    expect(problem.transfer.prompt).not.toBe(problem.original.prompt);
    expect(problem.transfer.prompt).not.toBe(problem.walkthrough.prompt);
    expect(problem.transfer.choices).toHaveLength(4);
    expect(new Set(problem.transfer.choices).size).toBe(4);
  });

  it("builds a sale-price loop for a percent discount", () => {
    const problem = supported({
      conceptId: "discount",
      conceptName: "Percent Discount",
      sourceExcerpt: "$80 jacket 25% off",
    });

    expect(problem.original.prompt).toBe("A $80 jacket is 25% off. What is the sale price?");
    expect(correctAnswer(problem.original)).toBe("$60");
    expect(problem.hint).not.toContain("$60");
    expect(problem.hint).not.toMatch(/\d/);
    expect(problem.walkthrough.prompt).not.toBe(problem.original.prompt);
    expect(problem.walkthrough.answer).not.toBe("$60");
    expect(problem.transfer.prompt).not.toBe(problem.walkthrough.prompt);
  });

  it("uses decimal-safe exact arithmetic instead of binary floating-point output", () => {
    const problem = supported({
      conceptId: "decimal-percent",
      conceptName: "Decimal Percent",
      sourceExcerpt: "Find 33.3% of 30.",
    });

    expect(correctAnswer(problem.original)).toBe("9.99");
    expect(problem.original.rationale).toContain("0.333 × 30 = 9.99");
    expect(problem.original.rationale).not.toContain("999999");
  });

  it("rounds currency to cents deterministically", () => {
    const problem = supported({
      conceptId: "currency-percent",
      conceptName: "Percent of Money",
      sourceExcerpt: "What is 12.5% of $10.99?",
    });

    expect(correctAnswer(problem.original)).toBe("$1.37");
  });

  it("rounds exact half-cents up without Number drift", () => {
    const percent = supported({
      conceptId: "half-cent-percent",
      conceptName: "Percent of Money",
      sourceExcerpt: "What is 1% of $14.50?",
    });
    const discount = supported({
      conceptId: "half-cent-discount",
      conceptName: "Percent Discount",
      sourceExcerpt: "$14.50 item 1% off",
    });

    expect(correctAnswer(percent.original)).toBe("$0.15");
    expect(correctAnswer(discount.original)).toBe("$14.35");
    expect(discount.original.rationale).toContain("$14.50 − $0.15 = $14.35");
  });

  it("supports percent-first discount wording without inventing an item label", () => {
    const problem = supported({
      conceptId: "reversed-discount",
      conceptName: "Percent Discount",
      sourceExcerpt: "The sale is 25% off a $80 jacket.",
    });

    expect(problem.original.prompt).toBe("A $80 jacket is 25% off. What is the sale price?");
    expect(correctAnswer(problem.original)).toBe("$60");
    expect(() => JSON.stringify(problem)).not.toThrow();
  });

  it.each([
    "A $80 jacket is 25% off. What is the sale price?",
    "A jacket costs $80 and is 25% off",
    "Find the sale price of a $80 jacket that is 25% off",
    "Calculate the sale price: $80 jacket 25% off",
  ])("accepts a complete anchored worksheet discount question: %s", (sourceExcerpt) => {
    const problem = supported({
      conceptId: "worksheet-discount",
      conceptName: "Percent Discount",
      sourceExcerpt,
    });
    expect(correctAnswer(problem.original)).toBe("$60");
  });

  it("preserves the exact source excerpt and returns the same result every time", () => {
    const input = {
      conceptId: "stable",
      conceptName: "Percent of a Number",
      sourceExcerpt: "  Teacher example: 18% of 50 = ?  ",
    };
    const first = buildAssignmentTutorPractice(input);
    const second = buildAssignmentTutorPractice(input);

    expect(first).toEqual(second);
    expect(first.supported && first.problem.sourceExcerpt).toBe(input.sourceExcerpt);
  });

  it("keeps example selection independent of concept metadata", () => {
    const first = supported({
      conceptId: "concept-a",
      conceptName: "Percent One",
      sourceExcerpt: "18% of 50",
    });
    const second = supported({
      conceptId: "concept-b",
      conceptName: "A Renamed Percent Concept",
      sourceExcerpt: "18% of 50",
    });

    expect(second.walkthrough).toEqual(first.walkthrough);
    expect(second.transfer).toEqual(first.transfer);
  });

  it("varies deterministic transfer problems across different originals", () => {
    const percentTransfers = [
      "14% of 50",
      "18% of 50",
      "22% of 70",
      "33% of 90",
      "45% of 120",
      "7% of 300",
    ].map((sourceExcerpt, index) => supported({
      conceptId: `percent-variety-${index}`,
      conceptName: "Percent of a Number",
      sourceExcerpt,
    }).transfer.prompt);
    const discountTransfers = [
      "$80 jacket 25% off",
      "$55 book 10% off",
      "$125 laptop 15% off",
      "$42 game 30% off",
      "$96 coat 20% off",
      "$33 bag 5% off",
    ].map((sourceExcerpt, index) => supported({
      conceptId: `discount-variety-${index}`,
      conceptName: "Percent Discount",
      sourceExcerpt,
    }).transfer.prompt);

    expect(new Set(percentTransfers).size).toBeGreaterThan(1);
    expect(new Set(discountTransfers).size).toBeGreaterThan(1);
  });

  it.each([
    ["What is 10% of $119.96?", "$12"],
    ["$35.30 item 15% off", "$30"],
  ])("keeps rounded original, walkthrough and transfer answers distinct: %s", (sourceExcerpt, expected) => {
    const problem = supported({
      conceptId: `rounding-${sourceExcerpt}`,
      conceptName: "Rounded Percent",
      sourceExcerpt,
    });
    const answers = [
      correctAnswer(problem.original),
      problem.walkthrough.answer,
      correctAnswer(problem.transfer),
    ];

    expect(answers[0]).toBe(expected);
    expect(new Set(answers).size).toBe(3);
    expect(new Set(problem.original.choices).size).toBe(4);
    expect(new Set(problem.transfer.choices).size).toBe(4);
  });

  it("varies the correct-choice position across deterministic problems", () => {
    const positions = [
      "14% of 50",
      "25% of 80",
      "30% of 90",
      "$80 jacket 25% off",
    ].map((sourceExcerpt, index) => supported({
      conceptId: `position-${index}`,
      conceptName: "Percent practice",
      sourceExcerpt,
    }).original.answerIndex);

    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it("supports a legitimate 100% discount", () => {
    const problem = supported({
      conceptId: "full-discount",
      conceptName: "Percent Discount",
      sourceExcerpt: "$80 jacket 100% off",
    });

    expect(correctAnswer(problem.original)).toBe("$0");
  });

  it.each([
    ["14% of 50", "Percent of a Number", "7"],
    ["$80 jacket 25% off", "Percent Discount", "$60"],
  ])("extracts one exact concept without model-authored arithmetic: %s", (source, name, answer) => {
    const extracted = extractAssignmentTutorSource(source);
    expect(extracted?.concepts).toHaveLength(1);
    expect(extracted?.concepts[0]).toMatchObject({ name, professor_emphasis: false });
    expect(extracted?.concepts[0].definition).not.toContain(answer);
    expect(extracted?.concepts[0].examples).toEqual([source]);
  });

  it.each([
    ["ordinary prose", "A percent compares a number with one hundred."],
    ["two supported problems", "What is 14% of 50? Then find 20% of 80."],
    ["extra arithmetic", "14% of 50 plus 5"],
    ["extra tax step", "$80 jacket 25% off, then add 8% tax"],
    ["tax before discount", "$80 jacket plus 8% tax then 25% off"],
    ["tax after reversed discount", "25% off then add 8% tax to $80 jacket"],
    ["coupon before discount", "$80 jacket with a $10 coupon then 25% off"],
    ["negated discount", "$80 item is not 25% off"],
    ["unlabeled negated discount", "$80 not 25% off"],
    ["approximate discount", "$80 approximately 25% off"],
    ["uncertain discount", "$80 maybe 25% off"],
    ["modal discount", "$80 perhaps 25% off"],
    ["probable discount", "$80 probably 25% off"],
    ["comparison discount", "$80 under 25% off"],
    ["extra operation discount", "$80 plus 25% off"],
    ["currency with fractional cents", "50% of $1.005"],
    ["discount price with fractional cents", "$1.005 item 50% off"],
    ["oversized source", `14% of 50${" ".repeat(400)}`],
    ["oversized number", `${"9".repeat(1000)}% of 50`],
    ["leading decimal percent", ".5% of 100"],
    ["negative percent", "−14% of 50"],
    ["comparison prefix", ">14% of 50"],
    ["approximation prefix", "~14% of 50"],
    ["currency percent", "$14% of 50"],
    ["percent whole", "14% of 50%"],
    ["joined prefix", "the14% of 50"],
    ["exponent suffix", "14% of 50²"],
    ["unrelated numeric context", "A student scored 14% of 50 questions in 2026"],
    ["invalid discount", "$80 jacket 125% off"],
    ["empty source", "   "],
  ])("returns a machine-readable unsupported result for %s", (_label, sourceExcerpt) => {
    expect(buildAssignmentTutorPractice({
      conceptId: "unsupported",
      conceptName: "Unsupported",
      sourceExcerpt,
    })).toEqual({ supported: false, reason: "unsupported_assignment_problem" });
  });
});
