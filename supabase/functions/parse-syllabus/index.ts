// Parse a syllabus (PDF or image) into structured class data using Lovable AI Gateway.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  fileDataUrl: string; // data:<mime>;base64,<b64>
  filename?: string;
  mimeType?: string;
  hint?: string; // optional student-provided context (e.g. "Spring 2026")
}

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

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.fileDataUrl || !body.fileDataUrl.startsWith("data:")) {
    return new Response(JSON.stringify({ error: "fileDataUrl (data:...;base64,...) required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mime =
    body.mimeType ??
    body.fileDataUrl.slice(5, body.fileDataUrl.indexOf(";")) ??
    "application/octet-stream";
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
    return new Response(
      JSON.stringify({ error: `Unsupported file type: ${mime}. Use PDF or image.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
    return new Response(
      JSON.stringify({ error: "AI extraction failed", status: gwRes.status, details }),
      { status: gwRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const gw = await gwRes.json();
  const raw = gw?.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    parsed = { student: null, classes: [], _raw: raw };
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
