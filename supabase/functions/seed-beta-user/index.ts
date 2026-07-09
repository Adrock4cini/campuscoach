// One-shot admin function to (re)create a seeded beta test user.
// Uses the service role to bypass RLS + auth signup restrictions so we have
// a stable account to sign in with during development.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const email: string = body.email ?? "adam@campuscompanion.dev";
  const password: string = body.password ?? "CampusBeta2026!";
  const fullName: string = body.fullName ?? "Adam (Beta Tester)";

  // Try create; if it already exists, look it up and reset password.
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, seeded: true },
  });

  if (created.error) {
    // Find existing user by paginated list (small dev instance)
    let page = 1;
    while (!userId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (match) userId = match.id;
      if (data.users.length < 200) break;
      page++;
    }
    if (!userId) return json({ error: `Could not create or find user: ${created.error.message}` }, 500);
    const upd = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, seeded: true },
    });
    if (upd.error) return json({ error: upd.error.message }, 500);
  } else {
    userId = created.data.user!.id;
  }

  // Seed a profile row so onboarding gate passes and the dashboard is usable.
  const now = new Date().toISOString();
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      user_id: userId,
      full_name: fullName,
      learner_type: "visual",
      term: "Spring 2026",
      onboarded_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  return json({
    ok: true,
    userId,
    email,
    password,
    profileError: profileErr?.message ?? null,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
