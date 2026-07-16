interface FunctionInvokeError {
  message?: string;
  context?: unknown;
}

interface ErrorBody {
  error?: string;
  details?: string;
  status?: number;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  "No concepts found for this request": "No study concepts were found yet. Add a quick note or professor hint, then try again.",
  "LOVABLE_API_KEY missing": "The study generator is not configured on the server yet.",
  Unauthorized: "Your session expired. Sign in again, then retry.",
};

/**
 * Supabase's FunctionsHttpError hides the response body on `context`.
 * Read it so students see a useful next step instead of “non-2xx”.
 */
export async function describeFunctionError(error: FunctionInvokeError): Promise<string> {
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
  if (serverMessage && FRIENDLY_ERRORS[serverMessage]) return FRIENDLY_ERRORS[serverMessage];

  if (response?.status === 404) {
    return "No study concepts were found yet. Add a quick note or professor hint, then try again.";
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
