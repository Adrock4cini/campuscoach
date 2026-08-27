import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildAssignmentTutorPractice,
  extractAssignmentTutorSource,
} from "../_shared/assignment-tutor.ts";
import { conceptCanonicalKey } from "../_shared/concept-identity.ts";
import {
  checkStudyWritesPaused,
  STUDY_WRITES_PAUSED_RESPONSE,
} from "../_shared/study-write-pause.ts";
import {
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";

interface Body {
  captureId?: string;
  assignmentId?: string;
  classId?: string;
  text?: string;
  expectedVersion?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_CHARS = 360;

Deno.serve((req) => withPrivateJsonErrors(req, corsHeaders, async (requestId) => {
  const json = (body: unknown, status = 200) => (
    privateJsonResponse(body, status, corsHeaders, { requestId })
  );
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: privateResponseHeaders(corsHeaders, requestId) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Service unavailable" }, 503);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") return json({ error: "Authentication required" }, 401);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pauseGate = await checkStudyWritesPaused(
    () => adminClient.rpc("get_study_write_pause"),
  );
  if (pauseGate.blocked) {
    if (pauseGate.lookupFailed) {
      logPrivateFailure({
        errorClass: "pause_control_unavailable",
        status: 503,
        requestId,
      });
    }
    return json(STUDY_WRITES_PAUSED_RESPONSE, 503);
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return json({ error: "JSON body must be an object" }, 400);
  }
  const body = parsed as Body;
  if (!body.captureId || !UUID_PATTERN.test(body.captureId)
      || !body.assignmentId || !UUID_PATTERN.test(body.assignmentId)
      || typeof body.classId !== "string" || !body.classId.trim() || body.classId.length > 200
      || !Number.isInteger(body.expectedVersion) || (body.expectedVersion ?? -1) < 0
      || typeof body.text !== "string") {
    return json({ error: "Confirmation request is invalid" }, 400);
  }

  const sourceText = body.text.trim();
  if (!sourceText || sourceText.length > MAX_SOURCE_CHARS) {
    return json({
      error: `Enter one problem in ${MAX_SOURCE_CHARS} characters or fewer`,
      reason: "invalid_practice_source",
    }, 422);
  }
  const supported = buildAssignmentTutorPractice({
    conceptId: "practice-source-confirmation",
    conceptName: "Assignment problem",
    sourceExcerpt: sourceText,
  });
  if (!supported.supported) {
    return json({
      error: "Tutor v1 can confirm one percent or percent-discount problem at a time. Check the numbers and wording, then try again.",
      reason: "unsupported_assignment_problem",
    }, 422);
  }

  const extracted = extractAssignmentTutorSource(sourceText);
  if (!extracted || extracted.concepts.length !== 1) {
    return json({ error: "The confirmed problem could not be prepared safely" }, 422);
  }
  const candidate = extracted.concepts[0];
  const identityKey = conceptCanonicalKey(candidate.name, candidate.definition);
  const sourceHash = await sha256(sourceText);
  const { data, error } = await adminClient.rpc("confirm_assignment_practice_source", {
    p_user_id: userId,
    p_capture_id: body.captureId,
    p_assignment_id: body.assignmentId,
    p_client_class_id: body.classId,
    p_expected_version: body.expectedVersion,
    p_source_text: sourceText,
    p_source_hash: sourceHash,
    p_concept_identity_key: identityKey,
    p_concept_name: candidate.name,
    p_concept_definition: candidate.definition,
    p_concept_example: sourceText,
    p_concept_slug: slugify(candidate.name),
  });
  if (error) {
    logPrivateFailure({
      errorClass: "practice_source_confirmation_failed",
      status: 500,
      requestId,
    });
    return json({ error: "The problem could not be confirmed" }, 500);
  }
  const result = isRecord(data) ? data : {};
  const disposition = result.disposition;
  if (disposition === "not-found") return json({ error: "Assignment capture not found" }, 404);
  if (disposition === "boundary-mismatch") {
    return json({ error: "That capture is not linked to this assignment and class" }, 409);
  }
  if (disposition === "stale-version") {
    return json({
      error: "This problem changed in another tab. Reload it before confirming.",
      reason: "stale_practice_source",
      version: result.version,
    }, 409);
  }
  if (disposition !== "confirmed"
      || typeof result.version !== "number"
      || result.hash !== sourceHash
      || typeof result.conceptId !== "string"
      || !UUID_PATTERN.test(result.conceptId)) {
    return json({ error: "The problem could not be confirmed" }, 409);
  }

  return json({
    ok: true,
    practiceSourceStatus: "confirmed",
    practiceSourceText: sourceText,
    practiceSourceVersion: result.version,
    practiceSourceHash: sourceHash,
    practiceSourceConfirmedAt: typeof result.confirmedAt === "string" ? result.confirmedAt : null,
    practiceConceptId: result.conceptId,
    idempotent: result.idempotent === true,
  });
}));

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80)
    || "concept";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function json(body: unknown, status = 200) {
  return privateJsonResponse(body, status, corsHeaders);
}
