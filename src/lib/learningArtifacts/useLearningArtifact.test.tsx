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

  return { pending, from, invoke: vi.fn(), userId: "student-1" };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real", user: { id: mocks.userId } }),
}));

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
    mocks.userId = "student-1";
  });

  it("ignores an older class response that arrives after the new class", async () => {
    const { result, rerender } = renderHook(
      ({ classId }) => useLearningArtifact("flashcards", { classId }),
      { initialProps: { classId: "math" } },
    );

    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    rerender({ classId: "science" });
    await waitFor(() => expect(mocks.pending).toHaveLength(2));
    const scienceQuery = mocks.from.mock.results[1].value as { eq: ReturnType<typeof vi.fn> };
    expect(scienceQuery.eq).toHaveBeenCalledWith("client_class_id", "science");

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

  it("hides the prior class artifact synchronously while a new scope loads", async () => {
    const { result, rerender } = renderHook(
      ({ classId }) => useLearningArtifact("flashcards", { classId }),
      { initialProps: { classId: "math" } },
    );
    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].resolve({
        data: { id: "math-cards", client_class_id: "math" },
        error: null,
      });
    });
    await waitFor(() => expect(result.current.artifact?.id).toBe("math-cards"));

    rerender({ classId: "science" });

    expect(result.current.artifact).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(mocks.pending).toHaveLength(2));
  });

  it("hides artifacts immediately when the signed-in owner changes", async () => {
    const { result, rerender } = renderHook(() => (
      useLearningArtifact("flashcards", { classId: "math" })
    ));
    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].resolve({ data: { id: "child-a-cards" }, error: null });
    });
    await waitFor(() => expect(result.current.artifact?.id).toBe("child-a-cards"));

    mocks.userId = "student-2";
    rerender();

    expect(result.current.artifact).toBeNull();
    expect(result.current.loading).toBe(true);
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

  it("keeps assignment and routing evidence inside the exact generation scope", async () => {
    const { result } = renderHook(() => (
      useLearningArtifact("practice", {
        classId: "math",
        assignmentId: "11111111-1111-4111-8111-111111111111",
      })
    ));
    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].resolve({ data: null, error: null });
    });
    mocks.invoke.mockResolvedValueOnce({ data: { artifact: null }, error: null });

    await act(async () => {
      await result.current.generate({ studentConfusion: "I keep reversing the operation." });
    });

    expect(mocks.invoke).toHaveBeenCalledWith("generate-artifact", expect.objectContaining({
      body: expect.objectContaining({
        kind: "practice",
        classId: "math",
        assignmentId: "11111111-1111-4111-8111-111111111111",
        studentConfusion: "I keep reversing the operation.",
      }),
    }));
    expect(result.current.artifact).toBeNull();
    expect(result.current.generating).toBe(false);
    expect(result.current.error).toMatch(/could not be confirmed/i);
  });

  it("does not resume a practice artifact recorded for another assignment", async () => {
    const { result } = renderHook(() => (
      useLearningArtifact("practice", {
        classId: "math",
        captureId: "capture-1",
        assignmentId: "11111111-1111-4111-8111-111111111111",
      })
    ));
    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].resolve({
        data: {
          id: "wrong-assignment-practice",
          study_scope_snapshot: { assignmentId: "22222222-2222-4222-8222-222222222222" },
        },
        error: null,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.artifact).toBeNull();
  });

  it("rejects a generated practice artifact outside the assignment scope", async () => {
    const { result } = renderHook(() => (
      useLearningArtifact("practice", {
        classId: "math",
        assignmentId: "11111111-1111-4111-8111-111111111111",
      })
    ));
    await waitFor(() => expect(mocks.pending).toHaveLength(1));
    await act(async () => {
      mocks.pending[0].resolve({ data: null, error: null });
    });
    mocks.invoke.mockResolvedValueOnce({
      data: {
        artifact: {
          id: "wrong-assignment-practice",
          kind: "practice",
          payload: { problems: [] },
          study_scope_snapshot: { assignmentId: "22222222-2222-4222-8222-222222222222" },
        },
      },
      error: null,
    });

    let generated: unknown;
    await act(async () => {
      generated = await result.current.generate();
    });

    expect(generated).toBeNull();
    expect(result.current.artifact).toBeNull();
    expect(result.current.error).toMatch(/did not match this assignment/i);
  });
});
