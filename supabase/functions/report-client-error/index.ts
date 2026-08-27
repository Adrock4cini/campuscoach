import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";

const PRIVATE_HEADERS = {
  ...corsHeaders,
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};
const EVENT_KINDS = new Set(["render", "window-error", "unhandled-rejection"]);
const ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE_PATTERN = /^(unknown|[0-9a-f]{7,40})$/i;
const ROUTE_PATTERN = /^\/[A-Za-z0-9_:/.-]{0,159}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ClientErrorReport {
  eventId: string;
  eventKind: string;
  errorName: string;
  release: string;
  route: string;
}

function json(body: Record<string, unknown>, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PRIVATE_HEADERS, "X-Request-ID": requestId },
  });
}

function isValidReport(value: unknown): value is ClientErrorReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  if (Object.keys(report).some((key) => ![
    "eventId", "eventKind", "errorName", "release", "route",
  ].includes(key))) return false;
  return typeof report.eventId === "string"
    && UUID_PATTERN.test(report.eventId)
    && typeof report.eventKind === "string"
    && EVENT_KINDS.has(report.eventKind)
    && typeof report.errorName === "string"
    && ERROR_NAMES.has(report.errorName)
    && typeof report.release === "string"
    && RELEASE_PATTERN.test(report.release)
    && typeof report.route === "string"
    && ROUTE_PATTERN.test(report.route);
}

Deno.serve(async (req) => {
  const candidateRequestId = req.headers.get("X-Request-ID");
  const requestId = candidateRequestId && REQUEST_ID_PATTERN.test(candidateRequestId)
    ? candidateRequestId
    : crypto.randomUUID();
  const responseHeaders = { ...PRIVATE_HEADERS, "X-Request-ID": requestId };
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed", requestId }, 405, requestId);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized", requestId }, 401, requestId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Error reporting is temporarily unavailable", requestId }, 503, requestId);
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(
    authHeader.slice("Bearer ".length),
  );
  if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized", requestId }, 401, requestId);

  const declaredSize = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > 4_096) {
    return json({ error: "Report is too large", requestId }, 413, requestId);
  }
  const rawBody = await req.text();
  if (rawBody.length > 4_096) return json({ error: "Report is too large", requestId }, 413, requestId);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON", requestId }, 400, requestId);
  }
  if (!isValidReport(parsed)) return json({ error: "Invalid report", requestId }, 400, requestId);

  // Deliberately omit the account ID, error message, stack, source content,
  // request body, and auth token. Production alerts key off this safe marker.
  console.error("[client-error]", JSON.stringify({
    requestId,
    eventId: parsed.eventId,
    eventKind: parsed.eventKind,
    errorName: parsed.errorName,
    release: parsed.release,
    route: parsed.route,
  }));
  return json({ accepted: true, requestId }, 202, requestId);
});
