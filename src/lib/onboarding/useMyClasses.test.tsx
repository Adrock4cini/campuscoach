import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLatestReadiness, useMyClasses } from "./useMyClasses";

const mocks = vi.hoisted(() => ({
  mode: "loading" as "loading" | "real" | "demo",
  user: null as { id: string } | null,
  classResult: { data: [], error: null } as { data: unknown[] | null; error: unknown },
  readinessResult: { data: [], error: null } as { data: unknown[] | null; error: unknown },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, mode: mocks.mode }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => table === "classes"
          ? { is: () => ({ order: async () => mocks.classResult }) }
          : Promise.resolve(mocks.readinessResult),
      }),
    }),
  },
}));

describe("useMyClasses data integrity", () => {
  beforeEach(() => {
    mocks.mode = "loading";
    mocks.user = null;
    mocks.classResult = { data: [], error: null };
    mocks.readinessResult = { data: [], error: null };
  });

  it("stays neutral while authentication is resolving", () => {
    const { result } = renderHook(() => useMyClasses());

    expect(result.current.loading).toBe(true);
    expect(result.current.classes).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("does not present a failed class query as an empty semester", async () => {
    mocks.mode = "real";
    mocks.user = { id: "student-1" };
    mocks.classResult = { data: null, error: new Error("offline") };

    const { result } = renderHook(() => useMyClasses());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.classes).toEqual([]);
    expect(result.current.error).toMatch(/saved classes were not deleted/i);
  });

  it("prefers normalized schedule fields and returns weekdays in calendar order", async () => {
    mocks.mode = "real";
    mocks.user = { id: "student-1" };
    mocks.classResult = {
      data: [{
        id: "math-uuid",
        client_class_id: "math-route",
        name: "Math",
        professor: null,
        location: null,
        color: "bg-primary",
        current_topic: null,
        readiness: 0,
        meta: {
          days: ["Fri"],
          time: "4:00 PM",
          term: "Legacy term",
          syllabus: {
            activeSyllabusId: "syllabus-uuid",
            revision: 2,
            reviewedAt: "2026-08-13T09:00:00.000Z",
          },
        },
        source: "manual",
        term: "Fall 2026",
        section: "001",
        semester_start_date: "2026-08-24",
        semester_end_date: "2026-12-12",
        weekdays: ["Thu", "Mon", "Mon"],
        start_time: "09:00:00",
        end_time: "10:15:00",
        time_zone: "America/Denver",
      }],
      error: null,
    };

    const { result } = renderHook(() => useMyClasses());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.classes[0]).toMatchObject({
      uuid: "math-uuid",
      id: "math-route",
      days: ["Mon", "Thu"],
      term: "Fall 2026",
      section: "001",
      semesterStartDate: "2026-08-24",
      semesterEndDate: "2026-12-12",
      timeZone: "America/Denver",
      startTimeKey: "09:00",
      endTimeKey: "10:15",
      hasSyllabus: true,
      syllabusRevision: 2,
      syllabusReviewedAt: "2026-08-13T09:00:00.000Z",
    });
    expect(result.current.classes[0].time).toMatch(/9:00/);
    expect(result.current.classes[0].endTime).toMatch(/10:15/);

    mocks.classResult = { data: null, error: new Error("refresh offline") };
    act(() => window.dispatchEvent(new CustomEvent("coach:refresh")));
    await waitFor(() => expect(result.current.error).toMatch(/couldn’t load/i));
    expect(result.current.classes[0].id).toBe("math-route");
  });

  it("uses the newest readiness snapshot without crossing class boundaries", () => {
    const snapshots = [
      {
        class_id: "science-uuid",
        client_class_id: "math",
        readiness: 99,
        computed_at: "2026-07-20T12:00:00.000Z",
      },
      {
        class_id: "math-uuid",
        client_class_id: "math",
        readiness: 45,
        computed_at: "2026-07-20T10:00:00.000Z",
      },
      {
        class_id: "math-uuid",
        client_class_id: "math",
        readiness: 73,
        computed_at: "2026-07-20T11:00:00.000Z",
      },
    ];

    expect(resolveLatestReadiness("math-uuid", "math", 0, snapshots)).toBe(73);
  });

  it("does not render one student's classes during another account's failed load", async () => {
    mocks.mode = "real";
    mocks.user = { id: "child-a" };
    mocks.classResult = {
      data: [{
        id: "a-uuid",
        client_class_id: "a-class",
        name: "Child A private class",
        professor: null,
        location: null,
        color: "bg-primary",
        current_topic: null,
        readiness: 0,
        meta: {},
        source: "manual",
        term: null,
        section: null,
        semester_start_date: null,
        semester_end_date: null,
        weekdays: [],
        start_time: null,
        end_time: null,
        time_zone: null,
      }],
      error: null,
    };
    const { result, rerender } = renderHook(() => useMyClasses());
    await waitFor(() => expect(result.current.classes[0]?.id).toBe("a-class"));

    mocks.user = { id: "child-b" };
    mocks.classResult = { data: null, error: new Error("offline") };
    rerender();

    expect(result.current.classes).toEqual([]);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error).toMatch(/saved classes were not deleted/i));
    expect(result.current.classes).toEqual([]);
  });
});
