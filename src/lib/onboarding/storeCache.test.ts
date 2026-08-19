import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useClassIntelligence", () => ({ getAnonUserId: () => "anon" }));

import { cacheOnboardingDraft, clearOnboarding, loadCachedOnboarding } from "./store";

describe("account-scoped onboarding drafts", () => {
  beforeEach(() => localStorage.clear());

  it("never gives one account another account's cached classes", () => {
    localStorage.setItem("cc_onboarding_cache_v1:user-a", JSON.stringify({ name: "Alex", classes: [{ name: "Math" }] }));
    localStorage.setItem("cc_onboarding_cache_v1", JSON.stringify({ name: "Legacy", classes: [{ name: "Biology" }] }));

    expect(loadCachedOnboarding("user-b")).toBeNull();
    expect(loadCachedOnboarding("user-a")).toMatchObject({ name: "Alex" });
  });

  it("clears legacy and account-scoped drafts", () => {
    localStorage.setItem("cc_onboarding_cache_v1:user-a", "{}");
    localStorage.setItem("cc_onboarding_cache_v1:user-b", "{}");
    localStorage.setItem("cc_onboarding_cache_v1", "{}");

    clearOnboarding();

    expect(localStorage.length).toBe(0);
  });

  it("saves partial answers only under the current account", () => {
    cacheOnboardingDraft({ name: "Jordan", classes: [] } as never, "user-a");

    expect(loadCachedOnboarding("user-a")).toMatchObject({ name: "Jordan" });
    expect(loadCachedOnboarding("user-b")).toBeNull();
  });
});
