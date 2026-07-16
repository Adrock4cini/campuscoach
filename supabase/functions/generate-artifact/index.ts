// Generate a learning artifact from one or more Concepts.
// Concepts are the permanent memory; the artifact row we write is a
// disposable/regeneratable view of that memory.
//
// Sprint B ships templates for: flashcards, multiple_choice.
// Other kinds (fill_blank, matching, practice, study_guide, cheat_sheet,
// eli5, eli_professor, mnemonic) are reserved on the enum and return
// 501 here until a template is added. No architecture change is
// required to add a new kind — only a new entry in PROMPTS below and a
// payload shape documented in the client type.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { extractExactThinSource } from "../_shared/thin-source.ts";

type ArtifactKind =
  | "flashcards"
  | "multiple_choice"
  | "fill_blank"
  | "matching"
  | "practice"
  | "study_guide"
  | "cheat_sheet"
  | "eli5"
  | "eli_professor"
  | "mnemonic";

interface Body {
  kind: ArtifactKind;
  conceptIds?: string[];
  captureId?: string | null;
  classId?: string | null;
  topic?: string | null;
  count?: number;
  regenerate?: boolean; // if true, delete existing rows of same (kind, capture_id) first
}

interface ConceptRow {
  id: string;
  name: string;
  definition: string | null;
  examples: string[] | null;
  professor_emphasis: boolean | null;
  class_id: string | null;
  client_class_id: string | null;
  capture_id: string | null;
}

interface Flashcard {
  front: string;
  back: string;
  conceptId: string;
  conceptName: string;
  sourceExcerpt?: string;
}

const MODEL = "google/gemini-2.5-flash";
const PROMPT_VERSION = "v5-grounded-regeneration";
const MAX_CONCEPTS = 8;

