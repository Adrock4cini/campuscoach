import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classUpserts: [] as Array<Record<string, unknown>>,
  classUpdates: [] as Array<Record<string, unknown>>,
  enrollmentUpserts: [] as Array<Record<string, unknown>>,
  existing: {
    id: "class-row-1",
    client_class_id: "stable-route-key",
    meta: { schedule: [{ date: "2026-09-01", topic: "Introduction" }], syllabusFile: "fall.pdf" },
  } as Record<string, unknown> | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "enrollments") {
        return {
          upsert: async (payload: Record<string, unknown>) => {
            mocks.enrollmentUpserts.push(payload);
            return { error: null };
          },
        };
      }

      const lookupChain = {
        eq: () => lookupChain,
        maybeSingle: async () => ({ data: mocks.existing, error: null }),
      };
      const updateChain = {
        eq: () => updateChain,
        select: () => ({
          single: async () => ({
            data: {
              id: mocks.existing?.id ?? "class-row-1",
              client_class_id: mocks.existing?.client_class_id ?? "stable-route-key",
            },
            error: null,
          }),
        }),
      };
      return {
        select: () => lookupChain,
        upsert: (payload: Record<string, unknown>) => {
          mocks.classUpserts.push(payload);
          return {
            select: () => ({
              single: async () => ({
                data: { id: payload.id, client_class_id: payload.client_class_id },
                error: null,
              }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          mocks.classUpdates.push(payload);
          return updateChain;
        },
      };
    },
  },
}));

import {
  classEditorSchema,
  createClass,
  emptyClassEditorValues,
  updateClass,
} from "./classes";

function validClass() {
  return {
    ...emptyClassEditorValues("Fall 2026"),
    name: "Biology",
    weekdays: ["Thu", "Mon", "Wed", "Mon"] as never,
    startTime: "09:00",
    endTime: "10:15",
    semesterStartDate: "2026-08-24",
    semesterEndDate: "2026-12-12",
    timeZone: "America/Denver",
  };
}

describe("real class persistence", () => {
  beforeEach(() => {
    mocks.classUpserts.length = 0;
    mocks.classUpdates.length = 0;
    mocks.enrollmentUpserts.length = 0;
    mocks.existing = {
      id: "class-row-1",
      client_class_id: "stable-route-key",
      meta: { schedule: [{ date: "2026-09-01", topic: "Introduction" }], syllabusFile: "fall.pdf" },
    };
  });

  it("uses one immutable random key rather than deriving identity from the name", async () => {
    await createClass("student-1", "draft-uuid-1", validClass());
    await createClass("student-1", "draft-uuid-2", validClass());

    expect(mocks.classUpserts.map((row) => [row.id, row.client_class_id])).toEqual([
      ["draft-uuid-1", "draft-uuid-1"],
      ["draft-uuid-2", "draft-uuid-2"],
    ]);
    expect(mocks.enrollmentUpserts).toHaveLength(2);
  });

  it("normalizes weekday order before saving", async () => {
    await createClass("student-1", "draft-uuid-1", validClass());
    expect(mocks.classUpserts[0].weekdays).toEqual(["Mon", "Wed", "Thu"]);
  });

  it("edits by database UUID without changing the route key or unrelated metadata", async () => {
    const renamed = { ...validClass(), name: "Advanced Biology" };
    const identity = await updateClass("student-1", "class-row-1", renamed);

    expect(identity.clientClassId).toBe("stable-route-key");
    expect(mocks.classUpdates[0]).not.toHaveProperty("id");
    expect(mocks.classUpdates[0]).not.toHaveProperty("client_class_id");
    expect(mocks.classUpdates[0].meta).toMatchObject({
      schedule: [{ date: "2026-09-01", topic: "Introduction" }],
      syllabusFile: "fall.pdf",
      days: ["Mon", "Wed", "Thu"],
    });
  });

  it("rejects invalid semester and meeting ranges", () => {
    const result = classEditorSchema.safeParse({
      ...validClass(),
      semesterStartDate: "2026-12-12",
      semesterEndDate: "2026-08-24",
      startTime: "12:00",
      endTime: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["semesterEndDate", "endTime"]),
      );
    }
  });

  it("does not save a meeting time without a weekday", () => {
    const result = classEditorSchema.safeParse({
      ...validClass(),
      weekdays: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["weekdays"] }),
      ]));
    }
  });
});
