import { describe, expect, it } from "vitest";
import {
  assignmentPracticeSourceFromUnknown,
  isConfirmedAssignmentPracticeSource,
} from "./assignmentPracticeSource";

describe("assignment practice source contract", () => {
  it("fails a legacy assignment capture closed to review", () => {
    expect(assignmentPracticeSourceFromUnknown(undefined, "scan-assignment")).toEqual({
      status: "needs_review",
      text: null,
      version: 0,
      hash: null,
      confirmedAt: null,
    });
  });

  it("does not gate ordinary typed captures", () => {
    expect(assignmentPracticeSourceFromUnknown(undefined, "quick-note").status).toBe("not_required");
  });

  it("rejects a malformed confirmed claim", () => {
    const source = assignmentPracticeSourceFromUnknown({
      status: "confirmed",
      text: "What is 14% of 50?",
      version: 1,
      hash: null,
      confirmedAt: "2026-08-27T12:00:00.000Z",
    }, "scan-assignment");

    expect(source.status).toBe("needs_review");
    expect(isConfirmedAssignmentPracticeSource(source)).toBe(false);
  });
});
