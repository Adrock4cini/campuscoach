// Sprint C — Feedback loop.
//
// A real student just studied a `learning_artifacts` row. Persist the
// result so the Concept memory (`user_concept_mastery`) permanently
// reflects what they now know better, and recompute class readiness.
//
// Concepts are the permanent memory. Learning artifacts are disposable
// views. We update the memory here, never the artifact.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "../_shared/artifact-version.ts";
import { studyAttemptDisposition } from "../_shared/retry-integrity.ts";
import { buildAssignmentTutorPractice } from "../_shared/assignment-tutor.ts";
import { canonicalJsonStringify } from "../_shared/canonical-json.ts";
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
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";

type ConfidenceLevel = "low" | "medium" | "high";

interface PerConcept {
  conceptId: string;
  correct: boolean;
  confidence?: ConfidenceLevel;
  recovered?: boolean;
}

interface Body {
  attemptId?: string;
  artifactId: string;
  correct?: number;
  total?: number;
  durationSeconds: number;
  perConcept?: PerConcept[];
  /** Practice is graded against the stored transfer problem, never by the client. */
  selectedIndex?: number;
  confidence?: ConfidenceLevel;
  /** The first independent check is immutable in the client replay payload. */
  firstSelectedIndex?: number;
  firstConfidence?: ConfidenceLevel;
}

interface VerifiedPracticeGradingSnapshot {
  version: 1;
  conceptId: string;
  answerIndex: number;
  choiceCount: number;
  selectedIndex: number;
  confidence: ConfidenceLevel;
  correct: boolean;
  challengeFingerprint: string;
  resultRequestHash: string;
}

interface StudyResultAttemptRow {
  artifact_id: string;
  challenge_fingerprint: string | null;
  client_request_hash: string | null;
  verified_grading_snapshot: unknown;
  result_status: string;
  result_payload: unknown;
  result_request_hash: string;
  lease_token: string;
  lease_started_at: string;
  duration_seconds: number;
  session_id: string | null;
  completed_at: string | null;
}

interface PracticeMasteryReservation {
  applied: boolean;
  previousStrength: number;
}

interface PracticeCaptureBoundaryRow {
  id: string;
  assignment_id: string | null;
  class_id: string | null;
  client_class_id: string | null;
  kind: string;
  processing_status: string;
  concept_extraction_claim_id: string | null;
  practice_source_status: string | null;
  practice_source_text: string | null;
  practice_source_version: number;
  practice_source_hash: string | null;
  practice_concept_id: string | null;
}

interface PracticeAssignmentBoundaryRow {
  id: string;
  class_id: string | null;
  client_class_id: string | null;
}

