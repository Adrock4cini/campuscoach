// Item-level v2 feedback loop. During cutover, deploy this implementation only
// through record-study-result-v2 so the already-deployed v1 endpoint remains
// available to older open tabs until its drain window ends.
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
import {
  artifactItems,
  sameSavedItemResults,
  validArtifactItemResults,
  validItemResult,
  type ItemResult,
} from "../_shared/study-item-results.ts";

interface Body {
  attemptId?: string;
  artifactId: string;
  durationSeconds: number;
  itemResults: ItemResult[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const jwt = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(jwt);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.artifactId) return json({ error: "artifactId required" }, 400);
  if (!UUID_PATTERN.test(body.artifactId)) {
    return json({ error: "artifactId must be a UUID" }, 400);
  }
  if (!Number.isFinite(body.durationSeconds) || body.durationSeconds < 0
      || body.durationSeconds > 86_400) {
    return json({ error: "durationSeconds must be between 0 and 86400" }, 400);
  }
  if (!Array.isArray(body.itemResults) || !body.itemResults.length
      || body.itemResults.some((item) => !validItemResult(item))) {
    return json({ error: "itemResults must contain valid item responses" }, 400);
  }
  if (body.attemptId && !UUID_PATTERN.test(body.attemptId)) {
    return json({ error: "attemptId must be a UUID" }, 400);
  }

  // The client reuses this id after a lost response. Exact retries return the
  // cached result; changing an answer under the same id is rejected.
  const attemptId = body.attemptId ?? crypto.randomUUID();
  let resumedSessionId: string | null = null;
  let resumedSessionStatus: string | null = null;
  let resumedStartedAt: string | null = null;
  const { data: priorAttempt, error: priorErr } = await supabase
    .from("study_sessions")
    .select("id, artifact_id, result_status, result_payload, started_at")
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .maybeSingle();
  if (priorErr) return json({ error: "attempt lookup failed", details: priorErr.message }, 500);
  if (priorAttempt) {
    if (priorAttempt.artifact_id && priorAttempt.artifact_id !== body.artifactId) {
      return json({ error: "attemptId already belongs to another study set" }, 409);
    }
    const disposition = studyAttemptDisposition(priorAttempt.result_status, priorAttempt.started_at);
    if (disposition === "return-cached") {
      const { data: savedItems, error: savedItemsErr } = await supabase
        .from("study_item_results")
        .select("item_index, answer_confidence, selected_choice_index, self_reported_correct")
        .eq("user_id", userId)
        .eq("client_attempt_id", attemptId)
        .order("item_index", { ascending: true });
      if (savedItemsErr) {
        return json({ error: "saved item lookup failed", details: savedItemsErr.message }, 500);
      }
      if (!sameSavedItemResults(body.itemResults, savedItems ?? [])) {
        return json({ error: "attemptId was already completed with different answers" }, 409);
      }
      return json(cachedStudyResult(priorAttempt));
    }
    if (disposition === "wait") {
      return json({ error: "study result is still saving", retryable: true }, 409);
    }
    // Claim an interrupted attempt only after all read-only artifact
    // validation succeeds below. Per-concept database markers make the
    // resumed operation safe regardless of where the first request stopped.
    resumedSessionId = priorAttempt.id;
    resumedSessionStatus = priorAttempt.result_status;
    resumedStartedAt = priorAttempt.started_at;
  }

  // 1. Load artifact (RLS enforces ownership).
  const { data: artifact, error: aErr } = await supabase
    .from("learning_artifacts")
    .select("id, user_id, class_id, client_class_id, concept_ids, topic, kind, payload, study_scope_type, study_scope_id, study_scope_label, study_scope_snapshot")
    .eq("id", body.artifactId)
    .maybeSingle();
  if (aErr) return json({ error: "artifact load failed", details: aErr.message }, 500);
  if (!artifact) return json({ error: "artifact not found" }, 404);

  const conceptIds: string[] = [...new Set<string>(artifact.concept_ids ?? [])];
  if (conceptIds.length === 0) return json({ error: "artifact has no concepts" }, 400);

