import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";
import {
  canvasCallbackUrl,
  getCanvasOAuthClient,
  randomUrlSafe,
  sha256,
} from "../_shared/canvas-server.ts";
import { normalizeCanvasBaseUrl } from "../_shared/canvas-mapping.ts";
import {
  checkCurrentFamilyBetaAgreement,
  CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
  FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE,
  FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE,
} from "../_shared/family-beta-agreement.ts";
import {
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";

Deno.serve((req) =>
  withPrivateJsonErrors(req, corsHeaders, async (requestId) => {
    const json = (body: unknown, status = 200) => (
      privateJsonResponse(body, status, corsHeaders, { requestId })
    );
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: privateResponseHeaders(corsHeaders, requestId),
      });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      logPrivateFailure({
        errorClass: "canvas_environment_missing",
        status: 503,
        requestId,
      });
      return json({ error: "Canvas is unavailable." }, 503);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Authentication required" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const agreementGate = await checkCurrentFamilyBetaAgreement(
      authData.user.id,
      () =>
        admin
          .from("family_beta_agreement_acceptances")
          .select("user_id, accepted_by, agreement_version, accepted_at")
          .eq("user_id", authData.user.id)
          .eq("agreement_version", CURRENT_FAMILY_BETA_AGREEMENT_VERSION)
          .maybeSingle(),
    );
    if (!agreementGate.allowed) {
      if (agreementGate.lookupFailed) {
        logPrivateFailure({
          errorClass: "agreement_check_unavailable",
          status: 503,
          requestId,
        });
        return json(FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE, 503);
      }
      return json(FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE, 403);
    }

    let rawBaseUrl: string;
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
        error: error instanceof Error
          ? error.message
          : "Invalid Canvas address",
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
    await admin.from("canvas_oauth_states").delete()
      .eq("user_id", authData.user.id).lt(
        "expires_at",
        new Date().toISOString(),
      );
    const { error } = await admin.from("canvas_oauth_states").insert({
      state_hash: await sha256(state),
      user_id: authData.user.id,
      canvas_base_url: baseUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) {
      logPrivateFailure({
        errorClass: "canvas_oauth_state_write_failed",
        status: 500,
        requestId,
      });
      return json({ error: "Couldn’t start Canvas sign-in." }, 500);
    }

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
  })
);
