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

interface PerConcept {
  conceptId: string;
  correct: boolean;
}

interface Body {
  artifactId: string;
  correct: number;
  total: number;
  durationSeconds: number;
  perConcept?: PerConcept[];
}

const STRENGTH_UP = 0.15;
const STRENGTH_DOWN = 0.1;
const MAX_INTERVAL_HOURS = 24 * 30;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function nextInterval(correct: boolean, streak: number) {
  if (!correct) return 4;
  return Math.min(MAX_INTERVAL_HOURS, 24 * Math.pow(2, Math.max(0, streak - 1)));
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

  // 1. Load artifact (RLS enforces ownership).
  const { data: artifact, error: aErr } = await supabase
    .from("learning_artifacts")
    .select("id, user_id, class_id, concept_ids, topic, kind")
    .eq("id", body.artifactId)
    .maybeSingle();
  if (aErr) return json({ error: "artifact load failed", details: aErr.message }, 500);
  if (!artifact) return json({ error: "artifact not found" }, 404);

  const conceptIds: string[] = artifact.concept_ids ?? [];
  if (conceptIds.length === 0) return json({ error: "artifact has no concepts" }, 400);

  // 2. Load concepts to resolve real (uuid) class_id.
  const { data: concepts, error: cErr } = await supabase
    .from("concepts")
    .select("id, class_id, client_class_id")
    .eq("user_id", userId)
    .in("id", conceptIds);
  if (cErr) return json({ error: "concept load failed", details: cErr.message }, 500);
  if (!concepts || concepts.length === 0) return json({ error: "concepts not found" }, 404);

  const realClassId: string | null = concepts.find((c) => c.class_id)?.class_id ?? null;
  const clientClassId: string | null =
    concepts.find((c) => c.client_class_id)?.client_class_id ?? artifact.class_id ?? null;

  const scorePct = body.total > 0 ? Math.round((body.correct / body.total) * 100) : 0;
  const durationMinutes = Math.max(1, Math.round((body.durationSeconds ?? 0) / 60));

  // 3. Insert study_sessions row.
  const { data: session, error: sErr } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      class_id: realClassId,
      client_class_id: clientClassId,
      mode: `artifact:${artifact.kind}`,
      duration_minutes: durationMinutes,
      score: scorePct,
      topic: artifact.topic ?? null,
      ended_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (sErr) return json({ error: "session insert failed", details: sErr.message }, 500);

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

  // Load existing mastery rows.
  const { data: existing } = await supabase
    .from("user_concept_mastery")
    .select("id, concept_id, attempts, correct, strength, streak")
    .eq("user_id", userId)
    .in("concept_id", conceptIds);
  const prevBy = new Map<string, { attempts: number; correct: number; strength: number; streak: number }>();
  for (const row of existing ?? []) prevBy.set(row.concept_id as string, row as never);

  const now = new Date();
  const rows = conceptIds.map((cid) => {
    const correct = perMap.get(cid) ?? false;
    const prev = prevBy.get(cid) ?? { attempts: 0, correct: 0, strength: 0, streak: 0 };
    const attempts = prev.attempts + 1;
    const correctCount = prev.correct + (correct ? 1 : 0);
    const strength = clamp(prev.strength + (correct ? STRENGTH_UP : -STRENGTH_DOWN), 0, 1);
    const streak = correct ? prev.streak + 1 : 0;
    const hours = nextInterval(correct, streak);
    const next = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
    return {
      user_id: userId,
      concept_id: cid,
      class_id: realClassId,
      attempts,
      correct: correctCount,
      strength,
      streak,
      last_seen_at: now.toISOString(),
      next_review_at: next,
    };
  });

  const { error: uErr } = await supabase
    .from("user_concept_mastery")
    .upsert(rows, { onConflict: "user_id,concept_id" });
  if (uErr) return json({ error: "mastery upsert failed", details: uErr.message }, 500);

  // 5. Recompute class readiness from mastery.
  let readiness = 0;
  if (realClassId) {
    const { data: masteryAll } = await supabase
      .from("user_concept_mastery")
      .select("strength")
      .eq("user_id", userId)
      .eq("class_id", realClassId);
    const vals = (masteryAll ?? []).map((r) => Number(r.strength) || 0);
    if (vals.length) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      readiness = Math.round(clamp(avg, 0, 1) * 100);
    }
    await supabase.from("readiness_scores").insert({
      user_id: userId,
      class_id: realClassId,
      client_class_id: clientClassId,
      readiness,
      computed_at: now.toISOString(),
    });
  }

  // 6. Optional topic_signal (best-effort, non-fatal).
  if (artifact.topic && (realClassId || clientClassId)) {
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

  return json({
    ok: true,
    sessionId: session.id,
    readiness,
    updatedConcepts: rows.length,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
