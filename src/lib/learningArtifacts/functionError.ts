interface FunctionInvokeError {
  message?: string;
  context?: unknown;
}

interface ErrorBody {
  error?: string;
  details?: string;
  reason?: string;
  retryable?: boolean;
  status?: number;
}

export interface FunctionErrorDetails {
  message: string;
  reason: string | null;
  retryable: boolean | null;
  status: number | null;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  "No concepts found for this request": "No study concepts were found yet. Add a quick note or teacher hint, then try again.",
  "LOVABLE_API_KEY missing": "The study generator is not configured on the server yet.",
  Unauthorized: "Your session expired. Sign in again, then retry.",
};

export interface DescribeFunctionErrorOptions {
  /**
   * Set when the request was scoped to one freshly saved capture. A 404 then
   * means "this capture isn't ready yet", not "you have no notes".
   */
  scope?: "capture";
}

/**
 * Reads the structured body attached to a Supabase FunctionsHttpError.
 * Callers that own recovery behavior can distinguish an idempotent retry from
 * a terminal conflict without matching student-facing prose.
 */
export async function readFunctionErrorDetails(error: unknown): Promise<FunctionErrorDetails> {
  const candidate = error && typeof error === "object"
    ? error as FunctionInvokeError & ErrorBody
    : null;
  const response = candidate?.context instanceof Response ? candidate.context : null;
  let body: ErrorBody | null = null;

  if (response) {
    try {
      body = await response.clone().json() as ErrorBody;
    } catch {
      body = null;
    }
  }

  return {
    message: body?.error?.trim()
      || candidate?.message?.trim()
      || "The request could not be completed.",
    reason: typeof body?.reason === "string"
      ? body.reason
      : typeof candidate?.reason === "string" ? candidate.reason : null,
    retryable: typeof body?.retryable === "boolean"
      ? body.retryable
      : typeof candidate?.retryable === "boolean" ? candidate.retryable : null,
    status: response?.status ?? (typeof candidate?.status === "number" ? candidate.status : null),
  };
}

/**
 * Supabase's FunctionsHttpError hides the response body on `context`.
 * Read it so students see a useful next step instead of “non-2xx”.
 */
export async function describeFunctionError(
  error: FunctionInvokeError,
  options: DescribeFunctionErrorOptions = {},
): Promise<string> {
  const response = error.context instanceof Response ? error.context : null;
  let body: ErrorBody | null = null;

  if (response) {
    try {
      body = await response.clone().json() as ErrorBody;
    } catch {
      body = null;
    }
  }

  const serverMessage = body?.error?.trim();

  if (!response) {
    // FunctionsFetchError / transport failure: no HTTP status was reached.
    return "Couldn’t build this set yet — check your connection and Retry. Nothing you saved was lost.";
  }

  if (response.status === 404 && options.scope === "capture") {
    return "Couldn’t build this set yet — Retry in a moment. Your capture is still saved.";
  }

  if (serverMessage && FRIENDLY_ERRORS[serverMessage]) return FRIENDLY_ERRORS[serverMessage];

  if (response?.status === 404) {
    return "No study concepts were found yet. Add a quick note or teacher hint, then try again.";
  }

  if (response?.status === 429) {
    // Rate limited: never a dead end. Saved study sets stay usable meanwhile.
    const retryAfter = Number(response.headers?.get?.("retry-after") ?? "");
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? `about ${Math.max(1, Math.ceil(retryAfter / 60))} minute${Math.ceil(retryAfter / 60) === 1 ? "" : "s"}`
      : "a minute";
    return `You've generated a lot of study material just now. Wait ${wait} and try again — everything you already made is still saved.`;
  }
  if (response?.status === 401) {
    return "Your session expired. Sign in again, then retry.";
  }
  if (response && response.status >= 500) {
    return serverMessage
      ? `The study generator could not finish: ${serverMessage}. Your existing study set is still safe.`
      : "The study generator is temporarily unavailable. Your existing study set is still safe; try again shortly.";
  }

  return serverMessage || error.message || "The study generator could not finish. Please try again.";
}
