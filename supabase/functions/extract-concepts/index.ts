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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);

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

  const rawText = (body.rawText ?? "").trim();
  if (!rawText) return json({ error: "rawText required" }, 400);
  if (!assessSourceSufficiency(rawText).sufficient) {
    return insufficientSource();
  }

  // Resolve the student's stable client class id to the real classes.id UUID.
  // Both identifiers travel through the pipeline: the client id drives routes,
  // while the UUID anchors mastery/readiness foreign keys.
  let resolvedClassId = body.classId ?? null;
  let resolvedClientClassId = body.clientClassId ?? null;
  if (body.clientClassId) {
    const { data: ownedClass, error: classErr } = await supabase
      .from("classes")
      .select("id, client_class_id")
      .eq("user_id", userId)
      .eq("client_class_id", body.clientClassId)
      .maybeSingle();
    if (classErr) return json({ error: "class lookup failed", details: classErr.message }, 500);
    if (!ownedClass) return json({ error: "class not found" }, 404);
    resolvedClassId = ownedClass.id;
    resolvedClientClassId = ownedClass.client_class_id;
  }

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
    const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    if (!gwRes.ok) {
      const details = await gwRes.text();
      return json({ error: "extraction failed", status: gwRes.status, details }, gwRes.status);
    }
    const gw = await gwRes.json();
    let parsed: { summary?: string; concepts?: ExtractedConcept[] } = {};
    try { parsed = JSON.parse(gw?.choices?.[0]?.message?.content ?? "{}"); } catch { /* fallthrough */ }
    summary = parsed.summary ?? "";
    concepts = Array.isArray(parsed.concepts) ? parsed.concepts.slice(0, 8) : [];
  }

  if (!concepts.length) return insufficientSource();

  // 2. Embed each concept name+definition
  const texts = concepts.map((c) => `${c.name}. ${c.definition ?? ""}`.trim());
  let embeddings: number[][] = [];
  if (texts.length) {
    const emRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: texts }),
    });
    if (emRes.ok) {
      const em = await emRes.json();
      embeddings = (em?.data ?? []).map((d: { embedding: number[] }) => d.embedding);
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
    if (insErr) return json({ error: "concepts insert failed", details: insErr.message }, 500);
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
      await supabase.from("user_concept_mastery").upsert(masteryRows, { onConflict: "user_id,concept_id" });
    }
  }

  // 4. Persist processed_content row (summary + key_concepts strings)
  if (body.captureId) {
    await supabase.from("processed_content").insert({
      capture_id: body.captureId,
      user_id: userId,
      summary,
      key_concepts: concepts.map((c) => c.name),
      transcript: body.kind === "record-lecture" ? rawText : null,
      ocr_text: (body.kind === "scan-board" || body.kind === "scan-textbook") ? rawText : null,
      model: "google/gemini-2.5-flash",
    });
    await supabase
      .from("captures")
      .update({
        processing_status: "ready",
        flashcards_ready: false,
        class_id: resolvedClassId,
        client_class_id: resolvedClientClassId,
      })
      .eq("id", body.captureId)
      .eq("user_id", userId);
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
