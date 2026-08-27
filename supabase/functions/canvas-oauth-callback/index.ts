import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import {
  canvasCallbackUrl,
  encryptCanvasToken,
  getCanvasOAuthClient,
  safeAppRedirect,
  sha256,
} from "../_shared/canvas-server.ts";
import {
  checkCurrentFamilyBetaAgreement,
  CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
} from "../_shared/family-beta-agreement.ts";
import {
  createPrivateRequestId,
  logPrivateFailure,
  privateResponseHeaders,
} from "../_shared/private-json-response.ts";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string | number; name?: string };
}

Deno.serve(async (req) => {
  const requestId = createPrivateRequestId(req.headers.get("X-Request-ID"));
  try {
    return await handleCallback(req, requestId);
  } catch {
    logPrivateFailure({
      errorClass: "canvas_oauth_callback_unhandled",
      status: 500,
      requestId,
    });
    return redirect("error", requestId);
  }
});

async function handleCallback(req: Request, requestId: string) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: privateResponseHeaders({
        "Content-Type": "text/plain; charset=utf-8",
      }, requestId),
    });
  }
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) return redirect("error", requestId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    logPrivateFailure({
      errorClass: "canvas_oauth_environment_missing",
      status: 503,
      requestId,
    });
    return redirect("error", requestId);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stateHash = await sha256(state);
  const { data: stateRow, error: stateError } = await admin
    .from("canvas_oauth_states")
    .select("*").eq("state_hash", stateHash).maybeSingle();
  if (stateError) {
    logPrivateFailure({
      errorClass: "canvas_oauth_state_lookup_failed",
      status: 500,
      requestId,
    });
    return redirect("error", requestId);
  }
  if (
    !stateRow || stateRow.used_at ||
    Date.parse(stateRow.expires_at) <= Date.now()
  ) {
    return redirect("error", requestId);
  }
  const { data: claimed, error: claimError } = await admin
    .from("canvas_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", stateHash).is("used_at", null).select("state_hash")
    .maybeSingle();
  if (claimError) {
    logPrivateFailure({
      errorClass: "canvas_oauth_state_claim_failed",
      status: 500,
      requestId,
    });
    return redirect("error", requestId);
  }
  if (!claimed) return redirect("error", requestId);

  // The state is consumed before this authorization boundary so concurrent
  // callbacks cannot race the durable receipt check or reuse the Canvas code.
  // All agreement failures intentionally collapse to the same safe redirect.
  const agreementGate = await checkCurrentFamilyBetaAgreement(
    stateRow.user_id,
    () =>
      admin
        .from("family_beta_agreement_acceptances")
        .select("user_id, accepted_by, agreement_version, accepted_at")
        .eq("user_id", stateRow.user_id)
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
    }
    return redirect("error", requestId);
  }

  const oauth = getCanvasOAuthClient(stateRow.canvas_base_url);
  if (!oauth) return redirect("error", requestId);
  const response = await fetch(new URL("/login/oauth2/token", oauth.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: canvasCallbackUrl(),
      code,
      replace_tokens: "1",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    logPrivateFailure({
      errorClass: "canvas_token_exchange_failed",
      status: 502,
      requestId,
    });
    return redirect("error", requestId);
  }
  let token: TokenResponse;
  try {
    token = await response.json() as TokenResponse;
  } catch {
    logPrivateFailure({
      errorClass: "canvas_token_response_invalid",
      status: 502,
      requestId,
    });
    return redirect("error", requestId);
  }
  if (!token.access_token) {
    logPrivateFailure({
      errorClass: "canvas_token_response_invalid",
      status: 502,
      requestId,
    });
    return redirect("error", requestId);
  }

  const expiresAt = typeof token.expires_in === "number"
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;
  const { error } = await admin.from("canvas_connections").upsert({
    user_id: stateRow.user_id,
    canvas_base_url: oauth.baseUrl,
    canvas_user_id: token.user?.id == null ? null : String(token.user.id),
    canvas_user_name: token.user?.name ?? null,
    access_token_ciphertext: await encryptCanvasToken(token.access_token),
    refresh_token_ciphertext: token.refresh_token
      ? await encryptCanvasToken(token.refresh_token)
      : null,
    token_expires_at: expiresAt,
    status: "connected",
    last_sync_status: "never",
    last_sync_error: null,
  }, { onConflict: "user_id,canvas_base_url" });
  if (error) {
    logPrivateFailure({
      errorClass: "canvas_connection_write_failed",
      status: 500,
      requestId,
    });
  }
  if (!error) {
    // Full OAuth supersedes the limited calendar fallback. Remove the encrypted
    // feed credential so only one background importer remains active.
    const calendarCleanup = await admin.from("canvas_calendar_connections")
      .delete()
      .eq("user_id", stateRow.user_id);
    if (calendarCleanup.error) {
      logPrivateFailure({
        errorClass: "canvas_calendar_cleanup_failed",
        status: 500,
        requestId,
      });
    }
  }
  return redirect(error ? "error" : "connected", requestId);
}

function redirect(value: "connected" | "error", requestId: string) {
  const url = new URL(safeAppRedirect("/integrations/canvas"));
  url.searchParams.set("canvas", value);
  return new Response(null, {
    status: 302,
    headers: privateResponseHeaders({ Location: url.toString() }, requestId),
  });
}
