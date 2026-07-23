// Read private Assignment / Notes images once, extract grounded source text and
// concepts in one vision request, then persist them to the existing learning
// pipeline. Originals never leave the student's private storage boundary
// except for the authenticated, short-lived AI processing request.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
  summary?: string;
  concepts?: ExtractedConcept[];
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 8_000_000;
const MAX_TOTAL_BYTES = 24_000_000;
const CLAIM_MS = 5 * 60 * 1000;
const ALLOWED_KINDS = new Set(["scan-assignment", "scan-material"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const SYSTEM = `You read photos of a college student's assignment, notes, handout, or textbook.

Return ONLY JSON matching:
{
  "sourceText": string,
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
- Extract 1-8 concrete skills, concepts, formulas, problem types, or facts supported by the images.
- For assignments, identify what the student must learn; do not merely provide final answers and do not invent an answer key.
- Use short student-friendly definitions and examples grounded only in the pages.
- If an image is illegible or has no academic content, do not guess.
- No prose outside the JSON.`;

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "concept";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !lovableKey) {
    console.error("[process-capture-images] required environment is missing");
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.captureId || !Array.isArray(body.materialIds)) {
    return json({ error: "captureId and materialIds are required" }, 400);
  }
  const materialIds = [...new Set(body.materialIds.filter((id) => typeof id === "string"))];
  if (materialIds.length < 1 || materialIds.length > MAX_FILES) {
    return json({ error: "Use between 1 and 4 images" }, 400);
  }

  const { data: capture, error: captureError } = await userClient
    .from("captures")
    .select("id, user_id, class_id, client_class_id, kind, topic, raw_text, assignment_id, exam_id")
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

  const { data: existing, error: existingError } = await userClient
    .from("concepts")
    .select("id, class_id, name, definition")
    .eq("user_id", userId)
    .eq("capture_id", body.captureId)
    .order("created_at", { ascending: true });
  if (existingError) return json({ error: "Concept recovery lookup failed" }, 500);
  if (existing?.length) {
    const existingIds = existing.map((concept) => concept.id);
    const { data: masteryRows, error: masteryLookupError } = await userClient
      .from("user_concept_mastery")
      .select("concept_id")
      .eq("user_id", userId)
      .in("concept_id", existingIds);
    if (masteryLookupError) return json({ error: "Mastery recovery lookup failed" }, 500);
    const mastered = new Set((masteryRows ?? []).map((row) => row.concept_id));
    const missingMastery = existing
      .filter((concept) => !mastered.has(concept.id))
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
      const { error: recoveryError } = await userClient
        .from("user_concept_mastery")
        .insert(missingMastery);
      if (recoveryError) return json({ error: "Mastery recovery failed" }, 500);
    }

    const { data: processedRows, error: processedLookupError } = await userClient
      .from("processed_content")
      .select("id")
      .eq("user_id", userId)
      .eq("capture_id", body.captureId)
      .limit(1);
    if (processedLookupError) return json({ error: "Source recovery lookup failed" }, 500);
    if (!processedRows?.length) {
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
      if (processedRecoveryError) return json({ error: "Source recovery failed" }, 500);
    }

    await userClient
      .from("captures")
      .update({
        processing_status: "ready",
        concept_extraction_claim_id: null,
        concept_extraction_started_at: null,
      })
      .eq("id", body.captureId)
      .eq("user_id", userId);
    return json({ ok: true, reused: true, concepts: existing });
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

  const claimId = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - CLAIM_MS).toISOString();
  const { data: claimed, error: claimError } = await userClient
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
  if (claimError) return json({ error: "Processing claim failed" }, 500);
  if (!claimed) {
    return json({ ok: true, processing: true, message: "Campus Brain is already reading these pages." });
  }

  const failClaim = async () => {
    await userClient
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

  const { data: withinQuota, error: quotaError } = await adminClient.rpc(
    "consume_ai_request_quota",
    {
      p_user_id: userId,
      p_function_name: "process-capture-images",
      p_limit: 24,
      p_window_seconds: 3600,
    },
  );
  if (quotaError) {
    await failClaim();
    return json({ error: "Service temporarily unavailable" }, 503);
  }
  if (!withinQuota) {
    await failClaim();
    return json({ error: "Photo processing limit reached. Try again later." }, 429);
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
  } catch (error) {
    console.error("[process-capture-images] download failed", error);
    await failClaim();
    return json({ error: "Private images could not be read" }, 502);
  }

  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    });
  } catch (error) {
    console.error("[process-capture-images] gateway unavailable", error);
    await failClaim();
    return json({ error: "Campus Brain could not read these pages" }, 502);
  }
  if (!gatewayResponse.ok) {
    console.error(`[process-capture-images] gateway ${gatewayResponse.status}: ${await gatewayResponse.text()}`);
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
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 2_000) : "";
  const concepts = Array.isArray(parsed.concepts)
    ? parsed.concepts
      .filter((concept) => concept && typeof concept.name === "string" && concept.name.trim())
      .slice(0, 8)
    : [];
  if (!sourceText || !concepts.length) {
    await userClient
      .from("captures")
      .update({ raw_text: sourceText || null })
      .eq("id", body.captureId)
      .eq("user_id", userId);
    await failClaim();
    return json({
      error: "No readable academic material was found. Try a clearer, closer photo.",
    }, 422);
  }

  const { error: sourceTextError } = await userClient
    .from("captures")
    .update({ raw_text: sourceText })
    .eq("id", body.captureId)
    .eq("user_id", userId)
    .eq("concept_extraction_claim_id", claimId);
  if (sourceTextError) {
    await failClaim();
    return json({ error: "Source text could not be saved" }, 500);
  }

  const conceptRows = concepts.map((concept) => ({
    user_id: userId,
    class_id: ownedClass.id,
    client_class_id: capture.client_class_id,
    capture_id: body.captureId,
    name: concept.name.trim().slice(0, 180),
    slug: slugify(concept.name),
    definition: typeof concept.definition === "string" ? concept.definition.slice(0, 2_000) : null,
    examples: Array.isArray(concept.examples)
      ? concept.examples.filter((value) => typeof value === "string").slice(0, 3)
      : [],
    professor_emphasis: !!concept.professor_emphasis,
    embedding: null,
    source_kind: capture.kind,
  }));
  const { data: inserted, error: conceptError } = await userClient
    .from("concepts")
    .insert(conceptRows)
    .select("id, class_id, name");
  if (conceptError || !inserted?.length) {
    await failClaim();
    return json({ error: "Concepts could not be saved" }, 500);
  }

  const now = new Date().toISOString();
  const { error: masteryError } = await userClient
    .from("user_concept_mastery")
    .upsert(inserted.map((concept) => ({
      user_id: userId,
      concept_id: concept.id,
      class_id: concept.class_id,
      strength: 0.15,
      attempts: 0,
      correct: 0,
      last_seen_at: now,
      next_review_at: now,
      streak: 0,
    })), { onConflict: "user_id,concept_id" });
  if (masteryError) {
    await failClaim();
    return json({ error: "Mastery memory could not be saved" }, 500);
  }

  const { error: processedError } = await userClient.from("processed_content").insert({
    capture_id: body.captureId,
    user_id: userId,
    summary,
    key_concepts: inserted.map((concept) => concept.name),
    ocr_text: sourceText,
    model: "google/gemini-2.5-flash-vision",
  });
  if (processedError) {
    await failClaim();
    return json({ error: "Processed source could not be saved" }, 500);
  }

  const { data: completed, error: completeError } = await userClient
    .from("captures")
    .update({
      raw_text: sourceText,
      processing_status: "ready",
      class_id: ownedClass.id,
      client_class_id: ownedClass.client_class_id,
      concept_extraction_claim_id: null,
      concept_extraction_started_at: null,
    })
    .eq("id", body.captureId)
    .eq("user_id", userId)
    .eq("concept_extraction_claim_id", claimId)
    .select("id")
    .maybeSingle();
  if (completeError || !completed) {
    await failClaim();
    return json({ error: "Capture completion failed" }, 500);
  }

  return json({
    ok: true,
    summary,
    concepts: inserted.map((concept) => ({ id: concept.id, name: concept.name })),
  });
});

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
