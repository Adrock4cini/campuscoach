import { createClient } from "npm:@supabase/supabase-js@2";
import {
  canvasCallbackUrl,
  encryptCanvasToken,
  getCanvasOAuthClient,
  safeAppRedirect,
  sha256,
} from "../_shared/canvas-server.ts";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string | number; name?: string };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) return redirect("error");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return redirect("error");
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stateHash = await sha256(state);
  const { data: stateRow } = await admin.from("canvas_oauth_states")
    .select("*").eq("state_hash", stateHash).maybeSingle();
  if (
    !stateRow || stateRow.used_at ||
    Date.parse(stateRow.expires_at) <= Date.now()
  ) {
    return redirect("error");
  }
  const { data: claimed } = await admin.from("canvas_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", stateHash).is("used_at", null).select("state_hash")
    .maybeSingle();
  if (!claimed) return redirect("error");

  const oauth = getCanvasOAuthClient(stateRow.canvas_base_url);
  if (!oauth) return redirect("error");
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
  });
  if (!response.ok) return redirect("error");
  const token = await response.json() as TokenResponse;
  if (!token.access_token) return redirect("error");

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
  if (!error) {
    // Full OAuth supersedes the limited calendar fallback. Remove the encrypted
    // feed credential so only one background importer remains active.
    await admin.from("canvas_calendar_connections").delete()
      .eq("user_id", stateRow.user_id);
  }
  return redirect(error ? "error" : "connected");
});

function redirect(value: "connected" | "error") {
  const url = new URL(safeAppRedirect("/integrations/canvas"));
  url.searchParams.set("canvas", value);
  return Response.redirect(url, 302);
}
