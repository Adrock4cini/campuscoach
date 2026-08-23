import { describe, expect, it } from "vitest";
import { getOnboardingRedirect, getSetupGate } from "./protectedRoute";

describe("protected route onboarding boundary", () => {
  it("returns resolved unfinished accounts to onboarding", () => {
    expect(getOnboardingRedirect({
      signedIn: true,
      setupStatus: "needs_onboarding",
      pathname: "/classes/math-1/syllabus",
    })).toBe("/onboarding");
  });

  it("allows the onboarding route itself", () => {
    expect(getOnboardingRedirect({
      signedIn: true,
      setupStatus: "needs_onboarding",
      pathname: "/onboarding",
    })).toBeNull();
  });

  it("never redirects while setup is unresolved or errored", () => {
    expect(getOnboardingRedirect({ signedIn: true, setupStatus: "checking", pathname: "/dashboard" })).toBeNull();
    expect(getOnboardingRedirect({ signedIn: true, setupStatus: "error", pathname: "/study-lab" })).toBeNull();
  });

  it("does not affect demo visitors or completed accounts", () => {
    expect(getOnboardingRedirect({ signedIn: false, setupStatus: "checking", pathname: "/dashboard" })).toBeNull();
    expect(getOnboardingRedirect({ signedIn: true, setupStatus: "onboarded", pathname: "/dashboard" })).toBeNull();
  });
});

describe("setup gate panels", () => {
  it("blocks with a visible panel only while checking or errored", () => {
    expect(getSetupGate({ signedIn: true, setupStatus: "checking" })).toBe("checking");
    expect(getSetupGate({ signedIn: true, setupStatus: "error" })).toBe("error");
    expect(getSetupGate({ signedIn: true, setupStatus: "onboarded" })).toBeNull();
    // A resolved incomplete account redirects instead of blocking.
    expect(getSetupGate({ signedIn: true, setupStatus: "needs_onboarding" })).toBeNull();
    expect(getSetupGate({ signedIn: false, setupStatus: "checking" })).toBeNull();
  });
});
