// Extract structured concepts from a capture (text/transcript/OCR) and
// persist them to `concepts` + upsert `user_concept_mastery`.
// Uses Lovable AI Gateway (Gemini 2.5 flash) for extraction and OpenAI
// text-embedding-3-small for the semantic embedding.

import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";
import { extractExactThinSource } from "../_shared/thin-source.ts";
import { extractAssignmentTutorSource } from "../_shared/assignment-tutor.ts";
import { assessSourceSufficiency, isLogisticsLine } from "../_shared/grounding-quality.ts";
import {
  checkStudyWritesPaused,
  STUDY_WRITES_PAUSED_RESPONSE,
} from "../_shared/study-write-pause.ts";
import {
  checkCurrentFamilyBetaAgreement,
  CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
  FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE,
  FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE,
} from "../_shared/family-beta-agreement.ts";
import {
  conceptCanonicalKey,
  dedupeConceptCandidates,
  type ExistingConcept,
} from "../_shared/concept-identity.ts";
import {
  executePaidAiRequest,
  type PaidAiExecutionResult,
  type PaidAiQuotaPermit,
} from "../_shared/paid-ai-quota.ts";
import {
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";


interface Body {
  captureId?: string;
  classId?: string | null;
  clientClassId?: string | null;
  className?: string | null;
  topic?: string | null;
  kind?: string | null;
  rawText?: string | null;
}

interface ExtractedConcept {
  name: string;
  definition?: string | null;
  examples?: string[];
  professor_emphasis?: boolean;
}

const SYSTEM = `You extract the concrete concepts a student needs to remember from captured class materials (lesson note, board photo, textbook page, quick note, or teacher/instructor emphasis note).

Return ONLY JSON matching:
{
  "summary": string,               // 1-2 sentences describing what was learned
  "concepts": [
    {
      "name": string,              // 2-6 word concept title, Title Case
      "definition": string|null,   // 1-2 sentence definition in student-friendly language
      "examples": string[],        // 0-3 short worked examples or applications
      "professor_emphasis": bool   // true if the teacher or instructor flagged this as important / on the test
    }
  ]
}
Rules:
- Return 0-8 concepts. Never invent content not present in the source.
- If the source does not support a concrete academic concept, return an empty concepts array.
- If the source kind is "professor-hint", treat it as a teacher/instructor emphasis note and mark every concept professor_emphasis=true.
- If the source is thin, return fewer concepts rather than padding.
- A single equation or factual statement should normally become exactly one concept that preserves the source wording.
- Do not replace a concrete fact with an umbrella label such as "Addition Fact" unless that label appears in the source.
- No prose outside the JSON.`;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "concept";

// A synchronous extraction finishes in seconds. Anything older than this is
// an orphaned claim (lost response, client cancellation, cold-start kill) and
// must be reclaimable so a student is never stuck waiting minutes.
const EXTRACTION_CLAIM_MS = 90 * 1000;
const MAX_EXTRACTION_REQUEST_BYTES = 100_000;
const MAX_RAW_TEXT_CHARS = 50_000;
const MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS = 360;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AI_HOURLY_LIMIT = 30;
const AI_DAILY_LIMIT = 120;

interface ClaimGuard { release: (() => Promise<void>) | null }

// No branch may leak the extraction claim. Any unexpected throw after the
// claim is acquired releases it as `failed` so the capture reaches a terminal,
// retryable state instead of staying "processing" forever.
Deno.serve((req) => withPrivateJsonErrors(req, corsHeaders, async (requestId) => {
  const guard: ClaimGuard = { release: null };
  try {
    return await handleRequest(req, guard, requestId);
  } catch (error) {
    try { await guard.release?.(); } catch { /* best effort */ }
    throw error;
  }
}));

async function handleRequest(
  req: Request,
  guard: ClaimGuard,
  requestId: string,
): Promise<Response> {
  const json = (body: unknown, status = 200) => (
    privateJsonResponse(body, status, corsHeaders, { requestId })
  );
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: privateResponseHeaders(corsHeaders, requestId) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EXTRACTION_REQUEST_BYTES) {
    return json({ error: "Capture text is too large to process safely" }, 413);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const key = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    logPrivateFailure({ errorClass: "public_environment_missing", status: 503, requestId });
    return json({ error: "Service unavailable" }, 503);
  }

  const supabase = createClient(
    supabaseUrl,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );
  const jwt = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(jwt);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    logPrivateFailure({ errorClass: "service_environment_missing", status: 503, requestId });
    return json({ error: "Service unavailable" }, 503);
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const agreementGate = await checkCurrentFamilyBetaAgreement(userId, () =>
    adminClient
      .from("family_beta_agreement_acceptances")
      .select("user_id, accepted_by, agreement_version, accepted_at")
      .eq("user_id", userId)
      .eq("agreement_version", CURRENT_FAMILY_BETA_AGREEMENT_VERSION)
      .maybeSingle()
  );
  if (!agreementGate.allowed) {
    if (agreementGate.lookupFailed) {
      logPrivateFailure({ errorClass: "agreement_check_unavailable", status: 503, requestId });
      return json(FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE, 503);
    }
    return json(FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE, 403);
  }
  const pauseGate = await checkStudyWritesPaused(
    () => adminClient.rpc("get_study_write_pause"),
  );
  if (pauseGate.blocked) {
    if (pauseGate.lookupFailed) {
      logPrivateFailure({ errorClass: "pause_control_unavailable", status: 503, requestId });
    }
    return json(STUDY_WRITES_PAUSED_RESPONSE, 503);
  }

  let parsedBody: unknown;
  try { parsedBody = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return json({ error: "JSON body must be an object" }, 400);
  }
  const body = parsedBody as Body;
  if (body.captureId !== undefined && (
    typeof body.captureId !== "string" || !UUID_PATTERN.test(body.captureId)
  )) return json({ error: "captureId must be a UUID" }, 400);
  if (body.classId !== undefined && body.classId !== null && (
    typeof body.classId !== "string" || !UUID_PATTERN.test(body.classId)
  )) return json({ error: "classId must be a UUID" }, 400);
  if (body.clientClassId !== undefined && body.clientClassId !== null && (
    typeof body.clientClassId !== "string" || !body.clientClassId.trim() || body.clientClassId.length > 200
  )) return json({ error: "clientClassId is invalid" }, 400);

  // A durable capture is the source of truth on retries. This prevents a
  // changed client payload from attaching different material to the same
  // capture after a mobile response is lost.
  let capture: {
    id: string;
    kind: string;
    class_id: string | null;
    client_class_id: string | null;
    assignment_id: string | null;
    exam_id: string | null;
    raw_text: string | null;
    processing_status: string;
    concept_extraction_claim_id: string | null;
    concept_extraction_started_at: string | null;
    practice_source_status: string;
    practice_source_text: string | null;
    practice_source_version: number;
    practice_source_hash: string | null;
    practice_source_confirmed_at: string | null;
  } | null = null;
  if (body.captureId) {
    const { data: ownedCapture, error: captureErr } = await supabase
      .from("captures")
      .select("id, kind, class_id, client_class_id, assignment_id, exam_id, raw_text, processing_status, concept_extraction_claim_id, concept_extraction_started_at, practice_source_status, practice_source_text, practice_source_version, practice_source_hash, practice_source_confirmed_at")
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (captureErr) return json({ error: "capture lookup failed" }, 500);
    if (!ownedCapture) return json({ error: "capture not found" }, 404);
    capture = ownedCapture;
  }

  if (!capture && body.kind === "scan-assignment") {
    return json({
      error: "assignment_confirmation_required",
      message: "An assignment capture must be saved before its problem can be reviewed.",
    }, 409);
  }

  // Resolve the stable client class to its owned UUID before any worker claim
  // or concept insert. The provenance trigger requires capture and concept
  // boundaries to match at the instant evidence is mirrored.
  let resolvedClassId = capture?.class_id ?? body.classId ?? null;
  let resolvedClientClassId = capture?.client_class_id ?? body.clientClassId ?? null;
  if (resolvedClassId || resolvedClientClassId) {
    let ownedClassQuery = supabase
      .from("classes")
      .select("id, client_class_id")
      .eq("user_id", userId)
      .is("source_archived_at", null);
    if (resolvedClassId) ownedClassQuery = ownedClassQuery.eq("id", resolvedClassId);
    if (resolvedClientClassId) {
      ownedClassQuery = ownedClassQuery.eq("client_class_id", resolvedClientClassId);
    }
    const { data: ownedClass, error: classErr } = await ownedClassQuery.maybeSingle();
    if (classErr) return json({ error: "class lookup failed" }, 500);
    if (!ownedClass) return json({ error: "class not found" }, 404);
    resolvedClassId = ownedClass.id;
    resolvedClientClassId = ownedClass.client_class_id;
  }

  if (capture?.kind === "scan-assignment") {
    if (!capture.assignment_id || !resolvedClassId || !resolvedClientClassId) {
      return json({ error: "assignment boundary is incomplete" }, 409);
    }
    const { data: assignment, error: assignmentErr } = await supabase
      .from("assignments")
      .select("id, class_id, client_class_id")
      .eq("id", capture.assignment_id)
      .eq("user_id", userId)
      .is("source_archived_at", null)
      .maybeSingle();
    if (assignmentErr) return json({ error: "assignment lookup failed" }, 500);
    if (!assignment
        || assignment.class_id !== resolvedClassId
        || assignment.client_class_id !== resolvedClientClassId) {
      return json({ error: "assignment does not match this capture class" }, 409);
    }
  }

  const activeClaimStartedAt = capture?.concept_extraction_started_at
    ? Date.parse(capture.concept_extraction_started_at)
    : Number.NaN;

  // A typed assignment has no image worker, but its text is still untrusted
  // until the student reviews it. This branch may only update the capture's
  // versioned review fields; it exits before every concept/mastery/evidence
  // path below. The confirmation RPC performs the canonical binding later.
  if (capture?.kind === "scan-assignment") {
    const expectedPracticeSourceVersion = Number.isInteger(capture.practice_source_version)
        && capture.practice_source_version >= 0
      ? capture.practice_source_version
      : 0;
    if (capture.practice_source_status === "confirmed") {
      return json({
        ok: true,
        reused: true,
        concepts: [],
        practiceSourceStatus: "confirmed",
        practiceSourceText: capture.practice_source_text,
        practiceSourceVersion: expectedPracticeSourceVersion,
        practiceSourceHash: capture.practice_source_hash,
        practiceSourceConfirmedAt: capture.practice_source_confirmed_at,
      });
    }
    if (capture.concept_extraction_claim_id
        && Number.isFinite(activeClaimStartedAt)
        && activeClaimStartedAt > Date.now() - EXTRACTION_CLAIM_MS) {
      return json({
        ok: true,
        processing: true,
        message: "Campus Brain is already preparing this problem for review.",
      });
    }

    const sourceText = (capture.raw_text ?? "").trim();
    const reviewCandidate = sourceText
        && sourceText.length <= MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS
      ? sourceText
      : null;
    const claimId = crypto.randomUUID();
    const staleBefore = new Date(Date.now() - EXTRACTION_CLAIM_MS).toISOString();
    const claimFields = "id, processing_status, concept_extraction_claim_id, practice_source_status, practice_source_version";
    const { data: claimed, error: claimErr } = await adminClient
      .from("captures")
      .update({
        processing_status: "processing",
        class_id: resolvedClassId,
        client_class_id: resolvedClientClassId,
        concept_extraction_claim_id: claimId,
        concept_extraction_started_at: new Date().toISOString(),
        practice_source_status: "processing",
        practice_source_text: null,
        practice_source_hash: null,
        practice_source_confirmed_at: null,
        practice_concept_id: null,
      })
      .eq("id", capture.id)
      .eq("user_id", userId)
      .eq("practice_source_version", expectedPracticeSourceVersion)
      .neq("practice_source_status", "confirmed")
      .or(`concept_extraction_claim_id.is.null,concept_extraction_started_at.lt.${staleBefore}`)
      .select(claimFields)
      .maybeSingle();
    if (claimErr) return json({ error: "assignment review claim failed" }, 500);
    if (!claimed
        || claimed.processing_status !== "processing"
        || claimed.concept_extraction_claim_id !== claimId
        || claimed.practice_source_status !== "processing"
        || claimed.practice_source_version !== expectedPracticeSourceVersion) {
      return json({
        ok: true,
        processing: true,
        message: "This assignment changed while its problem was being prepared.",
      });
    }

    const nextPracticeSourceVersion = expectedPracticeSourceVersion + 1;
    const { data: completed, error: completeErr } = await adminClient
      .from("captures")
      .update({
        processing_status: "ready",
        concept_extraction_claim_id: null,
        concept_extraction_started_at: null,
        practice_source_status: "needs_review",
        practice_source_text: reviewCandidate,
        practice_source_version: nextPracticeSourceVersion,
        practice_source_hash: null,
        practice_source_confirmed_at: null,
        practice_concept_id: null,
      })
      .eq("id", capture.id)
      .eq("user_id", userId)
      .eq("concept_extraction_claim_id", claimId)
      .eq("practice_source_status", "processing")
      .eq("practice_source_version", expectedPracticeSourceVersion)
      .select("id, processing_status, concept_extraction_claim_id, practice_source_status, practice_source_text, practice_source_version")
      .maybeSingle();
    if (completeErr) {
      await adminClient
        .from("captures")
        .update({
          processing_status: "failed",
          concept_extraction_claim_id: null,
          concept_extraction_started_at: null,
        })
        .eq("id", capture.id)
        .eq("user_id", userId)
        .eq("concept_extraction_claim_id", claimId)
        .eq("practice_source_version", expectedPracticeSourceVersion);
      return json({ error: "assignment review could not be saved" }, 500);
    }
    if (!completed
        || completed.processing_status !== "ready"
        || completed.concept_extraction_claim_id !== null
        || completed.practice_source_status !== "needs_review"
        || completed.practice_source_text !== reviewCandidate
        || completed.practice_source_version !== nextPracticeSourceVersion) {
      return json({
        ok: true,
        processing: true,
        message: "This assignment changed while its problem was being prepared.",
      });
    }

    return json({
      ok: true,
      concepts: [],
      practiceSourceStatus: "needs_review",
      practiceSourceText: reviewCandidate,
      practiceSourceVersion: nextPracticeSourceVersion,
    });
  }

  if (capture?.concept_extraction_claim_id
      && Number.isFinite(activeClaimStartedAt)
      && activeClaimStartedAt > Date.now() - EXTRACTION_CLAIM_MS) {
    return json({
      ok: true,
      processing: true,
      message: "Campus Brain is already processing this capture.",
    });
  }

  const rawText = (capture?.raw_text ?? body.rawText ?? "").trim();
  if (!rawText) return json({ error: "rawText required" }, 400);
  if (rawText.length > MAX_RAW_TEXT_CHARS) {
    return json({ error: "Capture text is too large to process safely" }, 413);
  }
  if (!assessSourceSufficiency(rawText).sufficient) {
    return insufficientSource();
  }
  const exactThinSource = extractExactThinSource(
    rawText,
    body.kind === "professor-hint",
  );
  const assignmentProblemSource = exactThinSource
    ? null
    : extractAssignmentTutorSource(rawText, body.kind === "professor-hint");
  const deterministicSource = exactThinSource ?? assignmentProblemSource;

  // If a previous request inserted the concepts but its response or final
  // status update was lost, repair the remaining derived rows and return the
  // original concepts. Never ask the AI to create a second set.
  if (body.captureId) {
    const { data: recoveryEvidence, error: recoveryEvidenceErr } = await supabase
      .from("concept_capture_evidence")
      .select("concept_id")
      .eq("user_id", userId)
      .eq("capture_id", body.captureId);
    if (recoveryEvidenceErr) {
      return json({ error: "existing concept evidence lookup failed" }, 500);
    }
    const recoveryIds = [...new Set((recoveryEvidence ?? []).map((row) => row.concept_id as string))];
    let existingQuery = supabase
      .from("concepts")
      .select("id, class_id, name, definition, examples, professor_emphasis")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    // Transitional primary-source fallback repairs requests interrupted before
    // the evidence link was written. Stable concepts merged from another
    // capture are recovered through the authoritative evidence rows above.
    existingQuery = recoveryIds.length
      ? existingQuery.in("id", recoveryIds)
      : existingQuery.eq("capture_id", body.captureId);
    const { data: existingConcepts, error: existingErr } = await existingQuery;
    if (existingErr) return json({ error: "existing concepts lookup failed" }, 500);
    if (existingConcepts?.length) {
      const existingClassIds = [...new Set(
        existingConcepts
          .map((concept) => concept.class_id as string | null)
          .filter((classId): classId is string => Boolean(classId)),
      )];
      if (resolvedClassId && existingClassIds.some((classId) => classId !== resolvedClassId)) {
        return json({ error: "existing concepts do not match the capture class" }, 409);
      }
      if (existingClassIds.length) {
        const { data: ownedExistingClasses, error: existingClassErr } = await supabase
          .from("classes")
          .select("id")
          .eq("user_id", userId)
          .in("id", existingClassIds);
        if (existingClassErr) {
          return json({ error: "existing concept class lookup failed" }, 500);
        }
        if ((ownedExistingClasses ?? []).length !== existingClassIds.length) {
          return json({ error: "existing concepts contain an invalid class" }, 409);
        }
      }

      // Recovery is a write path too. Take a fresh opaque lease before
      // repairing provenance or reactivating concepts so two retrying tabs
      // cannot both publish derived state from the same capture.
      const recoveryClaimId = crypto.randomUUID();
      const recoveryStaleBefore = new Date(Date.now() - EXTRACTION_CLAIM_MS).toISOString();
      const { data: recoveryClaim, error: recoveryClaimErr } = await adminClient
        .from("captures")
        .update({
          processing_status: "processing",
          class_id: resolvedClassId,
          client_class_id: resolvedClientClassId,
          concept_extraction_claim_id: recoveryClaimId,
          concept_extraction_started_at: new Date().toISOString(),
        })
        .eq("id", body.captureId)
        .eq("user_id", userId)
        .or(`concept_extraction_claim_id.is.null,concept_extraction_started_at.lt.${recoveryStaleBefore}`)
        .select("id")
        .maybeSingle();
      if (recoveryClaimErr) {
        return json({ error: "capture recovery claim failed" }, 500);
      }
      if (!recoveryClaim) {
        return json({ ok: true, processing: true, message: "Campus Brain is already recovering this capture." });
      }
      const failRecoveryClaim = async () => {
        await adminClient
          .from("captures")
          .update({
            processing_status: "failed",
            concept_extraction_claim_id: null,
            concept_extraction_started_at: null,
          })
          .eq("id", body.captureId!)
          .eq("user_id", userId)
          .eq("concept_extraction_claim_id", recoveryClaimId);
      };

      const existingIds = existingConcepts.map((concept) => concept.id as string);
      const { error: evidenceRepairErr } = await adminClient
        .from("concept_capture_evidence")
        .upsert(existingIds.map((conceptId) => ({
          user_id: userId,
          concept_id: conceptId,
          capture_id: body.captureId!,
        })), { onConflict: "user_id,concept_id,capture_id", ignoreDuplicates: true });
      if (evidenceRepairErr) {
        await failRecoveryClaim();
        return json({ error: "concept source evidence could not be repaired" }, 500);
      }

      const { data: renewedRecovery, error: renewedRecoveryErr } = await adminClient
        .from("captures")
        .update({ concept_extraction_started_at: new Date().toISOString() })
        .eq("id", body.captureId)
        .eq("user_id", userId)
        .eq("concept_extraction_claim_id", recoveryClaimId)
        .select("id")
        .maybeSingle();
      if (renewedRecoveryErr) {
        await failRecoveryClaim();
        return json({ error: "capture recovery lease failed" }, 500);
      }
      if (!renewedRecovery) {
        return json({ ok: true, processing: true, message: "This capture changed while it was being recovered." });
      }

      const { error: reactivateErr } = await adminClient
        .from("concepts")
        .update({ retired_at: null })
        .eq("user_id", userId)
        .in("id", existingIds);
      if (reactivateErr) {
        await failRecoveryClaim();
        return json({ error: "concept recovery reactivation failed" }, 500);
      }

      const { data: masteryRows, error: masteryLookupErr } = await adminClient
        .from("user_concept_mastery")
        .select("concept_id")
        .eq("user_id", userId)
        .in("concept_id", existingIds);
      if (masteryLookupErr) {
        await failRecoveryClaim();
        return json({ error: "mastery recovery lookup failed" }, 500);
      }
      const mastered = new Set((masteryRows ?? []).map((row) => row.concept_id as string));
      const missingMastery = existingConcepts
        .filter((concept) => !mastered.has(concept.id as string))
        .map((concept) => ({
          user_id: userId,
          concept_id: concept.id,
          class_id: resolvedClassId ?? concept.class_id,
          strength: 0.15,
          attempts: 0,
          correct: 0,
          last_seen_at: new Date().toISOString(),
          next_review_at: new Date().toISOString(),
          streak: 0,
        }));
      if (missingMastery.length) {
        const { error: recoveryErr } = await adminClient
          .from("user_concept_mastery")
          .upsert(missingMastery, {
            onConflict: "user_id,concept_id",
            ignoreDuplicates: true,
          });
        if (recoveryErr) {
          await failRecoveryClaim();
          return json({ error: "mastery recovery failed" }, 500);
        }
      }

      const { data: processedRows, error: processedLookupErr } = await supabase
        .from("processed_content")
        .select("summary")
        .eq("user_id", userId)
        .eq("capture_id", body.captureId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (processedLookupErr) {
        await failRecoveryClaim();
        return json({ error: "processed content recovery lookup failed" }, 500);
      }
      const recoveredSummary = processedRows?.[0]?.summary
        ?? existingConcepts
          .map((concept) => concept.definition)
          .filter((definition): definition is string => !!definition)
          .slice(0, 2)
          .join(" ");
      if (!processedRows?.length) {
        const { error: processedRecoveryErr } = await supabase.from("processed_content").insert({
          capture_id: body.captureId,
          user_id: userId,
          summary: recoveredSummary,
          key_concepts: existingConcepts.map((concept) => concept.name),
          transcript: body.kind === "record-lecture" ? rawText : null,
          ocr_text: (body.kind === "scan-board" || body.kind === "scan-textbook") ? rawText : null,
          model: "google/gemini-2.5-flash",
        });
        if (processedRecoveryErr) {
          await failRecoveryClaim();
          return json({ error: "processed content recovery failed" }, 500);
        }
      }

      const captureRecoveryQuery = adminClient
        .from("captures")
        .update({
          processing_status: "ready",
          flashcards_ready: false,
          class_id: resolvedClassId,
          client_class_id: resolvedClientClassId,
          concept_extraction_claim_id: null,
          concept_extraction_started_at: null,
        })
        .eq("id", body.captureId)
        .eq("user_id", userId)
        .eq("concept_extraction_claim_id", recoveryClaimId);
      const { data: recoveredCapture, error: captureRecoveryErr } = await captureRecoveryQuery
        .select("id")
        .maybeSingle();
      if (captureRecoveryErr) {
        await failRecoveryClaim();
        return json({ error: "capture recovery failed" }, 500);
      }
      if (!recoveredCapture) {
        return json({ ok: true, processing: true, message: "This capture changed while it was being recovered." });
      }

      return json({
        ok: true,
        reused: true,
        summary: recoveredSummary,
        concepts: existingConcepts.map((concept) => ({
          name: concept.name,
          definition: concept.definition,
          examples: concept.examples ?? [],
          professor_emphasis: !!concept.professor_emphasis,
        })),
        conceptIds: existingIds,
      });
    }
  }

  // Only one request may process and persist this capture at a time.
  // A stale claim can be recovered after five minutes.
  if (!deterministicSource && !key) return json({ error: "LOVABLE_API_KEY missing" }, 500);
  let claimId: string | null = null;
  if (body.captureId) {
    claimId = crypto.randomUUID();
    const staleBefore = new Date(Date.now() - EXTRACTION_CLAIM_MS).toISOString();
    const { data: claimedCapture, error: claimErr } = await adminClient
      .from("captures")
      .update({
        concept_extraction_claim_id: claimId,
        concept_extraction_started_at: new Date().toISOString(),
        processing_status: "processing",
        class_id: resolvedClassId,
        client_class_id: resolvedClientClassId,
      })
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .or(`concept_extraction_claim_id.is.null,concept_extraction_started_at.lt.${staleBefore}`)
      .select("id")
      .maybeSingle();
    if (claimErr) return json({ error: "extraction claim failed" }, 500);
    if (!claimedCapture) {
      return json({
        ok: true,
        processing: true,
        message: "Campus Brain is already processing this capture.",
      });
    }
  }

  const releaseClaimAsFailed = async () => {
    if (!body.captureId || !claimId) return;
    await adminClient
      .from("captures")
      .update({
        processing_status: "failed",
        concept_extraction_claim_id: null,
        concept_extraction_started_at: null,
      })
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .eq("concept_extraction_claim_id", claimId);
  };
  const renewOwnedClaim = async (): Promise<boolean> => {
    if (!body.captureId || !claimId) return true;
    const { data: renewed, error: renewErr } = await adminClient
      .from("captures")
      .update({ concept_extraction_started_at: new Date().toISOString() })
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .eq("concept_extraction_claim_id", claimId)
      .select("id")
      .maybeSingle();
    return !renewErr && !!renewed;
  };
  if (claimId) guard.release = releaseClaimAsFailed;

  const userPrompt = [
    body.className ? `Class: ${body.className}` : null,
    body.topic ? `Topic: ${body.topic}` : null,
    body.kind ? `Source kind: ${body.kind}` : null,
    "---",
    rawText.slice(0, 12000),
  ].filter(Boolean).join("\n");

  // 1. Extract concepts. Preserve simple numeric facts and supported percent
  // problems exactly; neither needs a paid language model to author math.
  let summary = deterministicSource?.summary ?? "";
  let concepts: ExtractedConcept[] = deterministicSource?.concepts ?? [];
  let paidAiPermit: PaidAiQuotaPermit | null = null;

  if (!deterministicSource) {
    let gatewayResult: PaidAiExecutionResult<Response>;
    try {
      gatewayResult = await executePaidAiRequest(
        (args) => adminClient.rpc("consume_ai_request_quota", args),
        {
          userId,
          functionPrefix: "extract-concepts",
          hourlyLimit: AI_HOURLY_LIMIT,
          dailyLimit: AI_DAILY_LIMIT,
        },
        () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key! },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: userPrompt },
            ],
          }),
        }),
      );
    } catch {
      await releaseClaimAsFailed();
      logPrivateFailure({ errorClass: "gateway_request_failed", status: 502, requestId });
      return json({ error: "extraction failed" }, 502);
    }
    if (gatewayResult.ok === false) {
      await releaseClaimAsFailed();
      if (gatewayResult.status === 503) {
        logPrivateFailure({ errorClass: "paid_ai_quota_failed", status: 503, requestId });
        return json({ error: "Service temporarily unavailable" }, 503);
      }
      return json({ error: "Concept extraction limit reached. Try again later." }, 429);
    }
    // One request budget covers concept extraction and its optional embedding
    // call. The permit remains mandatory below so embeddings cannot bypass the
    // hour/day checks, while the same logical operation is not charged twice.
    paidAiPermit = gatewayResult.permit;
    const gwRes = gatewayResult.value;
    if (!gwRes.ok) {
      logPrivateFailure({ errorClass: "gateway_response_failed", status: 502, requestId });
      await releaseClaimAsFailed();
      return json({ error: "extraction failed" }, 502);
    }
    let gw: { choices?: Array<{ message?: { content?: string } }> };
    try {
      gw = await gwRes.json();
    } catch {
      await releaseClaimAsFailed();
      return json({ error: "extraction returned invalid JSON" }, 502);
    }
    let parsed: { summary?: string; concepts?: ExtractedConcept[] } = {};
    try { parsed = JSON.parse(gw?.choices?.[0]?.message?.content ?? "{}"); } catch { /* fallthrough */ }
    summary = parsed.summary ?? "";
    concepts = Array.isArray(parsed.concepts) ? parsed.concepts.slice(0, 8) : [];
  }

  // Schedule lines ("Test Friday", "Homework is due Monday") are planning
  // info, not knowledge — they can never be a concept definition or an
  // answer key, so drop them before they reach permanent memory.
  concepts = concepts.filter((concept) =>
    !isLogisticsLine(concept.name ?? "") &&
    !(concept.definition && isLogisticsLine(concept.definition))
  );

  if (!concepts.length) {
    await releaseClaimAsFailed();
    return insufficientSource();
  }

  // 2. Embed each concept name+definition
  const texts = concepts.map((c) => `${c.name}. ${c.definition ?? ""}`.trim());
  let embeddings: number[][] = [];
  if (texts.length && !deterministicSource) {
    if (paidAiPermit?.granted) {
      try {
        const emRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key! },
          body: JSON.stringify({ model: "openai/text-embedding-3-small", input: texts }),
        });
        if (emRes.ok) {
          const em = await emRes.json();
          embeddings = (em?.data ?? []).map((d: { embedding: number[] }) => d.embedding);
        }
      } catch {
        // Embeddings improve retrieval but are not required to preserve a
        // student's capture or build its first study set.
      }
    }
  }

  // 3. Deduplicate against permanent memory, then upsert concepts + mastery.
  //
  // Re-photographing the same page, or a textbook example and an assignment
  // question about the same idea, must reinforce ONE concept rather than
  // multiplying near-identical rows and splitting mastery across them.
  const nowIso = new Date().toISOString();

  let existingClassConcepts: ExistingConcept[] = [];
  if (resolvedClassId || resolvedClientClassId) {
    let existingQuery = adminClient
      .from("concepts")
      .select("id, name, definition, professor_emphasis")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (resolvedClassId) existingQuery = existingQuery.eq("class_id", resolvedClassId);
    else existingQuery = existingQuery.eq("client_class_id", resolvedClientClassId!);
    const { data: existingRows, error: existingClassErr } = await existingQuery;
    if (existingClassErr) {
      await releaseClaimAsFailed();
      return json({ error: "concept dedupe lookup failed" }, 500);
    }
    existingClassConcepts = (existingRows ?? []) as ExistingConcept[];
  }

  const isHint = body.kind === "professor-hint";
  const indexed = concepts.map((concept, index) => ({ ...concept, __index: index }));
  const dedupe = dedupeConceptCandidates(
    indexed.map((concept) => ({
      ...concept,
      professor_emphasis: !!concept.professor_emphasis || isHint,
    })),
    existingClassConcepts,
  );

  if (!await renewOwnedClaim()) {
    return json({ ok: true, processing: true, message: "This capture changed while it was being processed." });
  }

  const conceptRows = dedupe.fresh.map((c) => ({
    user_id: userId,
    class_id: resolvedClassId,
    client_class_id: resolvedClientClassId,
    capture_id: body.captureId ?? null,
    name: c.name,
    identity_key: conceptCanonicalKey(c.name, c.definition),
    slug: slugify(c.name),
    definition: c.definition ?? null,
    examples: c.examples ?? [],
    professor_emphasis: !!c.professor_emphasis,
    embedding: embeddings[c.__index] ? (embeddings[c.__index] as unknown as string) : null,
    source_kind: body.kind ?? null,
    // A capture-backed concept becomes current only after its evidence link is
    // durable and the worker proves it still owns the extraction lease.
    retired_at: body.captureId ? nowIso : null,
  }));

  type ResolvedConcept = {
    id: string;
    class_id: string | null;
    name: string;
    identity_key: string | null;
  };
  const canonicalIdentityKeys = [...new Set(
    conceptRows.map((row) => row.identity_key),
  )];
  let canonicalRows: ResolvedConcept[] = [];
  if (conceptRows.length) {
    // The database identity index is the final concurrency boundary. Two
    // workers can both miss the same concept during the lookup above, so use
    // INSERT ... ON CONFLICT DO NOTHING and then resolve the canonical row.
    // Never update the winner's trusted name, definition, examples, or source.
    const { error: insErr } = await adminClient
      .from("concepts")
      .upsert(conceptRows, {
        onConflict: "user_id,class_id,identity_key",
        ignoreDuplicates: true,
      });
    if (insErr) {
      await releaseClaimAsFailed();
      return json({ error: "concepts insert failed" }, 500);
    }
    if (!await renewOwnedClaim()) {
      return json({ ok: true, processing: true, message: "This capture changed while it was being processed." });
    }

    let canonicalQuery = adminClient
      .from("concepts")
      .select("id, class_id, name, identity_key")
      .eq("user_id", userId)
      .in("identity_key", canonicalIdentityKeys)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (resolvedClassId) canonicalQuery = canonicalQuery.eq("class_id", resolvedClassId);
    else if (resolvedClientClassId) {
      canonicalQuery = canonicalQuery.eq("client_class_id", resolvedClientClassId);
    } else {
      canonicalQuery = canonicalQuery.is("class_id", null).is("client_class_id", null);
    }
    const { data: canonicalData, error: canonicalErr } = await canonicalQuery;
    if (canonicalErr) {
      await releaseClaimAsFailed();
      return json({ error: "canonical concept lookup failed" }, 500);
    }
    const canonicalByKey = new Map<string, ResolvedConcept>();
    for (const row of (canonicalData ?? []) as ResolvedConcept[]) {
      if (row.identity_key && !canonicalByKey.has(row.identity_key)) {
        canonicalByKey.set(row.identity_key, row);
      }
    }
    if (canonicalIdentityKeys.some((key) => !canonicalByKey.has(key))) {
      await releaseClaimAsFailed();
      return json({ error: "canonical concept could not be resolved" }, 500);
    }
    canonicalRows = canonicalIdentityKeys.map((key) => canonicalByKey.get(key)!);
  }

  const mergedRows: ResolvedConcept[] = dedupe.merged.map((entry) => ({
    id: entry.conceptId,
    class_id: resolvedClassId,
    name: entry.candidate.name,
    identity_key: entry.key,
  }));
  const resolvedConcepts = [...new Map(
    [...mergedRows, ...canonicalRows].map((row) => [row.id, row] as const),
  ).values()];
  const resolvedConceptIds = resolvedConcepts.map((row) => row.id);
  if (!resolvedConceptIds.length) {
    await releaseClaimAsFailed();
    return json({ error: "canonical concept could not be resolved" }, 500);
  }

  // A teacher hint raises IMPORTANCE, never mastery. Include a canonical row
  // won by another concurrent worker, but never overwrite its stable content.
  const emphasisedFreshKeys = new Set(
    dedupe.fresh
      .filter((concept) => !!concept.professor_emphasis)
      .map((concept) => conceptCanonicalKey(concept.name, concept.definition)),
  );
  const emphasisIds = [...new Set([
    ...dedupe.emphasiseConceptIds,
    ...canonicalRows
      .filter((row) => row.identity_key && emphasisedFreshKeys.has(row.identity_key))
      .map((row) => row.id),
  ])];
  if (emphasisIds.length) {
    if (!await renewOwnedClaim()) {
      return json({ ok: true, processing: true, message: "This capture changed while it was being processed." });
    }
    const { error: emphasisErr } = await adminClient
      .from("concepts")
      .update({ professor_emphasis: true })
      .eq("user_id", userId)
      .in("id", emphasisIds);
    if (emphasisErr) {
      await releaseClaimAsFailed();
      return json({ error: "concept emphasis update failed" }, 500);
    }
  }

  // Seed every resolved canonical concept only when mastery is absent. Losing
  // an insert race must never reset progress already earned on the winner.
  if (resolvedConcepts.length) {
    if (!await renewOwnedClaim()) {
      return json({ ok: true, processing: true, message: "This capture changed while it was being processed." });
    }
    const { error: masteryErr } = await adminClient
      .from("user_concept_mastery")
      .upsert(
        resolvedConcepts.map((concept) => ({
          user_id: userId,
          concept_id: concept.id,
          class_id: concept.class_id,
          strength: 0.15,
          attempts: 0,
          correct: 0,
          last_seen_at: nowIso,
          next_review_at: nowIso,
          streak: 0,
        })),
        { onConflict: "user_id,concept_id", ignoreDuplicates: true },
      );
    if (masteryErr) {
      await releaseClaimAsFailed();
      return json({ error: "mastery seed failed" }, 500);
    }
  }

  if (body.captureId && resolvedConceptIds.length) {
    const { error: evidenceErr } = await adminClient
      .from("concept_capture_evidence")
      .upsert(
        resolvedConceptIds.map((conceptId) => ({
          user_id: userId,
          concept_id: conceptId,
          capture_id: body.captureId!,
        })),
        { onConflict: "user_id,concept_id,capture_id", ignoreDuplicates: true },
      );
    if (evidenceErr) {
      await releaseClaimAsFailed();
      return json({ error: "concept source evidence could not be saved" }, 500);
    }

    if (!await renewOwnedClaim()) {
      return json({ ok: true, processing: true, message: "This capture changed while it was being processed." });
    }

    const { error: reactivateErr } = await adminClient
      .from("concepts")
      .update({ retired_at: null })
      .eq("user_id", userId)
      .in("id", resolvedConceptIds);
    if (reactivateErr) {
      await releaseClaimAsFailed();
      return json({ error: "concept activation failed" }, 500);
    }
  }


  // 4. Persist processed_content row (summary + key_concepts strings)
  if (body.captureId) {
    const { error: processedErr } = await supabase.from("processed_content").insert({
      capture_id: body.captureId,
      user_id: userId,
      summary,
      key_concepts: concepts.map((c) => c.name),
      transcript: body.kind === "record-lecture" ? rawText : null,
      ocr_text: (body.kind === "scan-board" || body.kind === "scan-textbook") ? rawText : null,
      model: exactThinSource
        ? "deterministic-exact-thin-v1"
        : assignmentProblemSource
          ? "deterministic-assignment-problem-v1"
          : "google/gemini-2.5-flash",
    });
    if (processedErr) {
      await releaseClaimAsFailed();
      return json({ error: "processed content insert failed" }, 500);
    }
    const { data: readyCapture, error: readyErr } = await adminClient
      .from("captures")
      .update({
        processing_status: "ready",
        flashcards_ready: false,
        class_id: resolvedClassId,
        client_class_id: resolvedClientClassId,
        concept_extraction_claim_id: null,
        concept_extraction_started_at: null,
      })
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .eq("concept_extraction_claim_id", claimId)
      .select("id")
      .maybeSingle();
    if (readyErr) {
      await releaseClaimAsFailed();
      return json({ error: "capture completion failed" }, 500);
    }
    if (!readyCapture) {
      return json({ ok: true, processing: true, message: "This capture changed while it was being completed." });
    }
  }

  return json({ ok: true, summary, concepts, conceptIds: resolvedConceptIds });
}

function insufficientSource() {
  return json({
    error: "insufficient_source",
    message: "Add a definition, example, equation, class fact, or professor hint before building study questions.",
  }, 422);
}

function json(body: unknown, status = 200) {
  return privateJsonResponse(body, status, corsHeaders);
}