const PROMPTS: Partial<Record<ArtifactKind, {
  system: string;
  describe: (n: number) => string;
}>> = {
  flashcards: {
    system: `You author study flashcards for a college student, grounded ONLY in the concepts provided.
Return ONLY JSON matching: { "cards": [ { "front": string, "back": string, "conceptId": string, "conceptName": string } ] }
Rules:
- One card per concept unless a concept clearly needs two.
- conceptId MUST exactly match the ID supplied for the concept used by that card.
- conceptName MUST exactly match the supplied concept name.
- "front" is a short question or cue. "back" is 1-2 sentences, plain language.
- Prefer useful recall or application prompts over generic "What is X?" cards.
- Never invent facts not present in the concept's definition/examples.
- No prose outside JSON.`,
    describe: (n) => `Generate up to ${n} flashcards covering these concepts.`,
  },
  multiple_choice: {
    system: `You author multiple-choice questions for a college student, grounded ONLY in the concepts provided.
Return ONLY JSON matching:
{ "questions": [ {
  "prompt": string,
  "choices": string[],      // exactly 4
  "answerIndex": number,    // 0-3
  "rationale": string,      // 1 sentence, why the answer is right
  "conceptId": string,      // exact supplied concept ID tested
  "conceptName": string     // exact supplied concept name tested
} ] }
Rules:
- One question per concept. Exactly 4 choices. Exactly one correct.
- conceptId MUST exactly match the ID supplied for the concept being tested.
- conceptName MUST exactly match the supplied concept name.
- Distractors must be plausible and drawn from adjacent ideas in the provided concepts — never invent unrelated facts.
- Vary answerIndex across questions.
- No prose outside JSON.`,
    describe: (n) => `Generate up to ${n} multiple-choice questions covering these concepts.`,
  },
};

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

  if (!body.kind) return json({ error: "kind required" }, 400);
  const template = PROMPTS[body.kind];
  if (!template) {
    return json(
      { error: `kind '${body.kind}' is reserved but no template implemented yet` },
      501,
    );
  }

  // 1. Load concepts. Prefer explicit conceptIds, then captureId, then
  // fall back to the user's weakest-mastery concepts in the class.
  let conceptQuery = supabase
    .from("concepts")
    .select("id, name, definition, examples, professor_emphasis, class_id, client_class_id, capture_id")
    .eq("user_id", userId)
    .limit(MAX_CONCEPTS);

  if (body.conceptIds?.length) {
    conceptQuery = conceptQuery.in("id", body.conceptIds);
  } else if (body.captureId) {
    conceptQuery = conceptQuery.eq("capture_id", body.captureId);
  } else if (body.classId) {
    conceptQuery = conceptQuery.eq("client_class_id", body.classId);
  }

  const { data: concepts, error: cErr } = await conceptQuery;
  if (cErr) return json({ error: "concept load failed", details: cErr.message }, 500);
  if (!concepts || concepts.length === 0) {
    return json({ error: "No concepts found for this request" }, 404);
  }

  const typedConcepts = concepts as ConceptRow[];
  const count = Math.min(body.count ?? typedConcepts.length, typedConcepts.length, MAX_CONCEPTS);
  const sourceByConcept = await loadSourceExcerpts(supabase, typedConcepts);
  const key = Deno.env.get("LOVABLE_API_KEY");
  let payload: { cards: Flashcard[] } | { questions: Array<Record<string, unknown>> };
  let modelUsed = MODEL;

  if (body.kind === "flashcards") {
    const exact = buildExactFlashcards(typedConcepts, sourceByConcept, count);
    const remaining = typedConcepts.filter((concept) => !exact.handledConceptIds.has(concept.id));
    let generatedCards: Flashcard[] = [];
    let usedGateway = false;
    let usedFallback = false;

    if (remaining.length && exact.cards.length < count && key) {
      const modelPayload = await callGateway(
        key,
        template,
        body,
        remaining,
        count - exact.cards.length,
      );
      generatedCards = normalizeFlashcards(modelPayload, remaining, sourceByConcept);
      usedGateway = generatedCards.length > 0;
    }

    // Regeneration must not strand a student when the gateway is down or
    // returns unusable attribution. This fallback only restates permanent
    // Concepts; it never invents new academic content.
    if (remaining.length && exact.cards.length + generatedCards.length < count) {
      const alreadyGenerated = new Set(generatedCards.map((card) => card.conceptId));
      generatedCards.push(...buildGroundedFallbackFlashcards(
        remaining.filter((concept) => !alreadyGenerated.has(concept.id)),
        sourceByConcept,
        count - exact.cards.length - generatedCards.length,
      ));
      usedFallback = true;
    }

    const cards = [...exact.cards, ...generatedCards].slice(0, count);
    if (!cards.length) return json({ error: "No usable concept content was available for flashcards" }, 422);
    if (usedGateway && usedFallback) modelUsed = `${MODEL}+concept-fallback`;
    else if (usedGateway) modelUsed = MODEL;
    else if (exact.cards.length && !generatedCards.length) modelUsed = "deterministic-source";
    else modelUsed = "deterministic-concept";
    payload = { cards };
  } else {
    if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);
    const modelPayload = await callGateway(key, template, body, typedConcepts, count);
    const questions = (modelPayload as { questions?: Array<Record<string, unknown>> } | null)?.questions;
    const allowedConceptIds = new Set(typedConcepts.map((concept) => concept.id));
    if (!Array.isArray(questions) || questions.length === 0) {
      return json({ error: "model returned an empty or invalid artifact" }, 502);
    }
    if (questions.some((item) => typeof item.conceptId !== "string" || !allowedConceptIds.has(item.conceptId))) {
      return json({ error: "model returned an artifact without valid concept attribution" }, 502);
    }
    payload = {
      questions: questions.map((question) => {
        const concept = typedConcepts.find((item) => item.id === question.conceptId)!;
        return {
          ...question,
          conceptName: concept.name,
          sourceExcerpt: sourceByConcept.get(concept.id),
        };
      }),
    };
  }

  const generatedItems = "cards" in payload ? payload.cards : payload.questions;
  const generatedConceptIds = [...new Set(
    generatedItems
      .map((item) => item.conceptId)
      .filter((id): id is string => typeof id === "string"),
  )];

  // 3. Persist the replacement before retiring the prior set. A failed
  // insert must never make the student's last working artifact disappear.
  const insertRow = {
    user_id: userId,
    // `class_id` is the database UUID. `client_class_id` is the stable key
    // used by the app (for example, "math"). Never put the latter in a UUID
    // column; that caused the production UUID parsing failure.
    class_id: concepts[0].class_id ?? null,
    client_class_id: body.classId ?? concepts[0].client_class_id ?? null,
    kind: body.kind,
    concept_ids: generatedConceptIds,
    capture_id: body.captureId ?? concepts[0].capture_id ?? null,
    topic: body.topic ?? null,
    payload,
    model: modelUsed,
    prompt_version: PROMPT_VERSION,
  };
  const { data: inserted, error: insErr } = await supabase
    .from("learning_artifacts")
    .insert(insertRow)
    .select("*")
    .single();
  if (insErr) return json({ error: "artifact insert failed", details: insErr.message }, 500);

  // 4. Regeneration is now safe: only stale earlier rows after the new row
  // exists, and explicitly exclude it from the update.
  if (body.regenerate) {
    if (body.captureId) {
      await supabase.from("learning_artifacts")
        .update({ stale: true })
        .eq("user_id", userId).eq("kind", body.kind).eq("capture_id", body.captureId)
        .neq("id", inserted.id);
    } else if (body.conceptIds?.length) {
      await supabase.from("learning_artifacts")
        .update({ stale: true })
        .eq("user_id", userId).eq("kind", body.kind)
        .overlaps("concept_ids", body.conceptIds)
        .neq("id", inserted.id);
    } else if (body.classId) {
      await supabase.from("learning_artifacts")
        .update({ stale: true })
        .eq("user_id", userId).eq("kind", body.kind)
        .eq("client_class_id", body.classId)
        .neq("id", inserted.id);
    }
  }

  return json({ ok: true, artifact: inserted });
});

