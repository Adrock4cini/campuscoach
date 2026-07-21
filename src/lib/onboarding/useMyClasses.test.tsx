import { renderHook, waitFor } from "@testing-library/react";
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
          ? { order: async () => mocks.classResult }
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
});
