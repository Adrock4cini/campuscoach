// Read private Assignment / Notes images once, extract grounded source text and
// concepts in one vision request, then persist them to the existing learning
// pipeline. Originals never leave the student's private storage boundary
// except for the authenticated, short-lived AI processing request.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildAssignmentTutorPractice, extractAssignmentTutorSource } from "../_shared/assignment-tutor.ts";
import {
  checkStudyWritesPaused,
  STUDY_WRITES_PAUSED_RESPONSE,
} from "../_shared/study-write-pause.ts";
import {
  conceptCanonicalKey,
  dedupeConceptCandidates,
  type ExistingConcept,
} from "../_shared/concept-identity.ts";
import {
  executePaidAiRequest,
  type PaidAiExecutionResult,
} from "../_shared/paid-ai-quota.ts";
import {
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";

interface Body {
  captureId?: string;
  materialIds?: string[];
}

interface ExtractedConcept {
  name: string;
  definition?: string | null;
  examples?: string[];
  professor_emphasis?: boolean;
}

interface VisionResult {
  sourceText?: string;
  tutorProblemText?: string | null;
  summary?: string;
  concepts?: ExtractedConcept[];
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 8_000_000;
const MAX_TOTAL_BYTES = 24_000_000;
const CLAIM_MS = 5 * 60 * 1000;
const AI_HOURLY_LIMIT = 24;
const AI_DAILY_LIMIT = 96;
const ALLOWED_KINDS = new Set(["scan-assignment", "scan-material"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const SYSTEM = `You read photos of a student's class assignment, notes, handout, study cards, or textbook.

Return ONLY JSON matching:
{
  "sourceText": string,
  "tutorProblemText": string|null,
  "summary": string,
  "concepts": [
    {
      "name": string,
      "definition": string|null,
      "examples": string[],
      "professor_emphasis": boolean
    }
  ]
}

Rules:
- Transcribe all legible academic content into sourceText. Preserve equations, problem numbers, headings, and instructions.
- For an assignment, tutorProblemText is the exact text of ONE problem the student appears to want help with, without its answer. Use null when there are several equally likely problems or any symbol is unclear.
- Extract 1-8 concrete skills, concepts, formulas, problem types, or facts supported by the images.
- For assignments, identify what the student must learn; do not merely provide final answers and do not invent an answer key.
- Use short student-friendly definitions and examples grounded only in the pages.
- Set professor_emphasis=true only when a teacher or instructor explicitly marks the material as important.
- If an image is illegible or has no academic content, do not guess.
- No prose outside the JSON.`;

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "concept";

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
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !lovableKey) {
    logPrivateFailure({ errorClass: "required_environment_missing", status: 503, requestId });
    return json({ error: "Service unavailable" }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication required" }, 401);
  const userId = authData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
  try {
    parsedBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return json({ error: "JSON body must be an object" }, 400);
  }
  const body = parsedBody as Body;
  if (!body.captureId || !Array.isArray(body.materialIds)) {
    return json({ error: "captureId and materialIds are required" }, 400);
  }
  const materialIds = [...new Set(body.materialIds.filter((id) => typeof id === "string"))];
  if (materialIds.length < 1 || materialIds.length > MAX_FILES) {
    return json({ error: "Use between 1 and 4 images" }, 400);
  }

  const { data: capture, error: captureError } = await userClient
    .from("captures")
    .select("id, user_id, class_id, client_class_id, kind, topic, raw_text, assignment_id, exam_id, processing_status, concept_extraction_claim_id, concept_extraction_started_at, practice_source_status, practice_source_text, practice_source_version, practice_source_hash, practice_source_confirmed_at, practice_concept_id")
    .eq("id", body.captureId)
    .eq("user_id", userId)
    .maybeSingle();
  if (captureError) return json({ error: "Capture lookup failed" }, 500);
  if (!capture || !ALLOWED_KINDS.has(capture.kind)) return json({ error: "Capture not found" }, 404);
  if (!capture.client_class_id) return json({ error: "Capture must belong to a class" }, 400);

  const { data: ownedClass, error: classError } = await userClient
    .from("classes")
    .select("id, client_class_id")
    .eq("user_id", userId)
    .eq("client_class_id", capture.client_class_id)
    .is("source_archived_at", null)
    .maybeSingle();
  if (classError) return json({ error: "Class lookup failed" }, 500);
  if (!ownedClass) return json({ error: "Class not found" }, 404);

  const boundaryError = await validateLinkedTargets(userClient, {
    userId,
    clientClassId: capture.client_class_id,
    classId: ownedClass.id,
    assignmentId: capture.assignment_id,
    examId: capture.exam_id,
  });
  if (boundaryError) return json({ error: boundaryError }, 409);

  const activeClaimStartedAt = typeof capture.concept_extraction_started_at === "string"
    ? Date.parse(capture.concept_extraction_started_at)
    : Number.NaN;
  if (capture.concept_extraction_claim_id
      && Number.isFinite(activeClaimStartedAt)
      && activeClaimStartedAt > Date.now() - CLAIM_MS) {
    return json({
      ok: true,
      processing: true,
      message: "Campus Brain is already reading these pages.",
    });
  }

  const expectedPracticeSourceVersion = Number.isInteger(capture.practice_source_version)
      && capture.practice_source_version >= 0
    ? capture.practice_source_version
    : 0;
  const claimId = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - CLAIM_MS).toISOString();
  let claimAcquired = false;

  const claimSelect = "id, class_id, client_class_id, concept_extraction_claim_id, concept_extraction_started_at, processing_status, practice_source_status, practice_source_version";
  const ownsActiveClaim = (row: Record<string, unknown> | null) => !!row
    && row.concept_extraction_claim_id === claimId
    && row.class_id === ownedClass.id
    && row.client_class_id === ownedClass.client_class_id
    && row.processing_status === "processing"
    && row.practice_source_version === expectedPracticeSourceVersion
    && (capture.kind !== "scan-assignment" || row.practice_source_status === "processing");

  const acquireClaim = async () => {
    const claimUpdate: Record<string, unknown> = {
      concept_extraction_claim_id: claimId,
      concept_extraction_started_at: new Date().toISOString(),
      processing_status: "processing",
      // Establish the durable class boundary before this worker can write
      // concepts or provenance. Browser-created captures may initially carry
      // only the stable client class key.
      class_id: ownedClass.id,
      client_class_id: ownedClass.client_class_id,
    };
    if (capture.kind === "scan-assignment") {
      claimUpdate.practice_source_status = "processing";
      claimUpdate.practice_source_text = null;
      claimUpdate.practice_source_hash = null;
      claimUpdate.practice_source_confirmed_at = null;
      claimUpdate.practice_concept_id = null;
    }
    let query = adminClient
      .from("captures")
      .update(claimUpdate)
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .eq("practice_source_version", expectedPracticeSourceVersion)
      .or(`concept_extraction_claim_id.is.null,concept_extraction_started_at.lt.${staleBefore}`);
    if (capture.kind === "scan-assignment") {
      query = query.neq("practice_source_status", "confirmed");
    }
    const { data, error } = await query.select(claimSelect).maybeSingle();
    const claimed = ownsActiveClaim(data as Record<string, unknown> | null);
    claimAcquired = claimed;
    return { claimed, error };
  };

  // Every worker-side write is fenced by both the opaque claim and the
  // practice-source version. Updating the lease and selecting the row makes a
  // superseded worker observable before it can create derived learning data.
  const updateOwnedClaim = async (update: Record<string, unknown>) => {
    let query = adminClient
      .from("captures")
      .update(update)
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .eq("concept_extraction_claim_id", claimId)
      .eq("practice_source_version", expectedPracticeSourceVersion);
    if (capture.kind === "scan-assignment") {
      query = query.eq("practice_source_status", "processing");
    }
    return await query.select(claimSelect).maybeSingle();
  };

  const renewClaim = async () => {
    const result = await updateOwnedClaim({
      concept_extraction_started_at: new Date().toISOString(),
    });
    return {
      active: !result.error && ownsActiveClaim(result.data as Record<string, unknown> | null),
      error: result.error,
    };
  };

  const failClaim = async () => {
    if (!claimAcquired) return false;
    const { data, error } = await updateOwnedClaim({
      processing_status: "failed",
      concept_extraction_claim_id: null,
      concept_extraction_started_at: null,
    });
    return !error && !!data;
  };

  const changedWhileProcessing = () => json({
    ok: true,
    processing: true,
    message: "This capture changed while Campus Brain was reading it.",
  });

  // A confirmed assignment is immutable input for Tutor. Reprocessing must
  // not clear or re-extract that student-confirmed source.
  if (capture.kind === "scan-assignment" && capture.practice_source_status === "confirmed") {
    return json({
      ok: true,
      reused: true,
      concepts: capture.practice_concept_id
        ? [{ id: capture.practice_concept_id, name: "Assignment problem" }]
        : [],
      practiceSourceStatus: "confirmed",
      practiceSourceText: capture.practice_source_text,
      practiceSourceVersion: expectedPracticeSourceVersion,
      practiceSourceHash: capture.practice_source_hash,
      practiceSourceConfirmedAt: capture.practice_source_confirmed_at,
    });
  }

  // Only study material may recover durable concepts here. Assignment OCR is
  // a review candidate, never concept/mastery evidence until confirmation.
  if (capture.kind === "scan-material") {
    const { data: recoveryEvidence, error: recoveryEvidenceError } = await userClient
      .from("concept_capture_evidence")
      .select("concept_id")
      .eq("user_id", userId)
      .eq("capture_id", body.captureId);
    if (recoveryEvidenceError) return json({ error: "Concept recovery lookup failed" }, 500);
    const recoveryIds = [...new Set((recoveryEvidence ?? []).map((row) => row.concept_id as string))];
    let existingQuery = userClient
      .from("concepts")
      .select("id, class_id, name, definition")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    // Transitional fallback repairs a primary concept inserted before the
    // evidence migration. Merged captures are recovered by the evidence path.
    existingQuery = recoveryIds.length
      ? existingQuery.in("id", recoveryIds)
      : existingQuery.eq("capture_id", body.captureId);
    const { data: existing, error: existingError } = await existingQuery;
    if (existingError) return json({ error: "Concept recovery lookup failed" }, 500);
    if (existing?.length) {
      if (existing.some((concept) => concept.class_id !== ownedClass.id)) {
        return json({ error: "Existing concepts do not match the capture class" }, 409);
      }
      const acquisition = await acquireClaim();
      if (acquisition.error) return json({ error: "Processing claim failed" }, 500);
      if (!acquisition.claimed) return changedWhileProcessing();

      const existingIds = existing.map((concept) => concept.id);
      const reactivationLease = await renewClaim();
      if (reactivationLease.error) {
        await failClaim();
        return json({ error: "Processing claim could not be verified" }, 500);
      }
      if (!reactivationLease.active) return changedWhileProcessing();
      const { error: reactivationError } = await adminClient
        .from("concepts")
        .update({ retired_at: null })
        .eq("user_id", userId)
        .in("id", existingIds);
      if (reactivationError) {
        await failClaim();
        return json({ error: "Concept memory could not be reactivated" }, 500);
      }
      const evidenceLease = await renewClaim();
      if (evidenceLease.error) {
        await failClaim();
        return json({ error: "Processing claim could not be verified" }, 500);
      }
      if (!evidenceLease.active) return changedWhileProcessing();
      const { error: evidenceRepairError } = await adminClient
        .from("concept_capture_evidence")
        .upsert(existingIds.map((conceptId) => ({
          user_id: userId,
          concept_id: conceptId,
          capture_id: body.captureId,
        })), { onConflict: "user_id,concept_id,capture_id", ignoreDuplicates: true });
      if (evidenceRepairError) {
        await failClaim();
        return json({ error: "Concept source evidence could not be repaired" }, 500);
      }
      const { data: masteryRows, error: masteryLookupError } = await adminClient
        .from("user_concept_mastery")
        .select("concept_id")
        .eq("user_id", userId)
        .in("concept_id", existingIds);
      if (masteryLookupError) {
        await failClaim();
        return json({ error: "Mastery recovery lookup failed" }, 500);
      }
      const mastered = new Set((masteryRows ?? []).map((row) => row.concept_id));
      const missingMastery = existing
        .filter((concept) => !mastered.has(concept.id))
        .map((concept) => ({
          user_id: userId,
          concept_id: concept.id,
          class_id: ownedClass.id,
          strength: 0.15,
          attempts: 0,
          correct: 0,
          last_seen_at: new Date().toISOString(),
          next_review_at: new Date().toISOString(),
          streak: 0,
        }));
      if (missingMastery.length) {
        const masteryLease = await renewClaim();
        if (masteryLease.error) {
          await failClaim();
          return json({ error: "Processing claim could not be verified" }, 500);
        }
        if (!masteryLease.active) return changedWhileProcessing();
        const { error: recoveryError } = await adminClient
          .from("user_concept_mastery")
          .upsert(missingMastery, {
            onConflict: "user_id,concept_id",
            ignoreDuplicates: true,
          });
        if (recoveryError) {
          await failClaim();
          return json({ error: "Mastery recovery failed" }, 500);
        }
      }

      const { data: processedRows, error: processedLookupError } = await userClient
        .from("processed_content")
        .select("id")
        .eq("user_id", userId)
        .eq("capture_id", body.captureId)
        .limit(1);
      if (processedLookupError) {
        await failClaim();
        return json({ error: "Source recovery lookup failed" }, 500);
      }
      if (!processedRows?.length) {
        const processedLease = await renewClaim();
        if (processedLease.error) {
          await failClaim();
          return json({ error: "Processing claim could not be verified" }, 500);
        }
        if (!processedLease.active) return changedWhileProcessing();
        const recoveredSummary = existing
          .map((concept) => concept.definition)
          .filter((definition): definition is string => !!definition)
          .slice(0, 2)
          .join(" ");
        const { error: processedRecoveryError } = await userClient
          .from("processed_content")
          .insert({
            capture_id: body.captureId,
            user_id: userId,
            summary: recoveredSummary,
            key_concepts: existing.map((concept) => concept.name),
            ocr_text: capture.raw_text,
            model: "google/gemini-2.5-flash-vision",
          });
        if (processedRecoveryError) {
          await failClaim();
          return json({ error: "Source recovery failed" }, 500);
        }
      }

      const { data: recoveredCapture, error: recoveryReadyError } = await updateOwnedClaim({
        processing_status: "ready",
        concept_extraction_claim_id: null,
        concept_extraction_started_at: null,
      });
      if (recoveryReadyError) {
        await failClaim();
        return json({ error: "Capture recovery failed" }, 500);
      }
      if (!recoveredCapture) return changedWhileProcessing();
      return json({
        ok: true,
        reused: true,
        concepts: existing,
      });
    }
  }

  const { data: materials, error: materialsError } = await userClient
    .from("materials")
    .select("id, storage_path, mime_type, size_bytes, page_index")
    .eq("user_id", userId)
    .eq("capture_id", body.captureId)
    .in("id", materialIds)
    .order("page_index", { ascending: true });
  if (materialsError) return json({ error: "Image lookup failed" }, 500);
  if (!materials || materials.length !== materialIds.length) {
    return json({ error: "One or more images do not belong to this capture" }, 409);
  }
  let totalBytes = 0;
  for (const material of materials) {
    const mime = (material.mime_type ?? "").toLowerCase();
    const size = material.size_bytes ?? 0;
    totalBytes += size;
    if (
      !material.storage_path
      || material.storage_path.split("/")[0] !== userId
      || !ALLOWED_MIME.has(mime)
      || size < 1
      || size > MAX_FILE_BYTES
    ) {
      return json({ error: "Invalid private image" }, 400);
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) return json({ error: "Capture exceeds the 24 MB limit" }, 413);

  const acquisition = await acquireClaim();
  if (acquisition.error) return json({ error: "Processing claim failed" }, 500);
  if (!acquisition.claimed) {
    return json({ ok: true, processing: true, message: "Campus Brain is already reading these pages." });
  }

  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: [
      `Source type: ${capture.kind === "scan-assignment" ? "assignment" : "notes or book"}`,
      capture.topic ? `Student topic: ${capture.topic}` : null,
      capture.exam_id ? "The student explicitly linked this source to an upcoming test." : null,
      "Read the pages in order and return the required JSON.",
    ].filter(Boolean).join("\n"),
  }];

  try {
    for (const material of materials) {
      const { data: imageBlob, error: downloadError } = await adminClient.storage
        .from("capture-sources")
        .download(material.storage_path!);
      if (downloadError || !imageBlob) throw downloadError ?? new Error("Private image download failed");
      const bytes = new Uint8Array(await imageBlob.arrayBuffer());
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${material.mime_type};base64,${bytesToBase64(bytes)}`,
        },
      });
    }
  } catch {
    logPrivateFailure({ errorClass: "private_image_download_failed", status: 502, requestId });
    await failClaim();
    return json({ error: "Private images could not be read" }, 502);
  }

  let gatewayResult: PaidAiExecutionResult<Response>;
  try {
    gatewayResult = await executePaidAiRequest(
      (args) => adminClient.rpc("consume_ai_request_quota", args),
      {
        userId,
        functionPrefix: "process-capture-images",
        hourlyLimit: AI_HOURLY_LIMIT,
        dailyLimit: AI_DAILY_LIMIT,
      },
      () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": lovableKey,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content },
          ],
        }),
      }),
    );
  } catch {
    logPrivateFailure({ errorClass: "gateway_request_failed", status: 502, requestId });
    await failClaim();
    return json({ error: "Campus Brain could not read these pages" }, 502);
  }
  if (gatewayResult.ok === false) {
    await failClaim();
    if (gatewayResult.status === 503) {
      logPrivateFailure({ errorClass: "paid_ai_quota_failed", status: 503, requestId });
      return json({ error: "Service temporarily unavailable" }, 503);
    }
    return json({ error: "Photo processing limit reached. Try again later." }, 429);
  }
  const gatewayResponse = gatewayResult.value;
  if (!gatewayResponse.ok) {
    logPrivateFailure({ errorClass: "gateway_response_failed", status: 502, requestId });
    await failClaim();
    return json({ error: "Campus Brain could not read these pages" }, 502);
  }

  let parsed: VisionResult = {};
  try {
    const gateway = await gatewayResponse.json();
    const raw = gateway?.choices?.[0]?.message?.content ?? "{}";
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    await failClaim();
    return json({ error: "Campus Brain returned an unreadable result" }, 502);
  }

  const sourceText = typeof parsed.sourceText === "string" ? parsed.sourceText.trim().slice(0, 50_000) : "";
  let summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 2_000) : "";
  let concepts = Array.isArray(parsed.concepts)
    ? parsed.concepts
      .filter((concept) => concept && typeof concept.name === "string" && concept.name.trim())
      .slice(0, 8)
    : [];
  const tutorCandidate = capture.kind === "scan-assignment"
    ? confirmedPracticeCandidate(parsed.tutorProblemText) ?? confirmedPracticeCandidate(sourceText)
    : null;
  const deterministicTutorSource = tutorCandidate
    ? extractAssignmentTutorSource(tutorCandidate)
    : null;
  if (deterministicTutorSource) {
    summary = deterministicTutorSource.summary;
    if (capture.kind !== "scan-assignment") concepts = deterministicTutorSource.concepts;
  }
  if (!sourceText || (capture.kind === "scan-material" && !concepts.length)) {
    // An unreadable attempt must not erase or replace the prior OCR evidence.
    await failClaim();
    return json({
      error: "No readable academic material was found. Try a clearer, closer photo.",
    }, 422);
  }

  if (capture.kind === "scan-assignment") {
    // OCR is evidence for the student's review, not durable learning evidence.
    // The confirmation RPC creates/binds the canonical concept atomically.
    const nextPracticeSourceVersion = expectedPracticeSourceVersion + 1;
    const { data: completed, error: completeError } = await updateOwnedClaim({
      raw_text: sourceText,
      processing_status: "ready",
      class_id: ownedClass.id,
      client_class_id: ownedClass.client_class_id,
      concept_extraction_claim_id: null,
      concept_extraction_started_at: null,
      practice_source_status: "needs_review",
      practice_source_text: tutorCandidate,
      practice_source_version: nextPracticeSourceVersion,
      practice_source_hash: null,
      practice_source_confirmed_at: null,
      practice_concept_id: null,
    });
    if (completeError) {
      await failClaim();
      return json({ error: "Capture completion failed" }, 500);
    }
    if (!completed
        || completed.processing_status !== "ready"
        || completed.practice_source_status !== "needs_review"
        || completed.practice_source_version !== nextPracticeSourceVersion
        || completed.concept_extraction_claim_id !== null) {
      return changedWhileProcessing();
    }
    return json({
      ok: true,
      summary,
      concepts: [],
      practiceSourceStatus: "needs_review",
      practiceSourceText: tutorCandidate,
      practiceSourceVersion: nextPracticeSourceVersion,
    });
  }

  const { data: sourceCapture, error: sourceTextError } = await updateOwnedClaim({
    raw_text: sourceText,
    concept_extraction_started_at: new Date().toISOString(),
  });
  if (sourceTextError) {
    await failClaim();
    return json({ error: "Source text could not be saved" }, 500);
  }
  if (!ownsActiveClaim(sourceCapture as Record<string, unknown> | null)) return changedWhileProcessing();

  const normalizedConcepts = concepts.map((concept) => ({
    ...concept,
    name: concept.name.trim().slice(0, 180),
    definition: typeof concept.definition === "string" ? concept.definition.slice(0, 2_000) : null,
    examples: Array.isArray(concept.examples)
      ? concept.examples.filter((value) => typeof value === "string").slice(0, 3)
      : [],
    professor_emphasis: !!concept.professor_emphasis,
  }));
  const { data: existingClassRows, error: existingClassError } = await adminClient
    .from("concepts")
    .select("id, name, definition, professor_emphasis")
    .eq("user_id", userId)
    .eq("class_id", ownedClass.id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (existingClassError) {
    await failClaim();
    return json({ error: "Concept memory could not be checked" }, 500);
  }
  const existingClassConcepts = (existingClassRows ?? []) as ExistingConcept[];
  const dedupe = dedupeConceptCandidates(normalizedConcepts, existingClassConcepts);
  const conceptRows = dedupe.fresh.map((concept) => ({
    user_id: userId,
    class_id: ownedClass.id,
    client_class_id: capture.client_class_id,
    capture_id: body.captureId,
    name: concept.name,
    identity_key: conceptCanonicalKey(concept.name, concept.definition),
    slug: slugify(concept.name),
    definition: concept.definition,
    examples: concept.examples,
    professor_emphasis: concept.professor_emphasis,
    embedding: null,
    source_kind: capture.kind,
    // Publish a concept only after this capture's durable evidence exists.
    // A worker that loses its lease leaves an inert row for a retry to adopt.
    retired_at: new Date().toISOString(),
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
    const conceptLease = await renewClaim();
    if (conceptLease.error) {
      await failClaim();
      return json({ error: "Processing claim could not be verified" }, 500);
    }
    if (!conceptLease.active) return changedWhileProcessing();
    // The unique identity index is the concurrency boundary. A competing
    // capture may have inserted the winner after our dedupe read, so ignore
    // only that conflict and resolve the canonical row in a separate read.
    // This deliberately never overwrites stable concept content.
    const { error: conceptError } = await adminClient
      .from("concepts")
      .upsert(conceptRows, {
        onConflict: "user_id,class_id,identity_key",
        ignoreDuplicates: true,
      });
    if (conceptError) {
      await failClaim();
      return json({ error: "Concepts could not be saved" }, 500);
    }

    const resolutionLease = await renewClaim();
    if (resolutionLease.error) {
      await failClaim();
      return json({ error: "Processing claim could not be verified" }, 500);
    }
    if (!resolutionLease.active) return changedWhileProcessing();
    const { data: canonicalData, error: canonicalError } = await adminClient
      .from("concepts")
      .select("id, class_id, name, identity_key")
      .eq("user_id", userId)
      .eq("class_id", ownedClass.id)
      .in("identity_key", canonicalIdentityKeys)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (canonicalError) {
      await failClaim();
      return json({ error: "Canonical concept memory could not be resolved" }, 500);
    }
    const canonicalByKey = new Map<string, ResolvedConcept>();
    for (const row of (canonicalData ?? []) as ResolvedConcept[]) {
      if (row.identity_key && !canonicalByKey.has(row.identity_key)) {
        canonicalByKey.set(row.identity_key, row);
      }
    }
    if (canonicalIdentityKeys.some((key) => !canonicalByKey.has(key))) {
      await failClaim();
      return json({ error: "Canonical concept memory could not be resolved" }, 500);
    }
    canonicalRows = canonicalIdentityKeys.map((key) => canonicalByKey.get(key)!);
  }
  const mergedRows: ResolvedConcept[] = dedupe.merged.map((entry) => ({
    id: entry.conceptId,
    class_id: ownedClass.id,
    name: entry.candidate.name,
    identity_key: entry.key,
  }));
  const resolvedConcepts = [...new Map(
    [...mergedRows, ...canonicalRows].map((row) => [row.id, row] as const),
  ).values()];
  const resolvedConceptIds = resolvedConcepts.map((concept) => concept.id);
  if (!resolvedConceptIds.length) {
    await failClaim();
    return json({ error: "Concepts could not be saved" }, 500);
  }

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
    const emphasisLease = await renewClaim();
    if (emphasisLease.error) {
      await failClaim();
      return json({ error: "Processing claim could not be verified" }, 500);
    }
    if (!emphasisLease.active) return changedWhileProcessing();
    const { error: emphasisError } = await adminClient
      .from("concepts")
      .update({ professor_emphasis: true })
      .eq("user_id", userId)
      .in("id", emphasisIds);
    if (emphasisError) {
      await failClaim();
      return json({ error: "Concept emphasis could not be saved" }, 500);
    }
  }
  const now = new Date().toISOString();
  const masterySeeds = resolvedConcepts.map((concept) => ({
      user_id: userId,
      concept_id: concept.id,
      class_id: concept.class_id,
      strength: 0.15,
      attempts: 0,
      correct: 0,
      last_seen_at: now,
      next_review_at: now,
      streak: 0,
    }));
  const masteryLease = await renewClaim();
  if (masteryLease.error) {
    await failClaim();
    return json({ error: "Processing claim could not be verified" }, 500);
  }
  if (!masteryLease.active) return changedWhileProcessing();
  const { error: masteryError } = await adminClient
    .from("user_concept_mastery")
    .upsert(masterySeeds, { onConflict: "user_id,concept_id", ignoreDuplicates: true });
  if (masteryError) {
    await failClaim();
    return json({ error: "Mastery memory could not be saved" }, 500);
  }

  const evidenceLease = await renewClaim();
  if (evidenceLease.error) {
    await failClaim();
    return json({ error: "Processing claim could not be verified" }, 500);
  }
  if (!evidenceLease.active) return changedWhileProcessing();
  const { error: evidenceError } = await adminClient
    .from("concept_capture_evidence")
    .upsert(resolvedConceptIds.map((conceptId) => ({
      user_id: userId,
      concept_id: conceptId,
      capture_id: body.captureId,
    })), { onConflict: "user_id,concept_id,capture_id", ignoreDuplicates: true });
  if (evidenceError) {
    await failClaim();
    return json({ error: "Concept source evidence could not be saved" }, 500);
  }

  // Evidence is durable before activation. If this lease is lost, the retry
  // recovery path can safely activate the evidence-backed canonical concept.
  const activationLease = await renewClaim();
  if (activationLease.error) {
    await failClaim();
    return json({ error: "Processing claim could not be verified" }, 500);
  }
  if (!activationLease.active) return changedWhileProcessing();
  const { error: activationError } = await adminClient
    .from("concepts")
    .update({ retired_at: null })
    .eq("user_id", userId)
    .in("id", resolvedConceptIds);
  if (activationError) {
    await failClaim();
    return json({ error: "Concept memory could not be activated" }, 500);
  }

  const processedLease = await renewClaim();
  if (processedLease.error) {
    await failClaim();
    return json({ error: "Processing claim could not be verified" }, 500);
  }
  if (!processedLease.active) return changedWhileProcessing();
  const { error: processedError } = await userClient.from("processed_content").insert({
    capture_id: body.captureId,
    user_id: userId,
    summary,
    key_concepts: normalizedConcepts.map((concept) => concept.name),
    ocr_text: sourceText,
    model: "google/gemini-2.5-flash-vision",
  });
  if (processedError) {
    await failClaim();
    return json({ error: "Processed source could not be saved" }, 500);
  }

  const { data: completed, error: completeError } = await updateOwnedClaim({
    raw_text: sourceText,
    processing_status: "ready",
    class_id: ownedClass.id,
    client_class_id: ownedClass.client_class_id,
    concept_extraction_claim_id: null,
    concept_extraction_started_at: null,
  });
  if (completeError) {
    await failClaim();
    return json({ error: "Capture completion failed" }, 500);
  }
  if (!completed
      || completed.processing_status !== "ready"
      || completed.practice_source_version !== expectedPracticeSourceVersion
      || completed.concept_extraction_claim_id !== null) {
    return changedWhileProcessing();
  }

  return json({
    ok: true,
    summary,
    concepts: resolvedConceptIds.map((conceptId) => ({
      id: conceptId,
      name: resolvedConcepts.find((concept) => concept.id === conceptId)?.name ?? "Concept",
    })),
  });
}));

function confirmedPracticeCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 360) return null;
  return buildAssignmentTutorPractice({
    conceptId: "photo-practice-candidate",
    conceptName: "Assignment problem",
    sourceExcerpt: candidate,
  }).supported ? candidate : null;
}

async function validateLinkedTargets(
  client: ReturnType<typeof createClient>,
  input: {
    userId: string;
    clientClassId: string;
    classId: string;
    assignmentId: string | null;
    examId: string | null;
  },
): Promise<string | null> {
  if (input.assignmentId) {
    const { data, error } = await client
      .from("assignments")
      .select("id, class_id, client_class_id")
      .eq("id", input.assignmentId)
      .eq("user_id", input.userId)
      .eq("client_class_id", input.clientClassId)
      .is("source_archived_at", null)
      .maybeSingle();
    if (error || !data || (data.class_id && data.class_id !== input.classId)) {
      return "Assignment does not belong to the capture class";
    }
  }
  if (input.examId) {
    const { data, error } = await client
      .from("exams")
      .select("id, class_id, client_class_id")
      .eq("id", input.examId)
      .eq("user_id", input.userId)
      .eq("client_class_id", input.clientClassId)
      .is("source_archived_at", null)
      .maybeSingle();
    if (error || !data || (data.class_id && data.class_id !== input.classId)) {
      return "Exam does not belong to the capture class";
    }
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function json(body: unknown, status = 200) {
  return privateJsonResponse(body, status, corsHeaders);
}
