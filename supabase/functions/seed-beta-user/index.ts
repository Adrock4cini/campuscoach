// One-shot admin function to (re)create a seeded beta test user.
// This function uses the service role, so it requires BOTH a valid Supabase
// JWT at the gateway and a separate server-side admin secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedAdminSecret = Deno.env.get("SEED_BETA_ADMIN_SECRET");
  const suppliedAdminSecret = req.headers.get("x-seed-admin-secret");
  if (!expectedAdminSecret) {
    console.error("[seed-beta-user] SEED_BETA_ADMIN_SECRET is not configured");
    return json({ error: "Beta seeding is disabled" }, 503);
  }
  if (!suppliedAdminSecret || suppliedAdminSecret !== expectedAdminSecret) {
    return json({ error: "Forbidden" }, 403);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "A valid email is required" }, 400);
  }
  if (password.length < 12) {
    return json({ error: "Password must be at least 12 characters" }, 400);
  }
  if (!fullName || fullName.length > 100) {
    return json({ error: "A full name between 1 and 100 characters is required" }, 400);
  }

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
    profileError: profileErr?.message ?? null,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
