import { describe, expect, it } from "vitest";
import { matchExistingClass, shouldSkipCompletedOnboarding } from "./onboardingEntry";

describe("completed accounts cannot silently rerun setup", () => {
  it("redirects a finished account away from onboarding", () => {
    expect(shouldSkipCompletedOnboarding({ setupStatus: "onboarded", intent: null })).toBe(true);
  });

  it("allows an explicit add/setup intent", () => {
    expect(shouldSkipCompletedOnboarding({ setupStatus: "onboarded", intent: "add" })).toBe(false);
    expect(shouldSkipCompletedOnboarding({ setupStatus: "onboarded", intent: "setup" })).toBe(false);
  });

  it("never blocks accounts that still need setup", () => {
    expect(shouldSkipCompletedOnboarding({ setupStatus: "needs_onboarding", intent: null })).toBe(false);
    expect(shouldSkipCompletedOnboarding({ setupStatus: "checking", intent: null })).toBe(false);
    expect(shouldSkipCompletedOnboarding({ setupStatus: "error", intent: null })).toBe(false);
  });
});

describe("class identity reuse on setup retry", () => {
  const existing = [
    { id: "uuid-bio", client_class_id: "cc-bio", name: "Biology 101", term: "Fall 2026", section: "A" },
    { id: "uuid-math", client_class_id: "cc-math", name: "Math", term: "Fall 2026", section: null },
  ];

  it("reuses the row a previous interrupted setup already wrote", () => {
    expect(matchExistingClass(existing, { name: "biology 101 ", term: "Fall 2026", section: "a" })?.id)
      .toBe("uuid-bio");
    expect(matchExistingClass(existing, { name: "Math", term: "Fall 2026" })?.id).toBe("uuid-math");
  });

  it("keeps the same course name in another term or section distinct", () => {
    expect(matchExistingClass(existing, { name: "Math", term: "Spring 2027" })).toBeNull();
    expect(matchExistingClass(existing, { name: "Biology 101", term: "Fall 2026", section: "B" })).toBeNull();
  });
});
