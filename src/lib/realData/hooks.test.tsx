import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRealAssignments, useRealExams } from "./hooks";

const mocks = vi.hoisted(() => ({
  listAssignments: vi.fn(),
  listExams: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
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
});
