import { describe, expect, it } from "vitest";
import { hydrateCachedOnboardingClass, prepareNewOnboardingClass } from "./classIdentity";

describe("onboarding class identity rollout", () => {
  it("preserves the legacy retry path for a cached named class without an id", () => {
    const cached = hydrateCachedOnboardingClass({ name: "Biology", days: ["Wed", "Mon"] });

    expect(cached.clientClassId).toBeUndefined();
    expect(cached.days).toEqual(["Mon", "Wed"]);
  });

  it("assigns a stable id to every new draft before save", () => {
    const draft = prepareNewOnboardingClass({ name: "", days: [] });

    expect(draft.clientClassId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
