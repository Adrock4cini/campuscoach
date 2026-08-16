// Internal, scheduled cleanup for abandoned class-syllabus uploads.
// Storage objects are removed only through the Storage API.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "syllabus-sources";
const BATCH_LIMIT = 50;
const DOWNSTREAM_TIMEOUT_MS = 30_000;
const INVOCATION_DIGEST_CACHE_MS = 10_000;
const INVOCATION_SECRET = /^[0-9a-f]{64}$/;
const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/source\.(pdf|jpg|jpeg|png|webp|heic|heif)$/;

let invocationDigestCache: { digest: string; expiresAt: number } | null = null;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1024) {
    return json({ error: "Request is too large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getAdminSecretKey();
  if (!supabaseUrl || !secretKey) {
    console.error("[cleanup-abandoned-syllabi] Supabase environment is incomplete");
    return json({ error: "Service unavailable" }, 503);
  }

  const suppliedInvokeSecret = req.headers.get("x-cleanup-secret") ?? "";
  if (!suppliedInvokeSecret) return json({ error: "Authentication required" }, 401);
  if (!INVOCATION_SECRET.test(suppliedInvokeSecret)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });

  let expectedDigest: string;
  try {
    expectedDigest = await getInvocationDigest(admin);
  } catch {
    // A missing/invalid digest or unavailable auth RPC must never fall through
    // to the cleanup claim path.
    console.error("[cleanup-abandoned-syllabi] invocation digest is unavailable");
    return json({ error: "Service unavailable" }, 503);
  }
  const suppliedDigest = await sha256Hex(suppliedInvokeSecret);
  if (!constantTimeEqualHex(suppliedDigest, expectedDigest)) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "JSON body must be an object" }, 400);
  }
  let testBefore: string | null = null;
  const requestedTestBefore = (body as Record<string, unknown>).testBefore;
  if (requestedTestBefore !== undefined) {
    if (Deno.env.get("ALLOW_SYLLABUS_CLEANUP_TEST_MODE") !== "true") {
      return json({ error: "Cleanup test mode is disabled" }, 403);
    }
    if (typeof requestedTestBefore !== "string") {
      return json({ error: "Cleanup test cutoff is invalid" }, 400);
    }
    if (requestedTestBefore === "now") {
      testBefore = new Date().toISOString();
    } else {
      const cutoff = new Date(requestedTestBefore);
      if (Number.isNaN(cutoff.getTime()) || cutoff.getTime() > Date.now()) {
        return json({ error: "Cleanup test cutoff is invalid" }, 400);
      }
      testBefore = cutoff.toISOString();
    }
  }

  const claimToken = crypto.randomUUID();

  const { data: claimedRows, error: claimError } = await admin.rpc(
    "claim_abandoned_syllabus_sources",
    { p_claim_token: claimToken, p_limit: BATCH_LIMIT, p_before: testBefore },
  );
  if (claimError) {
    console.error(`[cleanup-abandoned-syllabi] claim failed: ${claimError.message}`);
    return json({ error: "Cleanup claim failed" }, 503);
  }

  let claimedPaths: string[];
  try {
    claimedPaths = cleanupPaths(claimedRows);
  } catch (error) {
    console.error("[cleanup-abandoned-syllabi] claim returned an invalid path set", error);
    return json({ error: "Cleanup claim failed closed" }, 503);
  }
  if (claimedPaths.length === 0) {
    return json({ ok: true, claimed: 0, deleted: 0 });
  }

  // Fence the token and renew its 15-minute lease immediately before the API
  // deletion. The function's downstream calls each time out after 30 seconds.
  const { data: confirmedRows, error: confirmError } = await admin.rpc(
    "confirm_syllabus_cleanup_claims",
    { p_claim_token: claimToken, p_storage_paths: claimedPaths },
  );
  if (confirmError) {
    console.error(`[cleanup-abandoned-syllabi] confirmation failed: ${confirmError.message}`);
    return json({ error: "Cleanup confirmation failed" }, 503);
  }

  let confirmedPaths: string[];
  try {
    confirmedPaths = cleanupPaths(confirmedRows);
  } catch (error) {
    console.error("[cleanup-abandoned-syllabi] confirmation returned an invalid path set", error);
    return json({ error: "Cleanup confirmation failed closed" }, 503);
  }
  if (confirmedPaths.length === 0) {
    return json({ ok: true, claimed: claimedPaths.length, deleted: 0 });
  }

  const { error: removeError } = await admin.storage.from(BUCKET).remove(confirmedPaths);
  if (removeError) {
    // Keep the fenced claims. A later scheduled run reclaims them only after a
    // lease longer than the platform's maximum Edge worker lifetime.
    console.error(`[cleanup-abandoned-syllabi] Storage API removal failed: ${removeError.message}`);
    return json({ error: "Storage cleanup failed; the batch will retry" }, 503);
  }

  const { data: released, error: releaseError } = await admin.rpc(
    "release_syllabus_cleanup_claims",
    { p_claim_token: claimToken, p_storage_paths: confirmedPaths },
  );
  if (releaseError) {
    // The files are already gone. Leaving the claims is safe: the next run will
    // observe no object, release them after expiry, and never SQL-delete Storage.
    console.error(`[cleanup-abandoned-syllabi] claim release failed: ${releaseError.message}`);
    return json({ error: "Storage cleanup completed but claim release will retry" }, 503);
  }

  console.info(`[cleanup-abandoned-syllabi] removed ${confirmedPaths.length} abandoned source(s)`);
  return json({
    ok: true,
    claimed: claimedPaths.length,
    deleted: confirmedPaths.length,
    released: typeof released === "number" ? released : confirmedPaths.length,
  });
});

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

function getAdminSecretKey(): string {
  const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (namedKeys) {
    try {
      const parsed = JSON.parse(namedKeys) as Record<string, unknown>;
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch {
      // Fall through to the legacy hosted/local key without logging secrets.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function getInvocationDigest(admin: ReturnType<typeof createClient>): Promise<string> {
  const now = Date.now();
  if (invocationDigestCache && invocationDigestCache.expiresAt > now) {
    return invocationDigestCache.digest;
  }

  const { data, error } = await admin.rpc("get_syllabus_cleanup_invocation_digest");
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
