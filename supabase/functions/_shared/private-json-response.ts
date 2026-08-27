const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const SAFE_SERVER_ERRORS: Record<number, { code: string; message: string }> = {
  500: {
    code: "internal_error",
    message: "The study service could not complete the request. Please try again.",
  },
  501: {
    code: "not_implemented",
    message: "This study feature is not available yet.",
  },
  502: {
    code: "upstream_failure",
    message: "The study service could not complete the request. Please try again.",
  },
  503: {
    code: "service_unavailable",
    message: "The study service is temporarily unavailable. Please try again.",
  },
  504: {
    code: "upstream_timeout",
    message: "The study service took too long to respond. Please try again.",
  },
};

const SAFE_SERVER_REASONS: Record<string, { message: string; retryable: boolean }> = {
  study_writes_paused: {
    message: "Study writes are temporarily paused. Please try again shortly.",
    retryable: true,
  },
};

interface PrivateJsonOptions {
  requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createPrivateRequestId(candidate?: string | null): string {
  if (candidate && REQUEST_ID_PATTERN.test(candidate)) return candidate;
  return crypto.randomUUID();
}

export function privateResponseHeaders(
  baseHeaders: HeadersInit = {},
  requestId?: string,
): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (requestId) headers.set("X-Request-ID", requestId);
  return headers;
}

export function privateJsonResponse(
  body: unknown,
  status = 200,
  baseHeaders: HeadersInit = {},
  options: PrivateJsonOptions = {},
): Response {
  const requestId = createPrivateRequestId(options.requestId);
  const responseBody = status >= 500
    ? safeServerErrorBody(body, status, requestId)
    : body;
  const headers = privateResponseHeaders(baseHeaders, requestId);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(responseBody), { status, headers });
}

export function logPrivateFailure(input: {
  errorClass: string;
  status: number;
  requestId: string;
}): void {
  const errorClass = /^[a-z][a-z0-9_]{0,63}$/.test(input.errorClass)
    ? input.errorClass
    : "internal_error";
  const status = Number.isInteger(input.status) && input.status >= 400 && input.status <= 599
    ? input.status
    : 500;
  console.error(JSON.stringify({
    errorClass,
    status,
    requestId: createPrivateRequestId(input.requestId),
  }));
}

export async function withPrivateJsonErrors(
  req: Request,
  baseHeaders: HeadersInit,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = createPrivateRequestId(req.headers.get("X-Request-ID"));
  try {
    return await handler(requestId);
  } catch {
    logPrivateFailure({ errorClass: "unhandled_exception", status: 500, requestId });
    return privateJsonResponse(undefined, 500, baseHeaders, { requestId });
  }
}

function safeServerErrorBody(
  body: unknown,
  status: number,
  requestId: string,
): Record<string, unknown> {
  const original = isRecord(body) ? body : {};
  const reason = typeof original.reason === "string"
    ? SAFE_SERVER_REASONS[original.reason]
    : undefined;
  const fallback = SAFE_SERVER_ERRORS[status] ?? SAFE_SERVER_ERRORS[500];
  const code = reason && typeof original.reason === "string" ? original.reason : fallback.code;
  return {
    error: reason?.message ?? fallback.message,
    code,
    requestId,
    ...((reason?.retryable || original.retryable === true) ? { retryable: true } : {}),
    ...(reason && typeof original.reason === "string" ? { reason: original.reason } : {}),
  };
}
