// Extract structured concepts from a capture (text/transcript/OCR) and
// persist them to `concepts` + upsert `user_concept_mastery`.
// Uses Lovable AI Gateway (Gemini 2.5 flash) for extraction and OpenAI
// text-embedding-3-small for the semantic embedding.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { extractExactThinSource } from "../_shared/thin-source.ts";
import { assessSourceSufficiency } from "../_shared/grounding-quality.ts";

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

const SYSTEM = `You extract the concrete concepts a college student needs to remember from a class capture (lecture note, board photo, textbook page, quick note, or professor hint).

Return ONLY JSON matching:
{
  "summary": string,               // 1-2 sentences describing what was learned
  "concepts": [
    {
      "name": string,              // 2-6 word concept title, Title Case
      "definition": string|null,   // 1-2 sentence definition in student-friendly language
      "examples": string[],        // 0-3 short worked examples or applications
      "professor_emphasis": bool   // true if the instructor flagged this as important / on the exam
    }
  ]
}
Rules:
- Return 0-8 concepts. Never invent content not present in the source.
- If the source does not support a concrete academic concept, return an empty concepts array.
- If input is a professor hint, mark every concept professor_emphasis=true.
- If the source is thin, return fewer concepts rather than padding.
- A single equation or factual statement should normally become exactly one concept that preserves the source wording.
- Do not replace a concrete fact with an umbrella label such as "Addition Fact" unless that label appears in the source.
- No prose outside the JSON.`;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "concept";