  const storedItems = artifactItems(artifact.kind, artifact.payload);
  if (!storedItems?.length || storedItems.length !== body.itemResults.length) {
    return json({ error: "complete item results required" }, 400);
  }
  const sortedItemResults = [...body.itemResults].sort((a, b) => a.itemIndex - b.itemIndex);
  if (!validArtifactItemResults(
    artifact.kind,
    storedItems,
    conceptIds,
    sortedItemResults,
  )) {
    return json({ error: "stored study set or item responses are invalid" }, 400);
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

  const realClassIds = new Set(concepts.map((concept) => concept.class_id).filter(Boolean));
  const clientClassIds = new Set(concepts.map((concept) => concept.client_class_id).filter(Boolean));
  if (realClassIds.size > 1 || clientClassIds.size > 1) {
    return json({ error: "study set crosses class boundaries" }, 409);
  }

  const realClassId: string | null = concepts.find((c) => c.class_id)?.class_id ?? null;
  const clientClassId: string | null =
    concepts.find((c) => c.client_class_id)?.client_class_id ?? artifact.client_class_id ?? null;
  if ((artifact.class_id && realClassId && artifact.class_id !== realClassId)
      || (artifact.client_class_id && clientClassId && artifact.client_class_id !== clientClassId)) {
    return json({ error: "study set class does not match its concepts" }, 409);
  }

  // Do not resume a partially applied legacy concept summary through the new
  // per-item contract. Starting a fresh attempt is safer than double-grading.
  if (resumedSessionId) {
    const { data: legacyRows, error: legacyErr } = await supabase
      .from("study_result_concept_updates")
      .select("concept_id")
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .limit(1);
    if (legacyErr) return json({ error: "legacy attempt lookup failed", details: legacyErr.message }, 500);
    if (legacyRows?.length) {
      return json({ error: "This older study save cannot be resumed. Start a new session." }, 409);
    }
  }

  let effectiveCorrect = 0;
  const effectiveTotal = sortedItemResults.length;
  let scorePct: number | null = null;
  const durationMinutes = Math.max(1, Math.round((body.durationSeconds ?? 0) / 60));

  // 3. Reserve the attempt before changing mastery. The unique user+attempt
  // key is the durable barrier that makes a mobile retry safe.
  let session: { id: string; leaseStartedAt: string } | null = null;
  if (resumedSessionId && resumedSessionStatus) {
    const leaseStartedAt = new Date().toISOString();
    const expectedState = resumedSessionStatus === "processing" && resumedStartedAt
      ? { result_status: resumedSessionStatus, started_at: resumedStartedAt }
      : { result_status: resumedSessionStatus };
    const { data: claimed } = await supabase
      .from("study_sessions")
      .update({ result_status: "processing", started_at: leaseStartedAt })
      .eq("id", resumedSessionId)
      .eq("user_id", userId)
      .match(expectedState)
      .select("id")
      .maybeSingle();
    if (!claimed) return json({ error: "study result is already being retried", retryable: true }, 409);
    session = { id: claimed.id, leaseStartedAt };
  }
  if (!session) {
    const leaseStartedAt = new Date().toISOString();
    const { data: insertedSession, error: sErr } = await supabase
      .from("study_sessions")
      .insert({
        user_id: userId,
        artifact_id: artifact.id,
        client_attempt_id: attemptId,
        result_status: "processing",
        class_id: realClassId,
        client_class_id: clientClassId,
        mode: `artifact:${artifact.kind}`,
        duration_minutes: durationMinutes,
        score: scorePct,
        topic: artifact.topic ?? null,
        study_scope_type: artifact.study_scope_type ?? "class",
        study_scope_id: artifact.study_scope_id ?? "class",
        study_scope_label: artifact.study_scope_label ?? null,
        study_scope_snapshot: artifact.study_scope_snapshot ?? {},
        started_at: leaseStartedAt,
        ended_at: null,
      })
      .select("id")
      .single();
    if (sErr) {
      if (sErr.code === "23505") {
        return json({ error: "study result is already being saved", retryable: true }, 409);
      }
      return json({ error: "session insert failed", details: sErr.message }, 500);
    }
    session = { id: insertedSession.id, leaseStartedAt };
  }

  // 4. Apply every item separately. The RPC derives concept attribution and
  // objective correctness from the stored artifact.
  const now = new Date();
  const previousStrengthByConcept = new Map<string, number>();
  const updatedConceptIds = new Set<string>();
  for (const item of sortedItemResults) {
    const { data: applied, error: applyErr } = await supabase.rpc(
      "apply_study_item_result",
      {
        p_attempt_id: attemptId,
        p_item_index: item.itemIndex,
        p_confidence: item.confidence,
        p_selected_choice_index: item.selectedChoiceIndex ?? null,
        p_self_reported_correct: item.selfReportedCorrect ?? null,
      },
    );
    if (applyErr) {
      await supabase
        .from("study_sessions")
        .update({ result_status: "failed" })
        .eq("id", session.id)
        .eq("user_id", userId)
        .eq("result_status", "processing")
        .eq("started_at", session.leaseStartedAt);
      const changedRetry = applyErr.message?.includes("retry payload changed");
      return json(
        { error: changedRetry ? "study item retry changed" : "mastery update failed", details: applyErr.message },
        changedRetry ? 409 : 500,
      );
    }
    const result = applied as {
      applied?: boolean;
      conceptId?: string;
      correct?: boolean;
      previousStrength?: number | null;
    } | null;
    if (!result?.conceptId || !conceptIds.includes(result.conceptId)
        || typeof result.correct !== "boolean") {
      await supabase
        .from("study_sessions")
        .update({ result_status: "failed" })
        .eq("id", session.id)
        .eq("user_id", userId)
        .eq("result_status", "processing")
        .eq("started_at", session.leaseStartedAt);
      return json({ error: "mastery update returned invalid evidence" }, 500);
    }
    effectiveCorrect += result.correct ? 1 : 0;
    updatedConceptIds.add(result.conceptId);
    if (!previousStrengthByConcept.has(result.conceptId)) {
      previousStrengthByConcept.set(
        result.conceptId,
        Number(result.previousStrength) || 0,
      );
    }
  }
  scorePct = Math.round((effectiveCorrect / effectiveTotal) * 100);

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
        if (!updatedConceptIds.has(conceptId)) return Number(row.strength) || 0;
        return previousStrengthByConcept.get(conceptId) ?? 0;
      });
      const beforeAvg = beforeVals.reduce((a, b) => a + b, 0) / beforeVals.length;
      readinessBefore = Math.round(clamp(beforeAvg, 0, 1) * 100);
    }
  }

  const resultPayload = {
    ok: true,
    sessionId: session.id,
    readiness,
    readinessBefore,
    readinessDelta: readiness !== null && readinessBefore !== null
      ? readiness - readinessBefore
      : null,
    updatedItems: sortedItemResults.length,
    updatedConcepts: updatedConceptIds.size,
  };

  // Cache the response last. If this update or the HTTP response is lost,
  // the attempt row still prevents a second mastery update.
  const { data: completedSession, error: completionErr } = await supabase
    .from("study_sessions")
    .update({
      result_status: "completed",
      result_payload: resultPayload,
      score: scorePct,
      ended_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .eq("result_status", "processing")
    .eq("started_at", session.leaseStartedAt)
    .select("id")
    .maybeSingle();
  if (completionErr || !completedSession) {
    return json({
      error: "study result completion failed",
      details: completionErr?.message,
      retryable: true,
    }, 500);
  }

  // Only the worker that won the completion compare-and-swap emits derived
  // snapshots/signals. A lost-response retry returns the cached payload and
  // cannot duplicate these rows.
  if (readiness !== null) {
    await supabase.from("readiness_scores").insert({
      user_id: userId,
      class_id: realClassId,
      client_class_id: clientClassId,
      readiness,
      computed_at: now.toISOString(),
    }).then(() => {}, () => {});

    if (artifact.study_scope_type === "exam" && artifact.study_scope_id) {
      await supabase
        .from("exams")
        .update({ readiness })
        .eq("user_id", userId)
        .eq("id", artifact.study_scope_id)
        .then(() => {}, () => {});
    }
  }

  if (artifact.topic && (realClassId || clientClassId)) {
    await supabase.from("topic_signals").insert({
      user_id: userId,
      class_id: (realClassId ?? clientClassId) as string,
      topic_id: artifact.topic,
      topic_name: artifact.topic,
      accuracy: scorePct ?? 0,
      incorrect_count: Math.max(0, effectiveTotal - effectiveCorrect),
      time_spent_minutes: durationMinutes,
      source_type: "study-session",
      source_id: session.id,
    }).then(() => {}, () => {});
  }

  return json(resultPayload);
});

function cachedStudyResult(attempt: {
  id: string;
  result_payload?: unknown;
}) {
  const payload = attempt.result_payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  return {
    ok: true,
    sessionId: attempt.id,
    recovered: true,
    readiness: null,
    readinessBefore: null,
    readinessDelta: null,
    updatedItems: 0,
    updatedConcepts: 0,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