async function loadSourceExcerpts(
  supabase: ReturnType<typeof createClient>,
  concepts: ConceptRow[],
) {
  const captureIds = [...new Set(concepts.map((concept) => concept.capture_id).filter(Boolean))] as string[];
  const sourceByConcept = new Map<string, string>();
  if (!captureIds.length) return sourceByConcept;

  const { data } = await supabase.from("captures").select("id, raw_text").in("id", captureIds);
  const sourceByCapture = new Map(
    (data ?? []).map((capture) => [capture.id as string, (capture.raw_text as string | null)?.trim() ?? ""]),
  );
  for (const concept of concepts) {
    const source = concept.capture_id ? sourceByCapture.get(concept.capture_id) : undefined;
    if (source) sourceByConcept.set(concept.id, source);
  }
  return sourceByConcept;
}

function buildExactFlashcards(
  concepts: ConceptRow[],
  sourceByConcept: Map<string, string>,
  limit: number,
) {
  const cards: Flashcard[] = [];
  const handledConceptIds = new Set<string>();
  const seenSources = new Set<string>();

  for (const concept of concepts) {
    const source = sourceByConcept.get(concept.id);
    const exact = source ? extractExactThinSource(source, Boolean(concept.professor_emphasis)) : null;
    if (!exact) continue;
    handledConceptIds.add(concept.id);
    if (seenSources.has(exact.sourceExcerpt) || cards.length >= limit) continue;
    seenSources.add(exact.sourceExcerpt);
    cards.push({
      front: exact.question,
      back: exact.answer,
      conceptId: concept.id,
      conceptName: exact.concepts[0].name,
      sourceExcerpt: exact.sourceExcerpt,
    });
  }
  return { cards, handledConceptIds };
}

function buildGroundedFallbackFlashcards(
  concepts: ConceptRow[],
  sourceByConcept: Map<string, string>,
  limit: number,
) {
  return concepts.slice(0, Math.max(0, limit)).map((concept): Flashcard => ({
    front: `Explain ${concept.name} in your own words.`,
    back: concept.definition?.trim()
      || concept.examples?.find((example) => example.trim())
      || `Review ${concept.name} in your original class material.`,
    conceptId: concept.id,
    conceptName: concept.name,
    sourceExcerpt: sourceByConcept.get(concept.id),
  }));
}

function normalizeFlashcards(
  payload: unknown,
  concepts: ConceptRow[],
  sourceByConcept: Map<string, string>,
) {
  const cards = (payload as { cards?: Array<Partial<Flashcard>> } | null)?.cards;
  if (!Array.isArray(cards)) return [];
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  return cards.flatMap((card): Flashcard[] => {
    const concept = card.conceptId ? conceptById.get(card.conceptId) : undefined;
    if (!concept || typeof card.front !== "string" || typeof card.back !== "string") return [];
    return [{
      front: card.front.trim(),
      back: card.back.trim(),
      conceptId: concept.id,
      conceptName: concept.name,
      sourceExcerpt: sourceByConcept.get(concept.id),
    }];
  });
}

async function callGateway(
  key: string,
  template: NonNullable<(typeof PROMPTS)[ArtifactKind]>,
  body: Body,
  concepts: ConceptRow[],
  count: number,
) {
  const conceptBlock = concepts.map((concept, index) =>
    `Concept ${index + 1} ID: ${concept.id}
Name: ${concept.name}
Definition: ${concept.definition ?? "(none)"}
Examples: ${(concept.examples ?? []).join(" | ") || "(none)"}
Professor emphasis: ${concept.professor_emphasis ? "yes" : "no"}`
  ).join("\n\n");
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: template.system },
          {
            role: "user",
            content: [
              body.topic ? `Topic: ${body.topic}` : null,
              template.describe(count),
              "---",
              conceptBlock,
            ].filter(Boolean).join("\n"),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const gateway = await response.json();
    return JSON.parse(gateway?.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