const EXTRACTION_CLAIM_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const key = Deno.env.get("LOVABLE_API_KEY");

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

  // A durable capture is the source of truth on retries. This prevents a
  // changed client payload from attaching different material to the same
  // capture after a mobile response is lost.
  let capture: {
    id: string;
    class_id: string | null;
    client_class_id: string | null;
    raw_text: string | null;
  } | null = null;
  if (body.captureId) {
    const { data: ownedCapture, error: captureErr } = await supabase
      .from("captures")
      .select("id, class_id, client_class_id, raw_text")
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (captureErr) return json({ error: "capture lookup failed", details: captureErr.message }, 500);
    if (!ownedCapture) return json({ error: "capture not found" }, 404);
    capture = ownedCapture;
  }

  const rawText = (capture?.raw_text ?? body.rawText ?? "").trim();
  if (!rawText) return json({ error: "rawText required" }, 400);
  if (!assessSourceSufficiency(rawText).sufficient) {
    return insufficientSource();
  }

  // Resolve the student's stable client class id to the real classes.id UUID.
  // Both identifiers travel through the pipeline: the client id drives routes,
  // while the UUID anchors mastery/readiness foreign keys.
  let resolvedClassId = capture?.class_id ?? body.classId ?? null;
  let resolvedClientClassId = capture?.client_class_id ?? body.clientClassId ?? null;
  if (resolvedClientClassId) {
    const { data: ownedClass, error: classErr } = await supabase
      .from("classes")
      .select("id, client_class_id")
      .eq("user_id", userId)
      .eq("client_class_id", resolvedClientClassId)
      .maybeSingle();
    if (classErr) return json({ error: "class lookup failed", details: classErr.message }, 500);
    if (!ownedClass) return json({ error: "class not found" }, 404);
    resolvedClassId = ownedClass.id;
    resolvedClientClassId = ownedClass.client_class_id;
  }

  // If a previous request inserted the concepts but its response or final
  // status update was lost, repair the remaining derived rows and return the
  // original concepts. Never ask the AI to create a second set.
  if (body.captureId) {
    const { data: existingConcepts, error: existingErr } = await supabase
      .from("concepts")
      .select("id, class_id, name, definition, examples, professor_emphasis")
      .eq("user_id", userId)
      .eq("capture_id", body.captureId)
      .order("created_at", { ascending: true });
    if (existingErr) return json({ error: "existing concepts lookup failed", details: existingErr.message }, 500);
    if (existingConcepts?.length) {
      const existingIds = existingConcepts.map((concept) => concept.id as string);
      const { data: masteryRows, error: masteryLookupErr } = await supabase
        .from("user_concept_mastery")
        .select("concept_id")
        .eq("user_id", userId)
        .in("concept_id", existingIds);
      if (masteryLookupErr) {
        return json({ error: "mastery recovery lookup failed", details: masteryLookupErr.message }, 500);
      }
      const mastered = new Set((masteryRows ?? []).map((row) => row.concept_id as string));
      const missingMastery = existingConcepts
        .filter((concept) => !mastered.has(concept.id as string))
        .map((concept) => ({
          user_id: userId,
          concept_id: concept.id,
          class_id: concept.class_id,
          strength: 0.15,
          attempts: 0,
          correct: 0,
          last_seen_at: new Date().toISOString(),
          next_review_at: new Date().toISOString(),
          streak: 0,
        }));
      if (missingMastery.length) {
        const { error: recoveryErr } = await supabase
          .from("user_concept_mastery")
          .insert(missingMastery);
        if (recoveryErr) return json({ error: "mastery recovery failed", details: recoveryErr.message }, 500);
      }

      const { data: processedRows, error: processedLookupErr } = await supabase
        .from("processed_content")
        .select("summary")
        .eq("user_id", userId)
        .eq("capture_id", body.captureId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (processedLookupErr) {
        return json({ error: "processed content recovery lookup failed", details: processedLookupErr.message }, 500);
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
          return json({ error: "processed content recovery failed", details: processedRecoveryErr.message }, 500);
        }
      }

      const { error: captureRecoveryErr } = await supabase
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
        .eq("user_id", userId);
      if (captureRecoveryErr) {
        return json({ error: "capture recovery failed", details: captureRecoveryErr.message }, 500);
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

  // Only one request may send this capture to paid AI services at a time.
  // A stale claim can be recovered after five minutes.
  if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);
  let claimId: string | null = null;
  if (body.captureId) {
    claimId = crypto.randomUUID();
    const staleBefore = new Date(Date.now() - EXTRACTION_CLAIM_MS).toISOString();
    const { data: claimedCapture, error: claimErr } = await supabase
      .from("captures")
      .update({
        concept_extraction_claim_id: claimId,
        concept_extraction_started_at: new Date().toISOString(),
        processing_status: "processing",
      })
      .eq("id", body.captureId)
      .eq("user_id", userId)
      .or(`concept_extraction_claim_id.is.null,concept_extraction_started_at.lt.${staleBefore}`)
      .select("id")
      .maybeSingle();
    if (claimErr) return json({ error: "extraction claim failed", details: claimErr.message }, 500);
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
    await supabase
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

  const userPrompt = [
    body.className ? `Class: ${body.className}` : null,
    body.topic ? `Topic: ${body.topic}` : null,
    body.kind ? `Source kind: ${body.kind}` : null,
    "---",
    rawText.slice(0, 12000),
  ].filter(Boolean).join("\n");

  // 1. Extract concepts. Preserve simple numeric facts exactly; asking a
  // language model to interpret "2+2=4" previously inflated it into vague,
  // invented concepts such as "Addition Fact".
  const exactThinSource = extractExactThinSource(
    rawText,
    body.kind === "professor-hint",
  );
  let summary = exactThinSource?.summary ?? "";
  let concepts: ExtractedConcept[] = exactThinSource?.concepts ?? [];

  if (!exactThinSource) {
    let gwRes: Response;
    try {
      gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (error) {
      await releaseClaimAsFailed();
      const details = error instanceof Error ? error.message : "AI gateway unavailable";
      return json({ error: "extraction failed", details }, 502);
    }
    if (!gwRes.ok) {
      const details = await gwRes.text();
      await releaseClaimAsFailed();
      return json({ error: "extraction failed", status: gwRes.status, details }, gwRes.status);
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

  if (!concepts.length) {
    await releaseClaimAsFailed();
    return insufficientSource();
  }

  // 2. Embed each concept name+definition
  const texts = concepts.map((c) => `${c.name}. ${c.definition ?? ""}`.trim());
  let embeddings: number[][] = [];
  if (texts.length) {
    try {
      const emRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
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

  // 3. Upsert concepts + mastery
  const nowIso = new Date().toISOString();
  const conceptRows = concepts.map((c, i) => ({
    user_id: userId,
    class_id: resolvedClassId,
    client_class_id: resolvedClientClassId,
    capture_id: body.captureId ?? null,
    name: c.name,
    slug: slugify(c.name),
    definition: c.definition ?? null,
    examples: c.examples ?? [],
    professor_emphasis: !!c.professor_emphasis || body.kind === "professor-hint",
    embedding: embeddings[i] ? (embeddings[i] as unknown as string) : null,
    source_kind: body.kind ?? null,
  }));

  let insertedIds: string[] = [];
  if (conceptRows.length) {
    const { data: inserted, error: insErr } = await supabase
      .from("concepts")
      .insert(conceptRows)
      .select("id, class_id");
    if (insErr) {
      await releaseClaimAsFailed();
      return json({ error: "concepts insert failed", details: insErr.message }, 500);
    }
    insertedIds = (inserted ?? []).map((r: { id: string }) => r.id);

    // seed mastery at strength 0.15 (exposed, not yet learned)
    const masteryRows = (inserted ?? []).map((r: { id: string; class_id: string | null }) => ({
      user_id: userId,
      concept_id: r.id,
      class_id: r.class_id,
      strength: 0.15,
      attempts: 0,
      correct: 0,
      last_seen_at: nowIso,
      next_review_at: nowIso,
      streak: 0,
    }));
    if (masteryRows.length) {
      const { error: masteryErr } = await supabase
        .from("user_concept_mastery")
        .upsert(masteryRows, { onConflict: "user_id,concept_id" });
      if (masteryErr) {
        await releaseClaimAsFailed();
        return json({ error: "mastery seed failed", details: masteryErr.message }, 500);
      }
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
      model: "google/gemini-2.5-flash",
    });
    if (processedErr) {
      await releaseClaimAsFailed();
      return json({ error: "processed content insert failed", details: processedErr.message }, 500);
    }
    const { error: readyErr } = await supabase
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
      .eq("concept_extraction_claim_id", claimId);
    if (readyErr) {
      await releaseClaimAsFailed();
      return json({ error: "capture completion failed", details: readyErr.message }, 500);
    }
  }

  return json({ ok: true, summary, concepts, conceptIds: insertedIds });
});

function insufficientSource() {
  return json({
    error: "insufficient_source",
    message: "Add a definition, example, equation, class fact, or professor hint before building study questions.",
  }, 422);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
