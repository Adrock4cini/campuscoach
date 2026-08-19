import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRealAssignments, useRealExams } from "./hooks";

const mocks = vi.hoisted(() => ({
  listAssignments: vi.fn(),
  listExams: vi.fn(),
  userId: "user-1",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));

vi.mock("./assignments", () => ({
  listAssignments: mocks.listAssignments,
}));

vi.mock("./exams", () => ({
  listExams: mocks.listExams,
}));

describe("real academic data hooks", () => {
  beforeEach(() => {
    mocks.listAssignments.mockReset();
    mocks.listExams.mockReset();
    mocks.userId = "user-1";
  });

  it("does not present an assignment load failure as an empty list", async () => {
    mocks.listAssignments.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useRealAssignments());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/couldn’t load your assignments/i);
  });

  it("does not present an exam load failure as an empty list", async () => {
    mocks.listExams.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useRealExams());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/couldn’t load your exams/i);
  });

  it("hides prior assignments synchronously when the account changes", async () => {
    mocks.listAssignments.mockResolvedValueOnce([{ id: "assignment-a", title: "Child A homework" }]);
    const { result, rerender } = renderHook(() => useRealAssignments());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let resolveSecond!: (rows: unknown[]) => void;
    mocks.listAssignments.mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    mocks.userId = "user-2";
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(true);
    resolveSecond([{ id: "assignment-b", title: "Child B homework" }]);
    await waitFor(() => expect(result.current.items[0]?.id).toBe("assignment-b"));
  });

  it("hides prior exams synchronously when the account changes", async () => {
    mocks.listExams.mockResolvedValueOnce([{ id: "exam-a", title: "Child A test" }]);
    const { result, rerender } = renderHook(() => useRealExams());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let resolveSecond!: (rows: unknown[]) => void;
    mocks.listExams.mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    mocks.userId = "user-2";
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(true);
    resolveSecond([{ id: "exam-b", title: "Child B test" }]);
    await waitFor(() => expect(result.current.items[0]?.id).toBe("exam-b"));
  });
});
