// Parse a syllabus (PDF or image) into structured class data using Lovable AI Gateway.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  fileDataUrl: string; // data:<mime>;base64,<b64>
  filename?: string;
  mimeType?: string;
  hint?: string; // optional student-provided context (e.g. "Spring 2026")
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_REQUEST_BYTES = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16_384;
const MAX_HINT_LENGTH = 300;
const MAX_FILENAME_LENGTH = 180;

const SYSTEM = `You extract structured class information from a college syllabus, class schedule, or timetable.
Return ONLY JSON matching this schema, no prose:
{
  "student": { "name": string|null, "school": string|null, "term": string|null },
  "classes": [
    {
      "name": string,                       // course title e.g. "Organic Chemistry I"
      "code": string|null,                  // e.g. "CHEM 201"
      "professor": string|null,
      "location": string|null,
      "days": string[],                     // subset of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
      "time": string|null,                  // e.g. "10:00 AM" (start time only)
      "endTime": string|null,               // e.g. "11:15 AM"
      "textbook": string|null,
      "examDates": [ { "label": string, "date": string } ],     // ISO YYYY-MM-DD
      "assignments": [ { "label": string, "dueDate": string } ] // ISO YYYY-MM-DD
    }
  ]
}
Rules:
- Never invent data. Use null / [] when unknown.
- Normalize days to 3-letter form.
- Convert dates to ISO YYYY-MM-DD; if only month/day is present, use the term's year when obvious, else null.
- If the document covers a single class, still return an array of length 1.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[parse-syllabus] Supabase environment is incomplete");
    return json({ error: "Service unavailable" }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ error: "Authentication required" }, 401);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "File exceeds the 15 MB limit" }, 413);
  }

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    console.error("[parse-syllabus] LOVABLE_API_KEY is missing");
    return json({ error: "Service unavailable" }, 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body.fileDataUrl !== "string" || !body.fileDataUrl.startsWith("data:")) {
    return json({ error: "A PDF or image is required" }, 400);
  }
  if (body.fileDataUrl.length > MAX_REQUEST_BYTES) {
    return json({ error: "File exceeds the 15 MB limit" }, 413);
  }
  if (body.hint && (typeof body.hint !== "string" || body.hint.length > MAX_HINT_LENGTH)) {
    return json({ error: "Context is too long" }, 400);
  }
  if (body.filename && (typeof body.filename !== "string" || body.filename.length > MAX_FILENAME_LENGTH)) {
    return json({ error: "Filename is too long" }, 400);
  }

  const dataUrlHeaderEnd = body.fileDataUrl.indexOf(",");
  const dataUrlHeader = dataUrlHeaderEnd >= 0 ? body.fileDataUrl.slice(0, dataUrlHeaderEnd) : "";
  const mimeMatch = /^data:([^;,]+);base64$/i.exec(dataUrlHeader);
  if (!mimeMatch) {
    return json({ error: "File must use a valid base64 data URL" }, 400);
  }

  const base64 = body.fileDataUrl.slice(dataUrlHeaderEnd + 1);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return json({ error: "File contains invalid base64 data" }, 400);
  }
  const paddingBytes = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const decodedBytes = Math.floor((base64.length * 3) / 4) - paddingBytes;
  if (decodedBytes > MAX_FILE_BYTES) {
    return json({ error: "File exceeds the 15 MB limit" }, 413);
  }

  const mime = mimeMatch[1].toLowerCase();
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  const contentBlock = isImage
    ? { type: "image_url", image_url: { url: body.fileDataUrl } }
    : isPdf
      ? {
          type: "file",
          file: { filename: body.filename ?? "syllabus.pdf", file_data: body.fileDataUrl },
        }
      : null;

  if (!contentBlock) {
    return json({ error: "Unsupported file type. Use a PDF or image." }, 400);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error("[parse-syllabus] SUPABASE_SERVICE_ROLE_KEY is missing");
    return json({ error: "Service unavailable" }, 503);
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: withinQuota, error: quotaError } = await adminClient.rpc(
    "consume_ai_request_quota",
    {
      p_user_id: authData.user.id,
      p_function_name: "parse-syllabus",
      p_limit: 12,
      p_window_seconds: 3600,
    },
  );
  if (quotaError) {
    console.error(`[parse-syllabus] quota check failed: ${quotaError.message}`);
    return json({ error: "Service temporarily unavailable" }, 503);
  }
  if (!withinQuota) {
    return json({ error: "Syllabus import limit reached. Try again later." }, 429);
  }

  const userText = `Extract the class(es) from this syllabus/schedule.${
    body.hint ? ` Context: ${body.hint}.` : ""
  } Return the JSON only.`;

  const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [{ type: "text", text: userText }, contentBlock],
        },
      ],
    }),
  });

  if (!gwRes.ok) {
    const details = await gwRes.text();
    console.error(`[parse-syllabus] gateway ${gwRes.status}: ${details}`);
    return json({ error: "AI extraction failed. Please try again." }, 502);
  }

  const gw = await gwRes.json();
  const raw = gw?.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    parsed = { student: null, classes: [], _raw: raw };
  }

  return json(parsed);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
