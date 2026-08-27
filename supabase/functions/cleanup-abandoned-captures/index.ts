// Internal scheduled cleanup for abandoned private capture uploads. The
// database returns only fenced, uncommitted paths; bytes are deleted only
// through the Storage API. No student text, path, or provider detail is logged.
import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import {
  logPrivateFailure,
  privateJsonResponse,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";

const BUCKET = "capture-sources";
const BATCH_LIMIT = 50;
const DOWNSTREAM_TIMEOUT_MS = 30_000;
const INVOCATION_DIGEST_CACHE_MS = 10_000;
const INVOCATION_SECRET = /^[0-9a-f]{64}$/;
const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$/;

let invocationDigestCache: { digest: string; expiresAt: number } | null = null;

Deno.serve((req) => withPrivateJsonErrors(req, {}, async (requestId) => {
  const json = (body: unknown, status = 200) => (
    privateJsonResponse(body, status, {}, { requestId })
  );
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1024) {
    return json({ error: "Request is too large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getAdminSecretKey();
  if (!supabaseUrl || !secretKey) {
    logPrivateFailure({ errorClass: "cleanup_environment_missing", status: 503, requestId });
    return json(undefined, 503);
  }

  const suppliedInvokeSecret = req.headers.get("x-cleanup-secret") ?? "";
  if (!suppliedInvokeSecret) return json({ error: "Authentication required" }, 401);
  if (!INVOCATION_SECRET.test(suppliedInvokeSecret)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createAdminClient(supabaseUrl, secretKey);
  let expectedDigest: string;
  try {
    expectedDigest = await getInvocationDigest(admin);
  } catch {
    logPrivateFailure({ errorClass: "cleanup_digest_unavailable", status: 503, requestId });
    return json(undefined, 503);
  }
  const suppliedDigest = await sha256Hex(suppliedInvokeSecret);
  if (!constantTimeEqualHex(suppliedDigest, expectedDigest)) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "JSON body must be an object" }, 400);
  }
  // There is deliberately no runtime test cutoff. Even an accidentally set
  // environment flag must not make fresh private uploads cleanup-eligible.
  if (Object.keys(body as Record<string, unknown>).length !== 0) {
    return json({ error: "Request body must be empty" }, 400);
  }

  const claimToken = crypto.randomUUID();
  const { data: claimedRows, error: claimError } = await admin.rpc(
    "claim_abandoned_capture_sources",
    { p_claim_token: claimToken, p_limit: BATCH_LIMIT, p_before: null },
  );
  if (claimError) {
    logPrivateFailure({ errorClass: "capture_cleanup_claim_failed", status: 503, requestId });
    return json(undefined, 503);
  }

  let claimedPaths: string[];
  try {
    claimedPaths = cleanupPaths(claimedRows);
  } catch {
    logPrivateFailure({ errorClass: "capture_cleanup_claim_invalid", status: 503, requestId });
    return json(undefined, 503);
  }
  if (claimedPaths.length === 0) {
    return json({ ok: true, claimed: 0, deleted: 0 });
  }

  const { data: confirmedRows, error: confirmError } = await admin.rpc(
    "confirm_capture_cleanup_claims",
    { p_claim_token: claimToken, p_storage_paths: claimedPaths },
  );
  if (confirmError) {
    logPrivateFailure({ errorClass: "capture_cleanup_confirm_failed", status: 503, requestId });
    return json(undefined, 503);
  }

  let confirmedPaths: string[];
  try {
    confirmedPaths = cleanupPaths(confirmedRows);
  } catch {
    logPrivateFailure({ errorClass: "capture_cleanup_confirm_invalid", status: 503, requestId });
    return json(undefined, 503);
  }
  if (confirmedPaths.length === 0) {
    return json({ ok: true, claimed: claimedPaths.length, deleted: 0 });
  }

  const { data: removedRows, error: removeError } = await admin.storage.from(BUCKET).remove(confirmedPaths);
  if (removeError) {
    // Claims remain fenced until a lease longer than the maximum worker
    // lifetime expires. A later invocation retries the unchanged batch.
    logPrivateFailure({ errorClass: "capture_storage_cleanup_failed", status: 503, requestId });
    return json(undefined, 503);
  }
  try {
    assertExactRemovedPaths(removedRows, confirmedPaths);
  } catch {
    // A success status without an exact per-object result is not proof that the
    // full fenced batch was deleted. Keep every claim leased for a safe retry.
    logPrivateFailure({ errorClass: "capture_storage_cleanup_result_invalid", status: 503, requestId });
    return json(undefined, 503);
  }

  const { data: released, error: releaseError } = await admin.rpc(
    "release_capture_cleanup_claims",
    { p_claim_token: claimToken, p_storage_paths: confirmedPaths },
  );
  if (releaseError) {
    // The objects are already gone; the next sweep observes that fact and
    // releases expired claims without issuing another unsafe deletion.
    logPrivateFailure({ errorClass: "capture_cleanup_release_failed", status: 503, requestId });
    return json(undefined, 503);
  }

  console.info(JSON.stringify({
    event: "capture_source_cleanup_completed",
    deleted: confirmedPaths.length,
    requestId,
  }));
  return json({
    ok: true,
    claimed: claimedPaths.length,
    deleted: confirmedPaths.length,
    released: typeof released === "number" ? released : confirmedPaths.length,
  });
}));

function cleanupPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > BATCH_LIMIT) {
    throw new Error("Invalid cleanup batch");
  }
  const paths = value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid cleanup row");
    }
    const path = (row as Record<string, unknown>).storage_path;
    if (typeof path !== "string" || !PATH.test(path)) {
      throw new Error("Invalid cleanup path");
    }
    return path;
  });
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate cleanup path");
  return paths;
}

function assertExactRemovedPaths(value: unknown, expectedPaths: string[]): void {
  if (!Array.isArray(value) || value.length !== expectedPaths.length) {
    throw new Error("Invalid Storage removal result");
  }
  const removedPaths = value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid Storage removal row");
    }
    const path = (row as Record<string, unknown>).name;
    if (typeof path !== "string" || !PATH.test(path)) {
      throw new Error("Invalid Storage removal path");
    }
    return path;
  });
  if (new Set(removedPaths).size !== removedPaths.length) {
    throw new Error("Duplicate Storage removal path");
  }
  const expected = [...expectedPaths].sort();
  const actual = [...removedPaths].sort();
  if (expected.some((path, index) => path !== actual[index])) {
    throw new Error("Incomplete Storage removal result");
  }
}

function getAdminSecretKey(): string {
  const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>;
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch {
      // Fall through to the hosted/local legacy key without logging secrets.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function createAdminClient(supabaseUrl: string, secretKey: string) {
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function getInvocationDigest(admin: AdminClient): Promise<string> {
  const now = Date.now();
  if (invocationDigestCache && invocationDigestCache.expiresAt > now) {
    return invocationDigestCache.digest;
  }
  const { data, error } = await admin.rpc("get_capture_cleanup_invocation_digest");
  if (error || typeof data !== "string" || !INVOCATION_SECRET.test(data)) {
    throw new Error("Invocation digest unavailable");
  }
  invocationDigestCache = {
    digest: data,
    expiresAt: now + INVOCATION_DIGEST_CACHE_MS,
  };
  return data;
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(actual: string, expected: string): boolean {
  if (!INVOCATION_SECRET.test(actual) || !INVOCATION_SECRET.test(expected)) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(DOWNSTREAM_TIMEOUT_MS) });
}
