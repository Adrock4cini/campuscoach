// Sprint C — Feedback loop.
//
// A real student just studied a `learning_artifacts` row. Persist the
// result so the Concept memory (`user_concept_mastery`) permanently
// reflects what they now know better, and recompute class readiness.
//
// Concepts are the permanent memory. Learning artifacts are disposable
// views. We update the memory here, never the artifact.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { studyAttemptDisposition } from "../_shared/retry-integrity.ts";

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
  correct: number;
  total: number;
  durationSeconds: number;
  perConcept?: PerConcept[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENT_PROMPT_VERSION = "v9-study-intelligence";
const SUPPORTED_KINDS = new Set(["flashcards", "multiple_choice", "matching"]);

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  let parsedBody: unknown;
  try { parsedBody = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isRecord(parsedBody)) return json({ error: "JSON body must be an object" }, 400);
  const body = parsedBody as unknown as Body;

  if (typeof body.artifactId !== "string" || !UUID_PATTERN.test(body.artifactId)
      || typeof body.total !== "number" || typeof body.correct !== "number") {
    return json({ error: "artifactId, correct, total required" }, 400);
  }
  if (!Number.isInteger(body.total) || !Number.isInteger(body.correct)
      || body.total <= 0 || body.correct < 0 || body.correct > body.total) {
    return json({ error: "correct and total must be valid whole-number results" }, 400);
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
    .select("id, user_id, class_id, client_class_id, concept_ids, topic, kind, payload, prompt_version, stale, study_scope_type, study_scope_id, study_scope_label, study_scope_snapshot")
    .eq("id", body.artifactId)
    .maybeSingle();
  if (aErr) return json({ error: "artifact load failed", details: aErr.message }, 500);
  if (!artifact) return json({ error: "artifact not found" }, 404);
  if (artifact.stale || artifact.prompt_version !== CURRENT_PROMPT_VERSION
      || !SUPPORTED_KINDS.has(artifact.kind)) {
    return json({ error: "This study set must be refreshed before results can be saved" }, 409);
  }

  const itemConceptIds = artifactItemConceptIds(artifact.kind, artifact.payload);
  if (!itemConceptIds) return json({ error: "study set payload is invalid" }, 409);
  const minimumItems = artifact.kind === "matching" ? 3 : 1;
  const maximumItems = artifact.kind === "matching" ? 6 : 8;
  if (itemConceptIds.length < minimumItems || itemConceptIds.length > maximumItems) {
    return json({ error: "study set item count is invalid" }, 409);
  }
  if (!Array.isArray(artifact.concept_ids)
      || artifact.concept_ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return json({ error: "study set concepts are invalid" }, 409);
  }
  const conceptIds: string[] = [...new Set<string>(artifact.concept_ids)];
  if (conceptIds.length !== itemConceptIds.length
      || conceptIds.some((id) => !itemConceptIds.includes(id))) {
    return json({ error: "study set concepts do not match its questions" }, 409);
  }
  if (body.total !== itemConceptIds.length) {
    return json({ error: "total does not match this study set" }, 400);
  }

  // 2. Load concepts to resolve real (uuid) class_id.
  const { data: concepts, error: cErr } = await supabase
    .from("concepts")
    .select("id, class_id, client_class_id")
    .eq("user_id", userId)
    .in("id", conceptIds);
  if (cErr) return json({ error: "concept load failed", details: cErr.message }, 500);
  if (!concepts || concepts.length !== conceptIds.length) {
    return json({ error: "study set contains unavailable concepts" }, 409);
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

  const scorePct = body.total > 0 ? Math.round((body.correct / body.total) * 100) : 0;

  // Validate all student-supplied result details before reserving an attempt.
  // A rejected body must never leave a durable session stuck in `processing`.
  const perMap = new Map<string, {
    correct: boolean;
    confidence: ConfidenceLevel;
    recovered: boolean;
  }>();
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
  if (conceptIds.some((id) => !perMap.has(id))
      || [...perMap.values()].filter((result) => result.correct).length !== body.correct) {
    return json({ error: "correct and perConcept results do not match" }, 400);
  }

  const requestHash = await studyResultRequestHash(body.artifactId, body.correct, body.total, perMap);
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

  const claimedAt = new Date().toISOString();
  const leaseToken = crypto.randomUUID();
  const { data: priorAttempt, error: priorErr } = await adminClient
    .from("study_result_attempts")
    .select("user_id, client_attempt_id, artifact_id, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at")
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .maybeSingle();
  if (priorErr) return json({ error: "attempt lookup failed", details: priorErr.message }, 500);

  let attempt: {
    artifact_id: string;
    result_status: string;
    result_payload: unknown;
    result_request_hash: string;
    lease_token: string;
    lease_started_at: string;
    duration_seconds: number;
    session_id: string | null;
    completed_at: string | null;
  } | null = null;
  if (priorAttempt) {
    if (priorAttempt.artifact_id !== body.artifactId
        || priorAttempt.result_request_hash !== requestHash) {
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
      .select("artifact_id, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at")
      .maybeSingle();
    if (reclaimError) return json({ error: "attempt reclaim failed", details: reclaimError.message }, 500);
    if (!reclaimed) {
      return json({ error: "study result is already being retried", retryable: true }, 409);
    }
    attempt = reclaimed;
  } else {
    const { data: insertedAttempt, error: attemptInsertError } = await adminClient
      .from("study_result_attempts")
      .insert({
        user_id: userId,
        client_attempt_id: attemptId,
        artifact_id: artifact.id,
        result_request_hash: requestHash,
        result_status: "processing",
        lease_token: leaseToken,
        lease_started_at: claimedAt,
        duration_seconds: Math.trunc(body.durationSeconds),
      })
      .select("artifact_id, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at")
      .single();
    if (attemptInsertError) {
      if (attemptInsertError.code === "23505") {
        return json({ error: "study result is already being saved", retryable: true }, 409);
      }
      return json({ error: "attempt reservation failed", details: attemptInsertError.message }, 500);
    }
    attempt = insertedAttempt;
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
      return json({ error: "session lookup failed", details: linkedSessionError.message }, 500);
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
        return json({ error: "session recovery failed", details: recoveredSessionError.message }, 500);
      }
      session = recoveredSession;
    } else if (sessionInsertError) {
      return json({ error: "session insert failed", details: sessionInsertError.message }, 500);
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
    if (linkError) return json({ error: "attempt history link failed", details: linkError.message }, 500);
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
  for (const conceptId of conceptIds) {
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
      return json({ error: "mastery update failed", details: applyErr.message }, 500);
    }
    const result = applied as {
      applied?: boolean;
      previousStrength?: number | null;
    } | null;
    appliedAny = appliedAny || result?.applied === true;
    previousStrengthByConcept.set(conceptId, Number(result?.previousStrength) || 0);
  }

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
    let classConceptIds: string[] = conceptIds;
    if (!realClassId && clientClassId) {
      const { data: classConcepts } = await supabase
        .from("concepts")
        .select("id")
        .eq("user_id", userId)
        .eq("client_class_id", clientClassId);
      const fetchedIds = (classConcepts ?? []).map((concept) => concept.id as string);
      if (fetchedIds.length) classConceptIds = fetchedIds;
    }

    let masteryQuery = supabase
      .from("user_concept_mastery")
      .select("concept_id, strength")
      .eq("user_id", userId);
    const isExamScope = artifact.study_scope_type === "exam";
    masteryQuery = isExamScope
      ? masteryQuery.in("concept_id", conceptIds)
      : realClassId
        ? masteryQuery.eq("class_id", realClassId)
        : masteryQuery.in("concept_id", classConceptIds);
    const { data: masteryAll } = await masteryQuery;
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
      if (appliedAny) {
        await adminClient.from("readiness_scores").insert({
          user_id: userId,
          class_id: realClassId,
          client_class_id: clientClassId,
          readiness,
          computed_at: now.toISOString(),
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
  if (appliedAny && artifact.topic && (realClassId || clientClassId)) {
    await adminClient.from("topic_signals").insert({
      user_id: userId,
      class_id: (realClassId ?? clientClassId) as string,
      topic_id: artifact.topic,
      topic_name: artifact.topic,
      accuracy: scorePct,
      incorrect_count: Math.max(0, body.total - body.correct),
      time_spent_minutes: attemptDurationMinutes,
      source_type: "study-session",
      source_id: session.id,
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
});

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

async function studyResultRequestHash(
  artifactId: string,
  correct: number,
  total: number,
  perConcept: Map<string, {
    correct: boolean;
    confidence: ConfidenceLevel;
    recovered: boolean;
  }>,
) {
  const canonical = JSON.stringify({
    artifactId,
    correct,
    total,
    perConcept: [...perConcept.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([conceptId, result]) => ({ conceptId, ...result })),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
