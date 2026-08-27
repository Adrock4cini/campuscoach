import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EdgeFunctionAbortError,
  EdgeFunctionTimeoutError,
  invokeEdgeFunction,
} from "./invokeEdgeFunction";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

describe("invokeEdgeFunction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bounds a function promise that never settles", async () => {
    invoke.mockReturnValue(new Promise(() => undefined));
    const pending = invokeEdgeFunction("slow-function", { timeoutMs: 100 });
    const rejection = expect(pending).rejects.toBeInstanceOf(EdgeFunctionTimeoutError);

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(invoke.mock.calls[0][1]).toMatchObject({ timeout: 100 });
    expect(invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("lets a caller cancel an in-flight request immediately", async () => {
    invoke.mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();
    const pending = invokeEdgeFunction("slow-function", { controller, timeoutMs: 1_000 });

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(EdgeFunctionAbortError);
  });
});
