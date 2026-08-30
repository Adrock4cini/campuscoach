/**
 * Launch guard: the walkthrough must actually support the two problem shapes
 * the learner-facing copy advertises ("one percent-of or percent-discount
 * problem"). A supported-but-unparsed shape silently disables Confirm, which
 * looks to a student like the app is broken.
 *
 * Arithmetic validation is intentionally untouched here: these cases must be
 * parsed AND produce a verified deterministic practice item.
 */
import { describe, expect, it } from "vitest";
import { isAssignmentTutorTextSupported } from "./assignmentTutorSupport";
import {
  buildAssignmentTutorPractice,
  extractAssignmentTutorSource,
} from "../../../supabase/functions/_shared/assignment-tutor";

function practiceFor(text: string) {
  const extracted = extractAssignmentTutorSource(text);
  expect(extracted).not.toBeNull();
  expect(extracted!.concepts).toHaveLength(1);
  return buildAssignmentTutorPractice({
    conceptId: "concept",
    conceptName: extracted!.concepts[0].name,
    sourceExcerpt: text,
  });
}

describe("advertised Assignment Tutor problem shapes", () => {
  it("supports the percent-of question form", () => {
    expect(isAssignmentTutorTextSupported("What is 14% of 50?")).toBe(true);
    expect(practiceFor("What is 14% of 50?").supported).toBe(true);
  });

  it("supports the two-sentence percent-discount word problem", () => {
    const text = "A jacket costs $80. It is 25% off. What is the sale price?";
    expect(isAssignmentTutorTextSupported(text)).toBe(true);
    const practice = practiceFor(text);
    expect(practice.supported).toBe(true);
  });

  it("still supports the discount form without the trailing question", () => {
    expect(isAssignmentTutorTextSupported("A backpack costs $40. It is 10% off.")).toBe(true);
  });

  it("stays fail-closed on problems the launch parser cannot verify", () => {
    expect(isAssignmentTutorTextSupported("Explain why the Civil War started.")).toBe(false);
    expect(isAssignmentTutorTextSupported("A jacket costs $80. It is 250% off.")).toBe(false);
    expect(isAssignmentTutorTextSupported("")).toBe(false);
  });
});
