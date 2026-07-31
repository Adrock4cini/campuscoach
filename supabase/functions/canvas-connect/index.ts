import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  canvasCallbackUrl,
  getCanvasOAuthClient,
  randomUrlSafe,
  sha256,
} from "../_shared/canvas-server.ts";
import { normalizeCanvasBaseUrl } from "../_shared/canvas-mapping.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Canvas is unavailable." }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData } = await userClient.auth.getUser();
  if (!authData.user) return json({ error: "Authentication required" }, 401);

  let rawBaseUrl = "";
  try {
    rawBaseUrl = String((await req.json()).canvasBaseUrl ?? "");
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  let baseUrl: string;
  try {
    baseUrl = normalizeCanvasBaseUrl(rawBaseUrl);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Invalid Canvas address",
    }, 400);
  }
  const oauth = getCanvasOAuthClient(baseUrl);
  if (!oauth) {
    return json({
      error: "This school’s Canvas connection has not been enabled yet.",
      code: "institution_not_configured",
    }, 422);
  }

  const state = randomUrlSafe();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await admin.from("canvas_oauth_states").delete()
    .eq("user_id", authData.user.id).lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("canvas_oauth_states").insert({
    state_hash: await sha256(state),
    user_id: authData.user.id,
    canvas_base_url: baseUrl,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return json({ error: "Couldn’t start Canvas sign-in." }, 500);

  const url = new URL("/login/oauth2/auth", baseUrl);
  url.search = new URLSearchParams({
    client_id: oauth.clientId,
    response_type: "code",
    redirect_uri: canvasCallbackUrl(),
    state,
    scope:
      "url:GET|/api/v1/courses url:GET|/api/v1/courses/:course_id/assignments",
  }).toString();
  return json({
    authorizationUrl: url.toString(),
    institution: oauth.institution,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