interface PracticeChallengeOwnerRow {
  result_status: string;
  lease_started_at: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_KINDS = new Set(["flashcards", "multiple_choice", "matching", "practice"]);

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

Deno.serve((req) => withPrivateJsonErrors(req, corsHeaders, async (requestId) => {
  const json = (body: unknown, status = 200) => (
    privateJsonResponse(body, status, corsHeaders, { requestId })
  );
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: privateResponseHeaders(corsHeaders, requestId) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Study saving is temporarily unavailable" }, 503);
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
      logPrivateFailure({
        errorClass: "pause_control_unavailable",
        status: 503,
        requestId,
      });
    }
    return json(STUDY_WRITES_PAUSED_RESPONSE, 503);
  }

  let parsedBody: unknown;
  try { parsedBody = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isRecord(parsedBody)) return json({ error: "JSON body must be an object" }, 400);
  const body = parsedBody as unknown as Body;

  if (typeof body.artifactId !== "string" || !UUID_PATTERN.test(body.artifactId)) {
    return json({ error: "artifactId required" }, 400);
  }
  if (!Number.isFinite(body.durationSeconds) || body.durationSeconds < 0 || body.durationSeconds > 86_400) {
    return json({ error: "durationSeconds must be between 0 and 86400" }, 400);
  }
  if (body.perConcept !== undefined && !Array.isArray(body.perConcept)) {
    return json({ error: "perConcept must be an array" }, 400);
  }
  if (body.attemptId && !UUID_PATTERN.test(body.attemptId)) {
    return json({ error: "attemptId must be a UUID" }, 400);
  }

  // The client reuses this id after a lost response.
  const attemptId = body.attemptId ?? crypto.randomUUID();

  // 1. Load artifact (RLS enforces ownership).
  const { data: artifact, error: aErr } = await supabase
    .from("learning_artifacts")
    .select("id, user_id, class_id, client_class_id, concept_ids, capture_id, topic, kind, payload, model, prompt_version, stale, study_scope_type, study_scope_id, study_scope_label, study_scope_snapshot")
    .eq("id", body.artifactId)
    .maybeSingle();
  if (aErr) return json({ error: "artifact load failed" }, 500);
  if (!artifact) return json({ error: "artifact not found" }, 404);
  if (!SUPPORTED_KINDS.has(artifact.kind)) {
    return json({ error: "This study set must be refreshed before results can be saved" }, 409);
  }

  // Read the immutable attempt ledger before active-concept gating. An exact
  // retry may legitimately finish history repair after its source concept was
  // retired, but a new result may never add evidence to retired memory.
  const { data: priorAttemptData, error: priorErr } = await adminClient
    .from("study_result_attempts")
    .select("user_id, client_attempt_id, artifact_id, challenge_fingerprint, client_request_hash, verified_grading_snapshot, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at")
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .maybeSingle();
  if (priorErr) return json({ error: "attempt lookup failed" }, 500);
  const priorAttempt = priorAttemptData as StudyResultAttemptRow | null;

  const itemConceptIds = artifactItemConceptIds(artifact.kind, artifact.payload);
  if (!itemConceptIds) return json({ error: "study set payload is invalid" }, 409);
  const minimumItems = artifact.kind === "matching" ? 3 : 1;
  const maximumItems = artifact.kind === "matching" ? 6 : artifact.kind === "practice" ? 1 : 8;
  if (itemConceptIds.length < minimumItems || itemConceptIds.length > maximumItems) {
    return json({ error: "study set item count is invalid" }, 409);
  }
  if (!Array.isArray(artifact.concept_ids)
      || artifact.concept_ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return json({ error: "study set concepts are invalid" }, 409);
  }
  const conceptIds: string[] = [...new Set<string>(artifact.concept_ids)];
  if (artifact.kind === "practice" && artifact.concept_ids.length !== 1) {
    return json({ error: "practice study set must contain exactly one concept" }, 409);
  }
  if (conceptIds.length !== itemConceptIds.length
      || conceptIds.some((id) => !itemConceptIds.includes(id))) {
    return json({ error: "study set concepts do not match its questions" }, 409);
  }
  // 2. Load concepts to resolve real (uuid) class_id.
  const { data: concepts, error: cErr } = await supabase
    .from("concepts")
    .select("id, name, class_id, client_class_id, capture_id, retired_at")
    .eq("user_id", userId)
    .in("id", conceptIds);
  if (cErr) return json({ error: "concept load failed" }, 500);
  if (!concepts || concepts.length !== conceptIds.length) {
    return json({ error: "study set contains unavailable concepts" }, 409);
  }
  if (!priorAttempt && concepts.some((concept) => concept.retired_at !== null)) {
    return json({ error: "This study set contains a superseded concept and must be refreshed" }, 409);
  }

  const realClassId: string | null = concepts[0]?.class_id ?? null;
  const clientClassId: string | null = concepts[0]?.client_class_id ?? null;
  if (concepts.some((concept) => (
    concept.class_id !== realClassId || concept.client_class_id !== clientClassId
  ))) {
    return json({ error: "study set crosses class boundaries" }, 409);
  }
  if (artifact.class_id !== realClassId || artifact.client_class_id !== clientClassId) {
    return json({ error: "study set class does not match its concepts" }, 409);
  }

  const claimedAt = new Date().toISOString();
  const leaseToken = crypto.randomUUID();
  let practiceClientRequestHash: string | null = null;
  if (artifact.kind === "practice") {
    if (!body.attemptId) return json({ error: "practice attemptId is required" }, 400);
    if (!isNonNegativeInteger(body.selectedIndex)
        || !isNonNegativeInteger(body.firstSelectedIndex)
        || !isConfidenceLevel(body.confidence)
        || !isConfidenceLevel(body.firstConfidence)) {
      return json({ error: "practice response must include valid first and final selections with confidence" }, 400);
    }
    if (body.selectedIndex !== body.firstSelectedIndex
        || body.confidence !== body.firstConfidence) {
      return json({ error: "practice results must record the first independent check before feedback" }, 400);
    }
    practiceClientRequestHash = await practiceResultClientRequestHash({
      artifactId: body.artifactId,
      selectedIndex: body.selectedIndex,
      confidence: body.confidence,
      firstSelectedIndex: body.firstSelectedIndex,
      firstConfidence: body.firstConfidence,
    });
  }

  // Validate all student-supplied result details before reserving an attempt.
  // A rejected body must never leave a durable session stuck in `processing`.
  const perMap = new Map<string, {
    correct: boolean;
    confidence: ConfidenceLevel;
    recovered: boolean;
  }>();
  let correct: number;
  let total: number;
  let selectedIndex: number | undefined;
  let firstSelectedIndex: number | undefined;
  let practiceChallengeMaterial: string | null = null;
  let verifiedPracticeSnapshot: VerifiedPracticeGradingSnapshot | null = null;
  if (artifact.kind === "practice") {
    selectedIndex = body.selectedIndex as number;
    firstSelectedIndex = body.firstSelectedIndex as number;
    const practiceConfidence = body.firstConfidence as ConfidenceLevel;
    let firstCorrect: boolean;
    if (priorAttempt) {
      verifiedPracticeSnapshot = parseVerifiedPracticeGradingSnapshot(
        priorAttempt.verified_grading_snapshot,
      );
      if (priorAttempt.artifact_id !== body.artifactId
          || priorAttempt.client_request_hash !== practiceClientRequestHash
          || !verifiedPracticeSnapshot
          || verifiedPracticeSnapshot.conceptId !== conceptIds[0]
          || verifiedPracticeSnapshot.selectedIndex !== selectedIndex
          || verifiedPracticeSnapshot.confidence !== practiceConfidence
          || priorAttempt.result_request_hash !== verifiedPracticeSnapshot.resultRequestHash
          || priorAttempt.challenge_fingerprint !== verifiedPracticeSnapshot.challengeFingerprint) {
        return json({ error: "attemptId already belongs to a different study result" }, 409);
      }
      firstCorrect = verifiedPracticeSnapshot.correct;
    } else {
      const transfer = canonicalPracticeTransfer(artifact);
      if (!transfer) return json({ error: "practice transfer payload is invalid" }, 409);
      if (selectedIndex >= transfer.choiceCount || firstSelectedIndex >= transfer.choiceCount) {
        return json({ error: "practice response must include valid first and final selections with confidence" }, 400);
      }
      practiceChallengeMaterial = transfer.challengeMaterial;
      firstCorrect = firstSelectedIndex === transfer.answerIndex;
      verifiedPracticeSnapshot = {
        version: 1,
        conceptId: conceptIds[0],
        answerIndex: transfer.answerIndex,
        choiceCount: transfer.choiceCount,
        selectedIndex: firstSelectedIndex,
        confidence: practiceConfidence,
        correct: firstCorrect,
        challengeFingerprint: "",
        resultRequestHash: "",
      };
    }

    correct = firstCorrect ? 1 : 0;
    total = 1;
    perMap.set(conceptIds[0], {
      correct: correct === 1,
      confidence: practiceConfidence,
      recovered: false,
    });
  } else {
    if (typeof body.total !== "number" || typeof body.correct !== "number") {
      return json({ error: "artifactId, correct, total required" }, 400);
    }
    if (!Number.isInteger(body.total) || !Number.isInteger(body.correct)
        || body.total <= 0 || body.correct < 0 || body.correct > body.total) {
      return json({ error: "correct and total must be valid whole-number results" }, 400);
    }
    if (body.total !== itemConceptIds.length) {
      return json({ error: "total does not match this study set" }, 400);
    }
    if (!body.perConcept || body.perConcept.length !== conceptIds.length) {
      return json({ error: "perConcept must score every item in this study set" }, 400);
    }
    const allowed = new Set(conceptIds);
    for (const rawResult of body.perConcept as unknown[]) {
      if (!isRecord(rawResult)) {
        return json({ error: "perConcept contains an invalid or duplicate result" }, 400);
      }
      const p = rawResult as unknown as PerConcept;
      const confidence = p.confidence ?? "medium";
      if (typeof p.conceptId !== "string"
          || !UUID_PATTERN.test(p.conceptId)
          || !allowed.has(p.conceptId)
          || perMap.has(p.conceptId)
          || !["low", "medium", "high"].includes(confidence)
          || typeof p.correct !== "boolean"
          || (p.recovered !== undefined && typeof p.recovered !== "boolean")
          || (p.recovered === true && p.correct === true)) {
        return json({ error: "perConcept contains an invalid or duplicate result" }, 400);
      }
      perMap.set(p.conceptId, {
        correct: p.correct,
        confidence,
        recovered: p.recovered === true,
      });
    }
    correct = body.correct;
    total = body.total;
    if (conceptIds.some((id) => !perMap.has(id))
        || [...perMap.values()].filter((result) => result.correct).length !== correct) {
      return json({ error: "correct and perConcept results do not match" }, 400);
    }
  }

  const scorePct = Math.round((correct / total) * 100);
  let requestHash: string;
  let practiceChallengeFingerprint: string | null;
  if (artifact.kind === "practice" && priorAttempt && verifiedPracticeSnapshot) {
    requestHash = verifiedPracticeSnapshot.resultRequestHash;
    practiceChallengeFingerprint = verifiedPracticeSnapshot.challengeFingerprint;
  } else {
    requestHash = await studyResultRequestHash(
      body.artifactId,
      correct,
      total,
      perMap,
      selectedIndex,
      firstSelectedIndex,
    );
    practiceChallengeFingerprint = practiceChallengeMaterial
      ? await sha256Hex(practiceChallengeMaterial)
      : null;
    if (artifact.kind === "practice" && verifiedPracticeSnapshot
        && practiceChallengeFingerprint) {
      verifiedPracticeSnapshot.resultRequestHash = requestHash;
      verifiedPracticeSnapshot.challengeFingerprint = practiceChallengeFingerprint;
    }
  }
  type CompletedAttemptForRepair = {
    result_status: string;
    result_payload: unknown;
    completed_at: string | null;
    session_id: string | null;
    duration_seconds: number;
  };
  const repairCompletedSession = async (completed: CompletedAttemptForRepair) => {
    if (completed.result_status !== "completed" || !completed.completed_at
        || !isRecord(completed.result_payload)) {
      return { ok: false as const };
    }

    let sessionId = completed.session_id;
    let existingSession: {
      id: string;
      user_id: string;
      artifact_id: string | null;
      client_attempt_id: string | null;
      result_request_hash: string | null;
    } | null = null;
    if (sessionId) {
      const { data, error } = await adminClient
        .from("study_sessions")
        .select("id, user_id, artifact_id, client_attempt_id, result_request_hash")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) return { ok: false as const };
      existingSession = data;
      if (existingSession && (
        existingSession.user_id !== userId
        || existingSession.artifact_id !== artifact.id
        || existingSession.client_attempt_id !== attemptId
        || existingSession.result_request_hash !== requestHash
      )) return { ok: false as const };
    }
    if (!existingSession) sessionId = crypto.randomUUID();

    let canonicalPayload = {
      ...completed.result_payload,
      sessionId,
    };
    const canonicalHistory = {
      user_id: userId,
      artifact_id: artifact.id,
      client_attempt_id: attemptId,
      result_request_hash: requestHash,
      result_status: "completed",
      result_payload: canonicalPayload,
      class_id: realClassId,
      client_class_id: clientClassId,
      mode: `artifact:${artifact.kind}`,
      duration_minutes: Math.max(1, Math.round(completed.duration_seconds / 60)),
      score: scorePct,
      topic: artifact.topic ?? null,
      study_scope_type: artifact.study_scope_type ?? "class",
      study_scope_id: artifact.study_scope_id ?? "class",
      study_scope_label: artifact.study_scope_label ?? null,
      study_scope_snapshot: artifact.study_scope_snapshot ?? {},
      ended_at: completed.completed_at,
    };

    if (existingSession) {
      const { data: repaired, error } = await adminClient
        .from("study_sessions")
        .update(canonicalHistory)
        .eq("id", sessionId!)
        .eq("user_id", userId)
        .eq("artifact_id", artifact.id)
        .eq("client_attempt_id", attemptId)
        .eq("result_request_hash", requestHash)
        .select("id")
        .maybeSingle();
      if (error || !repaired) return { ok: false as const };
    } else {
      const { data: recreated, error } = await adminClient
        .from("study_sessions")
        .insert({ id: sessionId!, ...canonicalHistory })
        .select("id")
        .maybeSingle();
      if (error?.code === "23505") {
        const { data: orphan, error: orphanError } = await adminClient
          .from("study_sessions")
          .select("id")
          .eq("user_id", userId)
          .eq("artifact_id", artifact.id)
          .eq("client_attempt_id", attemptId)
          .eq("result_request_hash", requestHash)
          .maybeSingle();
        if (orphanError || !orphan) return { ok: false as const };
        sessionId = orphan.id;
        canonicalPayload = { ...completed.result_payload, sessionId };
        const { data: repairedOrphan, error: orphanRepairError } = await adminClient
          .from("study_sessions")
          .update({ ...canonicalHistory, result_payload: canonicalPayload })
          .eq("id", sessionId)
          .eq("user_id", userId)
          .eq("artifact_id", artifact.id)
          .eq("client_attempt_id", attemptId)
          .eq("result_request_hash", requestHash)
          .select("id")
          .maybeSingle();
        if (orphanRepairError || !repairedOrphan) return { ok: false as const };
      } else if (error || !recreated) return { ok: false as const };
    }

    const { data: relinked, error: relinkError } = await adminClient
      .from("study_result_attempts")
      .update({
        session_id: sessionId,
        result_payload: canonicalPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", "completed")
      .select("session_id")
      .maybeSingle();
    if (relinkError || relinked?.session_id !== sessionId) return { ok: false as const };
    return { ok: true as const, payload: canonicalPayload };
  };

  // Freshness is a gate for new evidence only. An exact retry may arrive after
  // regeneration or a deploy marks its artifact stale; its authoritative
  // ledger attempt must still be returned or resumed idempotently.
  if (!priorAttempt && (
    artifact.stale
    || artifact.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION
  )) {
    return json({
      error: "This study set must be refreshed before results can be saved",
      ...(artifact.kind === "practice" ? {
        reason: "practice_artifact_stale",
        retryable: false,
      } : {}),
    }, 409);
  }
  if (!priorAttempt && artifact.kind === "practice") {
    const payload = artifact.payload;
    const practiceProblem = isRecord(payload) && Array.isArray(payload.problems)
      ? payload.problems[0]
      : null;
    if (!isRecord(practiceProblem)
        || practiceProblem.conceptName !== concepts[0]?.name) {
      return json({
        error: "practice concept does not match its assignment capture",
        reason: "practice_source_changed",
        retryable: false,
      }, 409);
    }
    const boundary = await verifyPracticeArtifactBoundary(supabase, userId, artifact);
    if (boundary instanceof Response) return boundary;
  }

  let attempt: StudyResultAttemptRow | null = null;
  let practiceMasteryReservation: PracticeMasteryReservation | null = null;
  const reservePracticeMastery = () => adminClient.rpc(
    "reserve_practice_study_attempt",
    {
      p_user_id: userId,
      p_client_attempt_id: attemptId,
      p_artifact_id: artifact.id,
      p_challenge_fingerprint: practiceChallengeFingerprint!,
      p_result_request_hash: requestHash,
      p_client_request_hash: practiceClientRequestHash!,
      p_verified_grading_snapshot: verifiedPracticeSnapshot!,
      p_lease_token: leaseToken,
      p_lease_started_at: claimedAt,
      p_duration_seconds: Math.trunc(body.durationSeconds),
    },
  );
  if (priorAttempt) {
    if (priorAttempt.artifact_id !== body.artifactId
        || priorAttempt.result_request_hash !== requestHash
        || (artifact.kind === "practice"
          && priorAttempt.challenge_fingerprint !== practiceChallengeFingerprint)) {
      return json({ error: "attemptId already belongs to a different study result" }, 409);
    }
    const disposition = studyAttemptDisposition(
      priorAttempt.result_status,
      priorAttempt.lease_started_at,
    );
    if (disposition === "return-cached") {
      const repaired = await repairCompletedSession(priorAttempt);
      if (!repaired.ok) {
        return json({ error: "study history repair failed", retryable: true }, 500);
      }
      return json(repaired.payload);
    }
    if (disposition === "wait") {
      return json({ error: "study result is still saving", retryable: true }, 409);
    }
    const { data: reclaimed, error: reclaimError } = await adminClient
      .from("study_result_attempts")
      .update({
        result_status: "processing",
        result_payload: null,
        completed_at: null,
        lease_token: leaseToken,
        lease_started_at: claimedAt,
        updated_at: claimedAt,
      })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", priorAttempt.result_status)
      .eq("lease_token", priorAttempt.lease_token)
      .eq("lease_started_at", priorAttempt.lease_started_at)
      .select("artifact_id, challenge_fingerprint, client_request_hash, verified_grading_snapshot, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at")
      .maybeSingle();
    if (reclaimError) return json({ error: "attempt reclaim failed" }, 500);
    if (!reclaimed) {
      return json({ error: "study result is already being retried", retryable: true }, 409);
    }
    attempt = reclaimed as StudyResultAttemptRow;
  } else {
    if (artifact.kind === "practice") {
      if (!practiceChallengeFingerprint || !practiceClientRequestHash
          || !verifiedPracticeSnapshot) {
        return json({ error: "practice challenge is invalid" }, 409);
      }
      const { data: reservationData, error: reservationError } = await reservePracticeMastery();
      if (reservationError) {
        return json({ error: "practice result could not be reserved", retryable: true }, 500);
      }
      const reservation = isRecord(reservationData) ? reservationData : null;
      if (!reservation || typeof reservation.disposition !== "string") {
        return json({ error: "practice reservation was not confirmed", retryable: true }, 500);
      }
      if (reservation.disposition === "attempt-exists") {
        return json({ error: "study result is already being saved", retryable: true }, 409);
      }
      if (reservation.disposition === "challenge-conflict") {
        const ownerAttemptId = typeof reservation.ownerAttemptId === "string"
          ? reservation.ownerAttemptId
          : null;
        return practiceChallengeConflictResponse(adminClient, userId, ownerAttemptId);
      }
      if (reservation.disposition === "boundary-conflict") {
        return practiceBoundaryConflict("practice source changed before this result could be recorded");
      }
      if (reservation.disposition === "attempt-mismatch") {
        return json({ error: "attemptId already belongs to a different study result" }, 409);
      }
      if (reservation.disposition !== "reserved") {
        return json({ error: "practice reservation was not confirmed", retryable: true }, 500);
      }
      practiceMasteryReservation = parsePracticeMasteryReservation(reservation);
      attempt = {
        artifact_id: artifact.id,
        challenge_fingerprint: practiceChallengeFingerprint,
        client_request_hash: practiceClientRequestHash,
        verified_grading_snapshot: verifiedPracticeSnapshot,
        result_status: "processing",
        result_payload: null,
        result_request_hash: requestHash,
        lease_token: leaseToken,
        lease_started_at: claimedAt,
        duration_seconds: Math.trunc(body.durationSeconds),
        session_id: null,
        completed_at: null,
      };
    } else {
      const { data: insertedAttempt, error: attemptInsertError } = await adminClient
        .from("study_result_attempts")
        .insert({
          user_id: userId,
          client_attempt_id: attemptId,
          artifact_id: artifact.id,
          challenge_fingerprint: null,
          client_request_hash: null,
          verified_grading_snapshot: null,
          result_request_hash: requestHash,
          result_status: "processing",
          lease_token: leaseToken,
          lease_started_at: claimedAt,
          duration_seconds: Math.trunc(body.durationSeconds),
        })
        .select("artifact_id, challenge_fingerprint, client_request_hash, verified_grading_snapshot, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at")
        .single();
      if (attemptInsertError) {
        if (attemptInsertError.code === "23505") {
          return json({ error: "study result is already being saved", retryable: true }, 409);
        }
        return json({ error: "attempt reservation failed" }, 500);
      }
      attempt = insertedAttempt as StudyResultAttemptRow;
    }
  }

  // A reclaimed first attempt may predate the atomic reservation response or
  // have lost its HTTP response. Re-enter the same database function: it
  // returns the committed mastery marker, or validates and applies the frozen
  // first response under the capture/source locks.
  if (artifact.kind === "practice" && priorAttempt && attempt) {
    if (!practiceChallengeFingerprint || !practiceClientRequestHash || !verifiedPracticeSnapshot) {
      return json({ error: "practice challenge is invalid" }, 409);
    }
    const { data: reservationData, error: reservationError } = await reservePracticeMastery();
    if (reservationError) {
      return json({ error: "practice result could not be recovered", retryable: true }, 500);
    }
    const reservation = isRecord(reservationData) ? reservationData : null;
    if (!reservation || typeof reservation.disposition !== "string") {
      return json({ error: "practice recovery was not confirmed", retryable: true }, 500);
    }
    if (reservation.disposition === "boundary-conflict") {
      return practiceBoundaryConflict("practice source changed before this result could be recovered");
    }
    if (reservation.disposition === "attempt-mismatch") {
      return json({ error: "attemptId already belongs to a different study result" }, 409);
    }
    if (reservation.disposition === "challenge-conflict") {
      const ownerAttemptId = typeof reservation.ownerAttemptId === "string"
        ? reservation.ownerAttemptId
        : null;
      return practiceChallengeConflictResponse(adminClient, userId, ownerAttemptId);
    }
    if (reservation.disposition !== "attempt-exists"
        && reservation.disposition !== "reserved") {
      return json({ error: "practice recovery was not confirmed", retryable: true }, 500);
    }
    practiceMasteryReservation = parsePracticeMasteryReservation(reservation);
  }
  if (!attempt) return json({ error: "attempt reservation failed" }, 500);

  // The first accepted request owns timing. A mobile retry may arrive later,
  // but it cannot rewrite the duration used by history or topic signals.
  const attemptDurationMinutes = Math.max(1, Math.round(attempt.duration_seconds / 60));

  // study_sessions is presentation/history only. Service-role writes plus the
  // database guard keep artifact rows immutable to browser clients.
  let session: { id: string } | null = null;
  if (attempt.session_id) {
    const { data: linkedSession, error: linkedSessionError } = await adminClient
      .from("study_sessions")
      .select("id")
      .eq("id", attempt.session_id)
      .eq("user_id", userId)
      .eq("artifact_id", artifact.id)
      .eq("client_attempt_id", attemptId)
      .eq("result_request_hash", requestHash)
      .maybeSingle();
    if (linkedSessionError) {
      return json({ error: "session lookup failed" }, 500);
    }
    if (!linkedSession) return json({ error: "attempt history link is invalid" }, 500);
    session = linkedSession;
  } else {
    const sessionValues = {
      user_id: userId,
      artifact_id: artifact.id,
      client_attempt_id: attemptId,
      result_request_hash: requestHash,
      result_status: "processing",
      result_payload: null,
      class_id: realClassId,
      client_class_id: clientClassId,
      mode: `artifact:${artifact.kind}`,
      duration_minutes: attemptDurationMinutes,
      score: scorePct,
      topic: artifact.topic ?? null,
      study_scope_type: artifact.study_scope_type ?? "class",
      study_scope_id: artifact.study_scope_id ?? "class",
      study_scope_label: artifact.study_scope_label ?? null,
      study_scope_snapshot: artifact.study_scope_snapshot ?? {},
      ended_at: null,
    };
    const { data: insertedSession, error: sessionInsertError } = await adminClient
      .from("study_sessions")
      .insert(sessionValues)
      .select("id")
      .maybeSingle();
    if (sessionInsertError?.code === "23505") {
      const { data: recoveredSession, error: recoveredSessionError } = await adminClient
        .from("study_sessions")
        .update(sessionValues)
        .eq("user_id", userId)
        .eq("client_attempt_id", attemptId)
        .eq("artifact_id", artifact.id)
        .eq("result_request_hash", requestHash)
        .select("id")
        .maybeSingle();
      if (recoveredSessionError) {
        return json({ error: "session recovery failed" }, 500);
      }
      session = recoveredSession;
    } else if (sessionInsertError) {
      return json({ error: "session insert failed" }, 500);
    } else {
      session = insertedSession;
    }
    if (!session) return json({ error: "session history could not be reserved" }, 409);

    const { data: linkedAttempt, error: linkError } = await adminClient
      .from("study_result_attempts")
      .update({ session_id: session.id, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", "processing")
      .eq("lease_token", attempt.lease_token)
      .select("session_id")
      .maybeSingle();
    if (linkError) return json({ error: "attempt history link failed" }, 500);
    if (!linkedAttempt) {
      return json({ error: "study result was superseded; retry safely", retryable: true }, 409);
    }
    attempt.session_id = session.id;
  }

  // 4. Update user_concept_mastery per concept.
  // Per-concept results if provided; otherwise apply overall pass/fail to each.
  const now = new Date();
  const previousStrengthByConcept = new Map<string, number>();
  let appliedAny = false;
  if (artifact.kind === "practice") {
    if (!practiceMasteryReservation) {
      return json({ error: "practice mastery reservation is missing", retryable: true }, 500);
    }
    appliedAny = practiceMasteryReservation.applied;
    previousStrengthByConcept.set(conceptIds[0], practiceMasteryReservation.previousStrength);
  } else for (const conceptId of conceptIds) {
    const { data: applied, error: applyErr } = await adminClient.rpc(
      "apply_study_concept_result_v2",
      {
        p_user_id: userId,
        p_attempt_id: attemptId,
        p_concept_id: conceptId,
        p_class_id: realClassId,
        p_correct: perMap.get(conceptId)?.correct ?? false,
        p_confidence: perMap.get(conceptId)?.confidence ?? "medium",
        p_recovered: perMap.get(conceptId)?.recovered ?? false,
        p_seen_at: now.toISOString(),
      },
    );
    if (applyErr) {
      await adminClient
        .from("study_result_attempts")
        .update({ result_status: "failed", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("client_attempt_id", attemptId)
        .eq("artifact_id", artifact.id)
        .eq("result_request_hash", requestHash)
        .eq("result_status", "processing")
        .eq("lease_token", attempt.lease_token);
      return json({ error: "mastery update failed" }, 500);
    }
    const result = applied as {
      applied?: boolean;
      previousStrength?: number | null;
    } | null;
    appliedAny = appliedAny || result?.applied === true;
    previousStrengthByConcept.set(conceptId, Number(result?.previousStrength) || 0);
  }

  // A reclaimed request may be repairing the projections after mastery was
  // already committed. Per-attempt unique keys below make replay safe.
  const shouldWriteDerivedEvidence = appliedAny || Boolean(priorAttempt);

  // Renew by lease token after the mastery loop. This compare-and-swap both
  // proves ownership and gives the short derived-write section a fresh window,
  // so a stale worker cannot race a legitimate mobile retry.
  const renewedAt = new Date().toISOString();
  const { data: activeLease, error: leaseError } = await adminClient
    .from("study_result_attempts")
    .update({ lease_started_at: renewedAt, updated_at: renewedAt })
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .eq("artifact_id", artifact.id)
    .eq("result_status", "processing")
    .eq("result_request_hash", requestHash)
    .eq("lease_token", attempt.lease_token)
    .select("lease_token, lease_started_at")
    .maybeSingle();
  if (leaseError) return json({ error: "study result lease check failed", retryable: true }, 500);
  if (!activeLease) {
    return json({ error: "study result was superseded; retry safely", retryable: true }, 409);
  }

  // 5. Recompute class readiness from mastery.
  let readiness: number | null = null;
  let readinessBefore: number | null = null;
  if (realClassId || clientClassId) {
    const isExamScope = artifact.study_scope_type === "exam";
    let activeConceptIds = conceptIds;
    if (!isExamScope) {
      let activeConceptQuery = supabase
        .from("concepts")
        .select("id")
        .eq("user_id", userId)
        .is("retired_at", null);
      activeConceptQuery = realClassId
        ? activeConceptQuery.eq("class_id", realClassId)
        : activeConceptQuery.eq("client_class_id", clientClassId!);
      const { data: activeConcepts } = await activeConceptQuery;
      activeConceptIds = (activeConcepts ?? []).map((concept) => concept.id as string);
    }

    const { data: masteryAll } = activeConceptIds.length
      ? await supabase
        .from("user_concept_mastery")
        .select("concept_id, strength")
        .eq("user_id", userId)
        .in("concept_id", activeConceptIds)
      : { data: [] as Array<{ concept_id: string; strength: number }> };
    const vals = (masteryAll ?? []).map((r) => Number(r.strength) || 0);
    if (vals.length) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      readiness = Math.round(clamp(avg, 0, 1) * 100);

      const beforeVals = (masteryAll ?? []).map((row) => {
        const conceptId = row.concept_id as string;
        if (!perMap.has(conceptId)) return Number(row.strength) || 0;
        return previousStrengthByConcept.get(conceptId) ?? 0;
      });
      const beforeAvg = beforeVals.reduce((a, b) => a + b, 0) / beforeVals.length;
      readinessBefore = Math.round(clamp(beforeAvg, 0, 1) * 100);
    }
    if (readiness !== null) {
      if (shouldWriteDerivedEvidence) {
        await adminClient.from("readiness_scores").upsert({
          user_id: userId,
          class_id: realClassId,
          client_class_id: clientClassId,
          readiness,
          source_attempt_id: attemptId,
          computed_at: now.toISOString(),
        }, {
          onConflict: "user_id,source_attempt_id",
          ignoreDuplicates: true,
        });
      }
      if (isExamScope && artifact.study_scope_id) {
        await adminClient
          .from("exams")
          .update({ readiness })
          .eq("user_id", userId)
          .eq("id", artifact.study_scope_id);
      }
    }
  }

  // 6. Optional topic_signal (best-effort, non-fatal).
  if (shouldWriteDerivedEvidence && artifact.topic && (realClassId || clientClassId)) {
    await adminClient.from("topic_signals").upsert({
      user_id: userId,
      class_id: (realClassId ?? clientClassId) as string,
      topic_id: artifact.topic,
      topic_name: artifact.topic,
      accuracy: scorePct,
      incorrect_count: Math.max(0, total - correct),
      time_spent_minutes: attemptDurationMinutes,
      source_type: "study-session",
      source_id: session.id,
    }, {
      onConflict: "user_id,source_type,source_id",
      ignoreDuplicates: true,
    }).then(() => {}, () => {});
  }

  // 7. Strategy-effectiveness evidence (best-effort, non-fatal).
  // Only ranking metadata is stored — never question text, answers, concept
  // content, or source excerpts. Owner-scoped; no cross-student aggregation.
  if (shouldWriteDerivedEvidence) {
    const snapshot = isRecord(artifact.study_scope_snapshot) ? artifact.study_scope_snapshot : {};
    const strategy = isRecord(snapshot.strategy) ? snapshot.strategy : {};
    const subjectProfile = isRecord(snapshot.subjectProfile) ? snapshot.subjectProfile : {};
    const masteryDeltas = conceptIds
      .map((conceptId) => previousStrengthByConcept.get(conceptId))
      .filter((value): value is number => typeof value === "number");
    const averagePrevious = masteryDeltas.length
      ? masteryDeltas.reduce((a, b) => a + b, 0) / masteryDeltas.length
      : null;
    await adminClient.from("study_strategy_outcomes").upsert({
      user_id: userId,
      client_attempt_id: attemptId,
      class_id: realClassId,
      artifact_id: artifact.id,
      subject_profile: typeof subjectProfile.id === "string" ? subjectProfile.id : "general",
      task_kind: typeof strategy.taskKind === "string" ? strategy.taskKind : null,
      format: artifact.kind,
      strategy_id: typeof strategy.id === "string" ? strategy.id : null,
      technique: typeof strategy.technique === "string" ? strategy.technique : null,
      modality: typeof strategy.modality === "string" ? strategy.modality : null,
      outcome_source: "study_result",
      correct,
      total,
      mastery_delta: averagePrevious === null
        ? null
        : Number((correct / total - averagePrevious).toFixed(4)),
      occurred_at: now.toISOString(),
    }, {
      onConflict: "user_id,client_attempt_id",
      ignoreDuplicates: true,
    }).then(() => {}, () => {});
  }

  const resultPayload = {
    ok: true,
    sessionId: session.id,
    readiness,
    readinessBefore,
    readinessDelta: readiness !== null && readinessBefore !== null
      ? readiness - readinessBefore
      : null,
    updatedConcepts: conceptIds.length,
    recoveredConcepts: [...perMap.values()].filter((result) => result.recovered).length,
  };

  // Complete the service-only ledger first. If this update or the HTTP response
  // is lost, the attempt row still returns the exact cached response and repairs
  // presentation history without applying mastery twice.
  const endedAt = new Date().toISOString();
  const { data: completedAttempt, error: completionError } = await adminClient
    .from("study_result_attempts")
    .update({
      result_status: "completed",
      result_payload: resultPayload,
      completed_at: endedAt,
      updated_at: endedAt,
    })
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .eq("artifact_id", artifact.id)
    .eq("result_status", "processing")
    .eq("result_request_hash", requestHash)
    .eq("lease_token", attempt.lease_token)
    .select("result_status, result_payload, completed_at, session_id, duration_seconds")
    .maybeSingle();

  if (completionError) {
    return json({ error: "study result completion failed", retryable: true }, 500);
  }
  if (!completedAttempt
      || completedAttempt.result_status !== "completed"
      || !completedAttempt.completed_at) {
    const { data: currentAttempt } = await adminClient
      .from("study_result_attempts")
      .select("result_status, result_payload, completed_at, session_id, duration_seconds")
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .maybeSingle();
    if (currentAttempt?.result_status === "completed" && currentAttempt.completed_at) {
      const repaired = await repairCompletedSession(currentAttempt);
      if (!repaired.ok) {
        return json({ error: "study history repair failed", retryable: true }, 500);
      }
      return json(repaired.payload);
    }
    return json({ error: "study result was superseded; retry safely", retryable: true }, 409);
  }

  const repaired = await repairCompletedSession(completedAttempt);
  if (!repaired.ok) {
    return json({ error: "study history completion failed", retryable: true }, 500);
  }

  return json(repaired.payload);
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactItemConceptIds(kind: string, payload: unknown): string[] | null {
  if (!isRecord(payload)) return null;
  const rootKey = kind === "flashcards"
    ? "cards"
    : kind === "multiple_choice"
      ? "questions"
      : kind === "matching"
        ? "pairs"
        : kind === "practice"
          ? "problems"
          : null;
  if (!rootKey || !Array.isArray(payload[rootKey])) return null;
  const ids: string[] = [];
  for (const rawItem of payload[rootKey]) {
    if (!isRecord(rawItem) || typeof rawItem.conceptId !== "string"
        || !UUID_PATTERN.test(rawItem.conceptId) || ids.includes(rawItem.conceptId)) {
      return null;
    }
    ids.push(rawItem.conceptId);
  }
  return ids;
}

function canonicalPracticeTransfer(artifact: Record<string, unknown>): {
  answerIndex: number;
  choiceCount: number;
  challengeMaterial: string;
} | null {
  const payload = artifact.payload;
  if (!isRecord(payload) || !Array.isArray(payload.problems) || payload.problems.length !== 1) {
    return null;
  }
  const problem = payload.problems[0];
  const snapshot = artifact.study_scope_snapshot;
  if (artifact.model !== "deterministic-assignment-tutor-v1"
      || typeof artifact.prompt_version !== "string"
      || !isRecord(problem)
      || typeof problem.conceptId !== "string"
      || !UUID_PATTERN.test(problem.conceptId)
      || typeof problem.conceptName !== "string"
      || typeof problem.sourceExcerpt !== "string"
      || typeof artifact.capture_id !== "string"
      || !UUID_PATTERN.test(artifact.capture_id)
      || !isRecord(snapshot)
      || typeof snapshot.assignmentId !== "string"
      || !UUID_PATTERN.test(snapshot.assignmentId)
      || snapshot.intent !== "assignment-help") {
    return null;
  }
  const canonical = buildAssignmentTutorPractice({
    conceptId: problem.conceptId,
    conceptName: problem.conceptName,
    sourceExcerpt: problem.sourceExcerpt,
  });
  if (!canonical.supported
      || canonicalJsonStringify(problem) !== canonicalJsonStringify(canonical.problem)) return null;
  const originalAnswer = canonical.problem.original.choices[canonical.problem.original.answerIndex];
  const transferAnswer = canonical.problem.transfer.choices[canonical.problem.transfer.answerIndex];
  return {
    answerIndex: canonical.problem.transfer.answerIndex,
    choiceCount: canonical.problem.transfer.choices.length,
    challengeMaterial: JSON.stringify({
      schemaVersion: "assignment-tutor-challenge-v1",
      assignmentId: snapshot.assignmentId,
      original: {
        prompt: canonical.problem.original.prompt,
        answer: originalAnswer,
      },
      transfer: {
        prompt: canonical.problem.transfer.prompt,
        answer: transferAnswer,
      },
    }),
  };
}

async function verifyPracticeArtifactBoundary(
  supabase: SupabaseClient,
  userId: string,
  artifact: Record<string, unknown>,
): Promise<true | Response> {
  const snapshot = artifact.study_scope_snapshot;
  if (!isRecord(snapshot)
      || typeof snapshot.assignmentId !== "string"
      || !UUID_PATTERN.test(snapshot.assignmentId)
      || !Number.isInteger(snapshot.practiceSourceVersion)
      || (snapshot.practiceSourceVersion as number) < 1
      || typeof snapshot.practiceSourceHash !== "string"
      || !/^[0-9a-f]{64}$/.test(snapshot.practiceSourceHash)
      || typeof snapshot.practiceConceptId !== "string"
      || !UUID_PATTERN.test(snapshot.practiceConceptId)
      || typeof artifact.capture_id !== "string"
      || !UUID_PATTERN.test(artifact.capture_id)) {
    return practiceBoundaryConflict("practice assignment scope is invalid");
  }

  const { data: captureData, error: captureError } = await supabase
    .from("captures")
    .select("id, assignment_id, class_id, client_class_id, kind, processing_status, concept_extraction_claim_id, practice_source_status, practice_source_text, practice_source_version, practice_source_hash, practice_concept_id")
    .eq("user_id", userId)
    .eq("id", artifact.capture_id)
    .maybeSingle();
  if (captureError) return json({ error: "practice capture could not be verified" }, 500);
  const capture = captureData as PracticeCaptureBoundaryRow | null;
  if (!capture) return practiceBoundaryConflict("practice capture is no longer available");

  const { data: assignmentData, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, class_id, client_class_id")
    .eq("user_id", userId)
    .eq("id", snapshot.assignmentId)
    .is("source_archived_at", null)
    .maybeSingle();
  if (assignmentError) return json({ error: "practice assignment could not be verified" }, 500);
  const assignment = assignmentData as PracticeAssignmentBoundaryRow | null;
  if (!assignment) return practiceBoundaryConflict("practice assignment is no longer available");

  const payload = artifact.payload;
  const problem = isRecord(payload) && Array.isArray(payload.problems) ? payload.problems[0] : null;
  const sourceExcerpt = isRecord(problem) && typeof problem.sourceExcerpt === "string"
    ? problem.sourceExcerpt
    : null;
  const conceptId = isRecord(problem) && typeof problem.conceptId === "string"
    ? problem.conceptId
    : null;
  if (!conceptId || !UUID_PATTERN.test(conceptId)) {
    return practiceBoundaryConflict("practice concept provenance is invalid");
  }
  const { data: evidence, error: evidenceError } = await supabase
    .from("concept_capture_evidence")
    .select("concept_id")
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .eq("capture_id", artifact.capture_id)
    .maybeSingle();
  if (evidenceError) return json({ error: "practice concept provenance could not be verified" }, 500);
  if (!evidence) return practiceBoundaryConflict("practice concept is not evidenced by this capture");
  const confirmedSourceHash = typeof capture.practice_source_text === "string"
    ? await sha256Hex(capture.practice_source_text)
    : null;
  if (capture.kind !== "scan-assignment"
      || capture.processing_status !== "ready"
      || capture.concept_extraction_claim_id !== null
      || capture.practice_source_status !== "confirmed"
      || capture.assignment_id !== assignment.id
      || capture.id !== artifact.capture_id
      || capture.class_id !== artifact.class_id
      || capture.client_class_id !== artifact.client_class_id
      || assignment.class_id !== artifact.class_id
      || assignment.client_class_id !== artifact.client_class_id
      || capture.practice_source_version !== snapshot.practiceSourceVersion
      || capture.practice_source_hash !== snapshot.practiceSourceHash
      || capture.practice_concept_id !== snapshot.practiceConceptId
      || conceptId !== capture.practice_concept_id
      || confirmedSourceHash !== capture.practice_source_hash
      || typeof capture.practice_source_text !== "string"
      || sourceExcerpt !== capture.practice_source_text) {
    return practiceBoundaryConflict("practice source no longer matches its assignment capture");
  }
  return true;
}

function practiceBoundaryConflict(error: string): Response {
  return json({
    error,
    reason: "practice_source_changed",
    retryable: false,
  }, 409);
}

async function practiceChallengeConflictResponse(
  adminClient: SupabaseClient,
  userId: string,
  ownerAttemptId: string | null,
): Promise<Response> {
  if (!ownerAttemptId || !UUID_PATTERN.test(ownerAttemptId)) {
    return json({
      error: "This practice result could not be confirmed. Build a new check before trying again.",
      reason: "challenge_unavailable",
      retryable: false,
    }, 409);
  }
  const { data: appliedRows, error: appliedError } = await adminClient
    .from("study_result_concept_updates")
    .select("concept_id")
    .eq("user_id", userId)
    .eq("client_attempt_id", ownerAttemptId)
    .limit(1);
  if (appliedError) return json({ error: "practice challenge could not be verified" }, 500);
  if ((appliedRows ?? []).length > 0) {
    return json({
      ok: true,
      outcome: "already-recorded",
      alreadyRecorded: true,
      reason: "challenge_already_recorded",
    });
  }
  const { data: ownerData, error } = await adminClient
    .from("study_result_attempts")
    .select("result_status, lease_started_at")
    .eq("user_id", userId)
    .eq("client_attempt_id", ownerAttemptId)
    .maybeSingle();
  if (error) return json({ error: "practice challenge could not be verified" }, 500);
  const owner = ownerData as PracticeChallengeOwnerRow | null;
  if (owner?.result_status === "processing"
      && studyAttemptDisposition(owner.result_status, owner.lease_started_at) === "wait") {
    return json({
      error: "This practice result is already being recorded",
      reason: "challenge_saving",
      retryable: true,
    }, 409);
  }
  // This response deliberately contains no prior score/readiness payload. The
  // current screen may show local answer feedback, but must never present a
  // different attempt's mastery delta as if it were newly saved.
  if (owner?.result_status === "completed") {
    return json({
      ok: true,
      outcome: "already-recorded",
      alreadyRecorded: true,
      reason: "challenge_already_recorded",
    });
  }
  return json({
    error: "This practice result could not be confirmed. Build a new check before trying again.",
    reason: "challenge_unavailable",
    retryable: false,
  }, 409);
}

function parseVerifiedPracticeGradingSnapshot(
  value: unknown,
): VerifiedPracticeGradingSnapshot | null {
  if (!isRecord(value)
      || value.version !== 1
      || typeof value.conceptId !== "string"
      || !UUID_PATTERN.test(value.conceptId)
      || !Number.isInteger(value.answerIndex)
      || (value.answerIndex as number) < 0
      || !Number.isInteger(value.choiceCount)
      || (value.choiceCount as number) < 2
      || (value.answerIndex as number) >= (value.choiceCount as number)
      || !Number.isInteger(value.selectedIndex)
      || (value.selectedIndex as number) < 0
      || (value.selectedIndex as number) >= (value.choiceCount as number)
      || !isConfidenceLevel(value.confidence)
      || typeof value.correct !== "boolean"
      || value.correct !== (value.selectedIndex === value.answerIndex)
      || typeof value.challengeFingerprint !== "string"
      || !/^[0-9a-f]{64}$/.test(value.challengeFingerprint)
      || typeof value.resultRequestHash !== "string"
      || !/^[0-9a-f]{64}$/.test(value.resultRequestHash)) {
    return null;
  }
  return value as unknown as VerifiedPracticeGradingSnapshot;
}

function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parsePracticeMasteryReservation(
  reservation: Record<string, unknown>,
): PracticeMasteryReservation {
  return {
    applied: reservation.masteryApplied === true,
    previousStrength: typeof reservation.previousStrength === "number"
      ? reservation.previousStrength
      : 0,
  };
}

async function studyResultRequestHash(
  artifactId: string,
  correct: number,
  total: number,
  perConcept: Map<string, {
    correct: boolean;
    confidence: ConfidenceLevel;
    recovered: boolean;
  }>,
  selectedIndex?: number,
  firstSelectedIndex?: number,
) {
  const canonicalResult: Record<string, unknown> = {
    artifactId,
    correct,
    total,
    perConcept: [...perConcept.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([conceptId, result]) => ({ conceptId, ...result })),
  };
  // Keep legacy hashes byte-for-byte compatible while binding a practice
  // attempt to the exact transfer choice the student submitted.
  if (selectedIndex !== undefined) canonicalResult.selectedIndex = selectedIndex;
  if (firstSelectedIndex !== undefined) canonicalResult.firstSelectedIndex = firstSelectedIndex;
  return sha256Hex(JSON.stringify(canonicalResult));
}

async function practiceResultClientRequestHash(result: {
  artifactId: string;
  selectedIndex: number;
  confidence: ConfidenceLevel;
  firstSelectedIndex: number;
  firstConfidence: ConfidenceLevel;
}) {
  return sha256Hex(JSON.stringify({
    schemaVersion: "assignment-tutor-result-v1",
    artifactId: result.artifactId,
    selectedIndex: result.selectedIndex,
    confidence: result.confidence,
    firstSelectedIndex: result.firstSelectedIndex,
    firstConfidence: result.firstConfidence,
  }));
}

async function sha256Hex(canonical: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return privateJsonResponse(body, status, corsHeaders);
}
