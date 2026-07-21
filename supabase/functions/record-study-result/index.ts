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

interface PerConcept {
  conceptId: string;
  correct: boolean;
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

  if (!body.artifactId || typeof body.total !== "number" || typeof body.correct !== "number") {
    return json({ error: "artifactId, correct, total required" }, 400);
  }
  if (!Number.isInteger(body.total) || !Number.isInteger(body.correct)
      || body.total <= 0 || body.correct < 0 || body.correct > body.total) {
    return json({ error: "correct and total must be valid whole-number results" }, 400);
  }
  if (body.attemptId && !UUID_PATTERN.test(body.attemptId)) {
    return json({ error: "attemptId must be a UUID" }, 400);
  }

  // The client reuses this id after a lost response. Older clients remain
  // compatible, but only current clients can safely identify their retry.
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
    .select("id, user_id, class_id, client_class_id, concept_ids, topic, kind, study_scope_type, study_scope_id, study_scope_label, study_scope_snapshot")
    .eq("id", body.artifactId)
    .maybeSingle();
  if (aErr) return json({ error: "artifact load failed", details: aErr.message }, 500);
  if (!artifact) return json({ error: "artifact not found" }, 404);

  const conceptIds: string[] = [...new Set<string>(artifact.concept_ids ?? [])];
  if (conceptIds.length === 0) return json({ error: "artifact has no concepts" }, 400);

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

  const scorePct = body.total > 0 ? Math.round((body.correct / body.total) * 100) : 0;
  const durationMinutes = Math.max(1, Math.round((body.durationSeconds ?? 0) / 60));

  // 3. Reserve the attempt before changing mastery. The unique user+attempt
  // key is the durable barrier that makes a mobile retry safe.
  let session: { id: string } | null = null;
  if (resumedSessionId && resumedSessionStatus) {
    const expectedState = resumedSessionStatus === "processing" && resumedStartedAt
      ? { result_status: resumedSessionStatus, started_at: resumedStartedAt }
      : { result_status: resumedSessionStatus };
    const { data: claimed } = await supabase
      .from("study_sessions")
      .update({ result_status: "processing", started_at: new Date().toISOString() })
      .eq("id", resumedSessionId)
      .eq("user_id", userId)
      .match(expectedState)
      .select("id")
      .maybeSingle();
    if (!claimed) return json({ error: "study result is already being retried", retryable: true }, 409);
    session = claimed;
  }
  if (!session) {
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
    session = insertedSession;
  }

  // 4. Update user_concept_mastery per concept.
  // Per-concept results if provided; otherwise apply overall pass/fail to each.
  const perMap = new Map<string, boolean>();
  const overallCorrect = body.correct / body.total >= 0.5;
  if (body.perConcept?.length) {
    const allowed = new Set(conceptIds);
    for (const p of body.perConcept) {
      if (allowed.has(p.conceptId)) perMap.set(p.conceptId, !!p.correct);
    }
  }
  // Legacy artifacts cannot always attribute an item. Preserve the old
  // aggregate behavior only for concepts that were not individually scored.
  for (const id of conceptIds) {
    if (!perMap.has(id)) perMap.set(id, overallCorrect);
  }

  const now = new Date();
  const previousStrengthByConcept = new Map<string, number>();
  let appliedAny = false;
  for (const conceptId of conceptIds) {
    const { data: applied, error: applyErr } = await supabase.rpc(
      "apply_study_concept_result",
      {
        p_attempt_id: attemptId,
        p_concept_id: conceptId,
        p_class_id: realClassId,
        p_correct: perMap.get(conceptId) ?? false,
        p_seen_at: now.toISOString(),
      },
    );
    if (applyErr) {
      await supabase
        .from("study_sessions")
        .update({ result_status: "failed" })
        .eq("id", session.id)
        .eq("user_id", userId);
      return json({ error: "mastery update failed", details: applyErr.message }, 500);
    }
    const result = applied as {
      applied?: boolean;
      previousStrength?: number | null;
    } | null;
    appliedAny = appliedAny || result?.applied === true;
    previousStrengthByConcept.set(conceptId, Number(result?.previousStrength) || 0);
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
        await supabase.from("readiness_scores").insert({
          user_id: userId,
          class_id: realClassId,
          client_class_id: clientClassId,
          readiness,
          computed_at: now.toISOString(),
        });
      }
      if (isExamScope && artifact.study_scope_id) {
        await supabase
          .from("exams")
          .update({ readiness })
          .eq("user_id", userId)
          .eq("id", artifact.study_scope_id);
      }
    }
  }

  // 6. Optional topic_signal (best-effort, non-fatal).
  if (appliedAny && artifact.topic && (realClassId || clientClassId)) {
    await supabase.from("topic_signals").insert({
      user_id: userId,
      class_id: (realClassId ?? clientClassId) as string,
      topic_id: artifact.topic,
      topic_name: artifact.topic,
      accuracy: scorePct,
      incorrect_count: Math.max(0, body.total - body.correct),
      time_spent_minutes: durationMinutes,
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
  };

  // Cache the response last. If this update or the HTTP response is lost,
  // the attempt row still prevents a second mastery update.
  await supabase
    .from("study_sessions")
    .update({
      result_status: "completed",
      result_payload: resultPayload,
      ended_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("user_id", userId);

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
    updatedConcepts: 0,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
