import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

export type ClientErrorKind = "render" | "window-error" | "unhandled-rejection";

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;
const SAFE_ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);
const MAX_REPORTS_PER_PAGE = 8;

let reportsSent = 0;

export interface ClientErrorReportInput {
  kind: ClientErrorKind;
  errorName?: string;
  route?: string;
}

export interface ClientErrorReportPayload {
  eventId: string;
  eventKind: ClientErrorKind;
  errorName: string;
  release: string;
  route: string;
}

function releaseIdentifier(): string {
  const candidate = import.meta.env.VITE_RELEASE_SHA?.trim() ?? "";
  return /^[0-9a-f]{7,40}$/i.test(candidate) ? candidate.toLowerCase() : "unknown";
}

export function sanitizeErrorRoute(value: string | undefined): string {
  const rawPath = (value ?? window.location.pathname).split("?")[0].split("#")[0];
  const path = rawPath.startsWith("/") ? rawPath : "/unknown";
  const redacted = path
    .split("/")
    .map((segment) => UUID_SEGMENT.test(segment) || OPAQUE_SEGMENT.test(segment) ? ":id" : segment)
    .join("/");
  return redacted.slice(0, 160) || "/";
}

export function buildClientErrorReport(input: ClientErrorReportInput): ClientErrorReportPayload {
  return {
    eventId: crypto.randomUUID(),
    eventKind: input.kind,
    errorName: input.errorName && SAFE_ERROR_NAMES.has(input.errorName) ? input.errorName : "Error",
    release: releaseIdentifier(),
    route: sanitizeErrorRoute(input.route),
  };
}

/**
 * Reports only an error class and a redacted route. Messages, stacks, source
 * text, account identifiers, and component props never leave the browser.
 */
export function reportClientError(input: ClientErrorReportInput): void {
  if (reportsSent >= MAX_REPORTS_PER_PAGE) return;
  reportsSent += 1;
  const body = buildClientErrorReport(input);
  void invokeEdgeFunction("report-client-error", {
    body,
    timeoutMs: 4_000,
  }).catch(() => undefined);
}

function errorNameFromUnknown(value: unknown): string {
  return value instanceof Error ? value.name : "Error";
}

export function installGlobalErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => {
    reportClientError({
      kind: "window-error",
      errorName: event.error instanceof Error ? event.error.name : "Error",
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportClientError({
      kind: "unhandled-rejection",
      errorName: errorNameFromUnknown(event.reason),
    });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

export function resetClientErrorReportLimitForTests(): void {
  reportsSent = 0;
}
