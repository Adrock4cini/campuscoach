import type { FunctionInvokeOptions } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const EDGE_FUNCTION_TIMEOUT_MS = 20_000;

export class EdgeFunctionTimeoutError extends Error {
  constructor() {
    super("The request took too long. Please try again.");
    this.name = "EdgeFunctionTimeoutError";
  }
}

export class EdgeFunctionAbortError extends Error {
  constructor() {
    super("The request was canceled.");
    this.name = "EdgeFunctionAbortError";
  }
}

interface BoundedInvokeOptions extends Omit<FunctionInvokeOptions, "signal" | "timeout"> {
  controller?: AbortController;
  timeoutMs?: number;
}

/**
 * Supabase supports request timeouts, but this outer bound also protects the
 * UI when a browser/network adapter never settles its promise after aborting.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options: BoundedInvokeOptions = {},
) {
  const {
    controller = new AbortController(),
    timeoutMs = EDGE_FUNCTION_TIMEOUT_MS,
    ...invokeOptions
  } = options;
  let timedOut = false;

  const aborted = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) {
      reject(new EdgeFunctionAbortError());
      return;
    }
    controller.signal.addEventListener("abort", () => {
      reject(timedOut ? new EdgeFunctionTimeoutError() : new EdgeFunctionAbortError());
    }, { once: true });
  });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    return await Promise.race([
      supabase.functions.invoke<T>(functionName, {
        ...invokeOptions,
        signal: controller.signal,
        timeout: Math.max(1, timeoutMs),
      }),
      aborted,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
