import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLearningArtifact } from "./useLearningArtifact";

const mocks = vi.hoisted(() => {
  type QueryResult = { data: unknown; error: { message: string } | null };
  type PendingQuery = {
    resolve: (value: QueryResult) => void;
    reject: (reason: unknown) => void;
  };

  const pending: PendingQuery[] = [];
  const from = vi.fn(() => {
    let resolve!: PendingQuery["resolve"];
    let reject!: PendingQuery["reject"];
    const result = new Promise<QueryResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    pending.push({ resolve, reject });

    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "overlaps"]) {
      query[method] = vi.fn(() => query);
    }
    query.maybeSingle = vi.fn(() => result);
    return query;
  });

  return { pending, from, invoke: vi.fn() };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}));

describe("useLearningArtifact class boundary", () => {
  beforeEach(() => {
    mocks.pending.length = 0;
    mocks.from.mockClear();
    mocks.invoke.mockReset();
  });

  it("ignores an older class response that arrives after the new class", async () => {
    const { result, rerender } = renderHook(
      ({ classId }) => useLearningArtifact("flashcards", { classId }),
      { initialProps: { classId: "math" } },
    );

    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    rerender({ classId: "science" });
    await waitFor(() => expect(mocks.pending).toHaveLength(2));

    await act(async () => {
      mocks.pending[1].resolve({
        data: { id: "science-cards", client_class_id: "science" },
        error: null,
      });
    });
    await waitFor(() => expect(result.current.artifact?.id).toBe("science-cards"));

    await act(async () => {
      mocks.pending[0].resolve({
        data: { id: "math-cards", client_class_id: "math" },
        error: null,
      });
    });

    expect(result.current.artifact?.id).toBe("science-cards");
  });

  it("leaves loading state when the study-set request rejects", async () => {
    const { result } = renderHook(() => (
      useLearningArtifact("flashcards", { classId: "math" })
    ));

    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].reject(new Error("offline"));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("offline");
    expect(result.current.artifact).toBeNull();
  });

  it("leaves generating state when the build request rejects", async () => {
    const { result } = renderHook(() => (
      useLearningArtifact("flashcards", { classId: "math" })
    ));

    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].resolve({ data: null, error: null });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mocks.invoke.mockRejectedValueOnce(new Error("offline"));
    let generated: unknown;
    await act(async () => {
      generated = await result.current.generate();
    });

    expect(generated).toBeNull();
    expect(result.current.generating).toBe(false);
    expect(result.current.error).toBe("offline");
  });
});
