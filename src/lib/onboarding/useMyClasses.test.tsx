import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveLatestReadiness, useMyClasses } from "./useMyClasses";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, mode: "loading" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

describe("useMyClasses data integrity", () => {
  it("stays neutral while authentication is resolving", () => {
    const { result } = renderHook(() => useMyClasses());

    expect(result.current.loading).toBe(true);
    expect(result.current.classes).toEqual([]);
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
