import { describe, expect, it } from "vitest";
import { buildCoachStudyScope, parseCoachConceptIds } from "./coachStudyScope";

const CONCEPT_A = "11111111-1111-4111-8111-111111111111";
const CONCEPT_B = "22222222-2222-4222-8222-222222222222";

describe("coach study scope", () => {
  it("accepts only unique concept UUIDs and caps the study block", () => {
    const ids = parseCoachConceptIds([
      CONCEPT_A,
      "not-a-concept",
      CONCEPT_B,
      CONCEPT_A,
    ].join(","));

    expect(ids).toEqual([CONCEPT_A, CONCEPT_B]);
  });

  it("builds the same scope for the same concepts in any order", () => {
    const first = buildCoachStudyScope([CONCEPT_A, CONCEPT_B]);
    const second = buildCoachStudyScope([CONCEPT_B, CONCEPT_A]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ type: "class", label: "Coach picks" });
    expect(first?.id).toMatch(/^coach-/);
  });
});
