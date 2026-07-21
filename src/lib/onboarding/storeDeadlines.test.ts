import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSyllabusDeadlineRows } from "./syllabusDeadlines";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  existingTables: new Set<string>(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  getAnonUserId: () => "user-1",
}));

import { saveSyllabusDeadlines } from "./store";

function deadlineRows() {
  return buildSyllabusDeadlineRows({
    name: "Math",
    days: [],
    assignments: [{ label: "Problem set", dueDate: "2026-09-08" }],
    examDates: [{ label: "Midterm", date: "2026-09-20" }],
  }, {
    userId: "user-1",
    classUuid: "class-uuid",
    clientClassId: "math",
  });
}

describe("saving extracted syllabus deadlines", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.existingTables.clear();
    mocks.from.mockReset().mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: async () => ({
          data: mocks.existingTables.has(table) ? [{ id: `${table}-1` }] : [],
          error: null,
        }),
        insert: async (row: Record<string, unknown>) => {
          mocks.inserts.push({ table, row });
          return { error: null };
        },
      };
      return chain;
    });
  });

  it("writes extracted assignments and exams to the real calendar sources", async () => {
    await saveSyllabusDeadlines(deadlineRows());

    expect(mocks.inserts.map((item) => item.table)).toEqual(["assignments", "exams"]);
  });

  it("does not duplicate deadlines when onboarding is retried", async () => {
    mocks.existingTables.add("assignments");
    mocks.existingTables.add("exams");

    await saveSyllabusDeadlines(deadlineRows());

    expect(mocks.inserts).toEqual([]);
  });
});
