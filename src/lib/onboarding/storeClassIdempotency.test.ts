import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  classRows: [] as Array<Record<string, unknown>>,
  classUpserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  getAnonUserId: () => "user-1",
}));

import { saveOnboarding } from "./store";
import type { OnboardingData } from "./types";

function draft(clientClassId: string): OnboardingData {
  return {
    name: "Sam",
    school: "",
    term: "Fall 2026",
    learnerType: "college",
    workSchedule: "",
    reminderStyle: "gentle",
    studyGoal: "",
    classes: [
      { name: "Biology 101", days: [], clientClassId, section: "A" },
    ],
  } as unknown as OnboardingData;
}

function chainFor(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => (table === "classes"
      ? Promise.resolve({ data: mocks.classRows, error: null })
      : chain),
    ilike: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "class-uuid" }, error: null }),
    insert: async () => ({ error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: (row: Record<string, unknown>) => {
      if (table === "classes") {
        mocks.classUpserts.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: row.id ?? "class-uuid" }, error: null }) }),
        };
      }
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

describe("onboarding retry never duplicates classes", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.classRows.length = 0;
    mocks.classUpserts.length = 0;
    mocks.from.mockReset().mockImplementation((table: string) => chainFor(table));
  });

  it("reuses the existing class row when Finish is retried with a fresh draft id", async () => {
    mocks.classRows.push({
      id: "existing-uuid",
      client_class_id: "existing-client-id",
      name: "Biology 101",
      term: "Fall 2026",
      section: "A",
    });

    await saveOnboarding(draft("00000000-0000-4000-8000-000000000abc"), "user-1");

    expect(mocks.classUpserts).toHaveLength(1);
    expect(mocks.classUpserts[0].id).toBe("existing-uuid");
    expect(mocks.classUpserts[0].client_class_id).toBe("existing-client-id");
  });

  it("still creates a class when the account has none yet", async () => {
    await saveOnboarding(draft("00000000-0000-4000-8000-000000000abc"), "user-1");

    expect(mocks.classUpserts).toHaveLength(1);
    expect(mocks.classUpserts[0].id).toBe("00000000-0000-4000-8000-000000000abc");
  });

  it("keeps a same-named class in a different term distinct", async () => {
    mocks.classRows.push({
      id: "spring-uuid",
      client_class_id: "spring-client-id",
      name: "Biology 101",
      term: "Spring 2026",
      section: "A",
    });

    await saveOnboarding(draft("00000000-0000-4000-8000-000000000abc"), "user-1");

    expect(mocks.classUpserts[0].id).toBe("00000000-0000-4000-8000-000000000abc");
  });
});
