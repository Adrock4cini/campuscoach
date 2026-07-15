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

const MODEL = "google/gemini-2.5-flash";
const PROMPT_VERSION = "v3-class-identity";
const MAX_CONCEPTS = 8;

const PROMPTS: Partial<Record<ArtifactKind, {
  system: string;
  describe: (n: number) => string;
}>> = {
  flashcards: {
    system: `You author study flashcards for a college student, grounded ONLY in the concepts provided.
Return ONLY JSON matching: { "cards": [ { "front": string, "back": string, "conceptId": string } ] }
Rules:
- One card per concept unless a concept clearly needs two.
- conceptId MUST exactly match the ID supplied for the concept used by that card.
- "front" is a short question or cue. "back" is 1-2 sentences, plain language.
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
  "conceptId": string       // exact supplied concept ID tested
} ] }
Rules:
- One question per concept. Exactly 4 choices. Exactly one correct.
- conceptId MUST exactly match the ID supplied for the concept being tested.
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

  const count = Math.min(body.count ?? concepts.length, concepts.length, MAX_CONCEPTS);
  const conceptBlock = concepts.map((c, i) =>
    `Concept ${i + 1} ID: ${c.id}
Name: ${c.name}
Definition: ${c.definition ?? "(none)"}
Examples: ${(c.examples ?? []).join(" | ") || "(none)"}
Professor emphasis: ${c.professor_emphasis ? "yes" : "no"}`
  ).join("\n\n");

  // 2. Call the gateway
  const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
  if (!gwRes.ok) {
    const details = await gwRes.text();
    return json({ error: "generation failed", status: gwRes.status, details }, gwRes.status);
  }
  const gw = await gwRes.json();
  let payload: unknown = {};
  try { payload = JSON.parse(gw?.choices?.[0]?.message?.content ?? "{}"); } catch {
    return json({ error: "model returned non-JSON" }, 502);
  }

  // Reject untraceable output. Every study item must point back to a
  // permanent Concept so a student's answer updates only that memory.
  const allowedConceptIds = new Set(concepts.map((c) => c.id));
  const generatedItems = body.kind === "flashcards"
    ? (payload as { cards?: Array<{ conceptId?: string }> }).cards
    : (payload as { questions?: Array<{ conceptId?: string }> }).questions;
  if (!Array.isArray(generatedItems) || generatedItems.length === 0) {
    return json({ error: "model returned an empty or invalid artifact" }, 502);
  }
  if (generatedItems.some((item) => !item.conceptId || !allowedConceptIds.has(item.conceptId))) {
    return json({ error: "model returned an artifact without valid concept attribution" }, 502);
  }

  // 3. Optional regenerate: mark prior rows stale for same (kind, capture_id or conceptIds).
  if (body.regenerate) {
    if (body.captureId) {
      await supabase.from("learning_artifacts")
        .update({ stale: true })
        .eq("user_id", userId).eq("kind", body.kind).eq("capture_id", body.captureId);
    } else if (body.conceptIds?.length) {
      // best-effort: mark artifacts overlapping these concept ids as stale
      await supabase.from("learning_artifacts")
        .update({ stale: true })
        .eq("user_id", userId).eq("kind", body.kind)
        .overlaps("concept_ids", body.conceptIds);
    }
  }

  // 4. Persist artifact row
  const insertRow = {
    user_id: userId,
    // `class_id` is the database UUID. `client_class_id` is the stable key
    // used by the app (for example, "math"). Never put the latter in a UUID
    // column; that caused the production UUID parsing failure.
    class_id: concepts[0].class_id ?? null,
    client_class_id: body.classId ?? concepts[0].client_class_id ?? null,
    kind: body.kind,
    concept_ids: concepts.map((c) => c.id),
    capture_id: body.captureId ?? concepts[0].capture_id ?? null,
    topic: body.topic ?? null,
    payload,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
  };
  const { data: inserted, error: insErr } = await supabase
    .from("learning_artifacts")
    .insert(insertRow)
    .select("*")
    .single();
  if (insErr) return json({ error: "artifact insert failed", details: insErr.message }, 500);

  return json({ ok: true, artifact: inserted });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
