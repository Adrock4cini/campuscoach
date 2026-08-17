import { describe, expect, it } from "vitest";
import { getOnboardingRedirect } from "./protectedRoute";

describe("protected route onboarding boundary", () => {
  it("returns unfinished signed-in accounts to onboarding", () => {
    expect(getOnboardingRedirect({
      signedIn: true,
      onboarded: false,
      pathname: "/classes/math-1/syllabus",
    })).toBe("/onboarding");
  });

  it("allows the onboarding route itself", () => {
    expect(getOnboardingRedirect({
      signedIn: true,
      onboarded: false,
      pathname: "/onboarding",
    })).toBeNull();
  });

  it("fails closed at RootGate while setup status is unknown", () => {
    expect(getOnboardingRedirect({
      signedIn: true,
      onboarded: null,
      pathname: "/dashboard",
    })).toBe("/");
  });

  it("does not affect demo visitors or completed accounts", () => {
    expect(getOnboardingRedirect({
      signedIn: false,
      onboarded: null,
      pathname: "/dashboard",
    })).toBeNull();
    expect(getOnboardingRedirect({
      signedIn: true,
      onboarded: true,
      pathname: "/dashboard",
    })).toBeNull();
  });
});
