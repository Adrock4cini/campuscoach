import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";
import {
  type CanvasAssignment,
  type CanvasCourse,
  canvasExternalId,
  htmlToPlainText,
  mapCanvasAssignment,
} from "../_shared/canvas-mapping.ts";
import {
  canvasCallbackUrl,
  decryptCanvasToken,
  encryptCanvasToken,
  getCanvasOAuthClient,
} from "../_shared/canvas-server.ts";
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

type Action = "status" | "sync" | "disconnect";
interface ConnectionRow {
  id: string;
  user_id: string;
  canvas_base_url: string;
  canvas_user_name: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  status: "connected" | "needs_reauth" | "error";
  last_sync_status: "never" | "syncing" | "success" | "partial" | "error";
  last_sync_error: string | null;
  last_synced_at: string | null;
  sync_counts: Record<string, unknown> | null;
}
class NeedsReauthError extends Error {}
class CanvasApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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
    const userId = authData.user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const agreementGate = await checkCurrentFamilyBetaAgreement(
      userId,
      () =>
        admin
          .from("family_beta_agreement_acceptances")
          .select("user_id, accepted_by, agreement_version, accepted_at")
          .eq("user_id", userId)
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

    let action: Action;
    try {
      action = (await req.json()).action ?? "status";
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (!["status", "sync", "disconnect"].includes(action)) {
      return json({ error: "Unsupported action" }, 400);
    }
    const { data: connection, error } = await admin.from("canvas_connections")
      .select("*").eq("user_id", userId).order("created_at", {
        ascending: false,
      })
      .limit(1).maybeSingle();
    if (error) {
      logPrivateFailure({
        errorClass: "canvas_connection_lookup_failed",
        status: 500,
        requestId,
      });
      return json({ error: "Couldn’t read Canvas status." }, 500);
    }
    const row = connection as ConnectionRow | null;
    if (action === "status") return json(publicStatus(row));
    if (action === "disconnect") {
      return disconnect(admin, row, userId, json, requestId);
    }
    if (!row) {
      return json({
        error: "Connect Canvas before syncing.",
        code: "not_connected",
      }, 409);
    }

    const previousSync = row.last_synced_at
      ? Date.parse(row.last_synced_at)
      : Number.NaN;
    if (
      (row.last_sync_status === "success" ||
        row.last_sync_status === "partial") &&
      Number.isFinite(previousSync) && Date.now() - previousSync < 2 * 60 * 1000
    ) {
      return json({
        ok: true,
        partial: row.last_sync_status === "partial",
        lastSyncedAt: row.last_synced_at,
        counts: row.sync_counts ?? {},
        cached: true,
      });
    }
    const syncing = await admin.from("canvas_connections").update({
      last_sync_status: "syncing",
      last_sync_error: null,
    }).eq("id", row.id);
    if (syncing.error) {
      logPrivateFailure({
        errorClass: "canvas_sync_state_write_failed",
        status: 500,
        requestId,
      });
      return json({ error: "Canvas could not be synced right now." }, 500);
    }

    try {
      const accessToken = await currentAccessToken(admin, row);
      const result = await importCanvas(admin, row, accessToken);
      const syncedAt = new Date().toISOString();
      const completed = await admin.from("canvas_connections").update({
        status: "connected",
        last_sync_status: result.partial ? "partial" : "success",
        last_sync_error: result.partial
          ? "Some Canvas coursework could not be refreshed."
          : null,
        last_synced_at: syncedAt,
        sync_counts: result.counts,
      }).eq("id", row.id);
      if (completed.error) {
        throw new Error("Canvas sync completion could not be saved");
      }
      return json({
        ok: true,
        partial: result.partial,
        lastSyncedAt: syncedAt,
        counts: result.counts,
      });
    } catch (caught) {
      const needsReauth = caught instanceof NeedsReauthError ||
        (caught instanceof CanvasApiError && caught.status === 401);
      const message = needsReauth
        ? "Canvas authorization expired. Reconnect Canvas."
        : "Canvas could not be synced right now.";
      if (!needsReauth) {
        logPrivateFailure({
          errorClass: "canvas_sync_failed",
          status: 502,
          requestId,
        });
      }
      await admin.from("canvas_connections").update({
        status: needsReauth ? "needs_reauth" : "error",
        last_sync_status: "error",
        last_sync_error: message,
      }).eq("id", row.id);
      return json({
        error: message,
        code: needsReauth ? "needs_reauth" : "sync_failed",
      }, needsReauth ? 401 : 502);
    }
  })
);

type JsonResponder = (body: unknown, status?: number) => Response;

async function disconnect(
  admin: SupabaseClient,
  row: ConnectionRow | null,
  userId: string,
  json: JsonResponder,
  requestId: string,
) {
  if (!row) return json({ ok: true, connected: false });
  try {
    const token = await decryptCanvasToken(row.access_token_ciphertext);
    await fetch(new URL("/login/oauth2/token", row.canvas_base_url), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Local encrypted credential removal must still complete.
  }
  const archivedAt = new Date().toISOString();
  const prefix = `${new URL(row.canvas_base_url).hostname.toLowerCase()}:%`;
  const results = await Promise.all([
    admin.from("assignments").update({ source_archived_at: archivedAt })
      .eq("user_id", userId).eq("source", "canvas").like("external_id", prefix),
    admin.from("exams").update({ source_archived_at: archivedAt })
      .eq("user_id", userId).eq("source", "canvas").like("external_id", prefix),
  ]);
  if (results.some((item) => item.error)) {
    logPrivateFailure({
      errorClass: "canvas_coursework_archive_failed",
      status: 500,
      requestId,
    });
    return json({ error: "Couldn’t safely archive Canvas coursework." }, 500);
  }
  const { error } = await admin.from("canvas_connections").delete()
    .eq("id", row.id).eq("user_id", userId);
  if (error) {
    logPrivateFailure({
      errorClass: "canvas_disconnect_failed",
      status: 500,
      requestId,
    });
    return json({ error: "Couldn’t disconnect Canvas." }, 500);
  }
  return json({ ok: true, connected: false });
}

function publicStatus(row: ConnectionRow | null) {
  if (!row) return { connected: false, status: "disconnected" };
  return {
    connected: row.status !== "needs_reauth",
    status: row.status,
    canvasBaseUrl: row.canvas_base_url,
    canvasUserName: row.canvas_user_name,
    lastSyncStatus: row.last_sync_status,
    lastSyncError: row.last_sync_error,
    lastSyncedAt: row.last_synced_at,
    counts: row.sync_counts ?? {},
  };
}

async function currentAccessToken(
  admin: SupabaseClient,
  row: ConnectionRow,
): Promise<string> {
  const expiresSoon = row.token_expires_at
    ? Date.parse(row.token_expires_at) <= Date.now() + 2 * 60 * 1000
    : false;
  if (!expiresSoon) return decryptCanvasToken(row.access_token_ciphertext);
  if (!row.refresh_token_ciphertext) throw new NeedsReauthError();
  const oauth = getCanvasOAuthClient(row.canvas_base_url);
  if (!oauth) throw new NeedsReauthError();
  const response = await fetch(new URL("/login/oauth2/token", oauth.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: canvasCallbackUrl(),
      refresh_token: await decryptCanvasToken(row.refresh_token_ciphertext),
    }),
  });
  if (!response.ok) throw new NeedsReauthError();
  const token = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!token.access_token) throw new NeedsReauthError();
  const { error } = await admin.from("canvas_connections").update({
    access_token_ciphertext: await encryptCanvasToken(token.access_token),
    refresh_token_ciphertext: token.refresh_token
      ? await encryptCanvasToken(token.refresh_token)
      : row.refresh_token_ciphertext,
    token_expires_at: typeof token.expires_in === "number"
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
    status: "connected",
  }).eq("id", row.id);
  if (error) throw new Error("Canvas authorization refresh could not be saved");
  return token.access_token;
}

async function importCanvas(
  admin: SupabaseClient,
  connection: ConnectionRow,
  accessToken: string,
) {
  const courses = await canvasFetchAll<CanvasCourse>(
    connection.canvas_base_url,
    accessToken,
    "/api/v1/courses?enrollment_state=active&state[]=available&include[]=term&include[]=syllabus_body&include[]=teachers&per_page=100",
    5,
  );
  const eligible = courses.filter((course) =>
    course.id != null && course.name?.trim()
  );
  const selected = eligible.slice(0, 50);
  let partial = eligible.length > selected.length;
  const activeAssignments = new Set<string>();
  const activeExams = new Set<string>();
  let assignmentCount = 0;
  let examCount = 0;

  for (const course of selected) {
    const externalId = canvasExternalId(connection.canvas_base_url, course.id);
    const clientClassId = canvasClassId(
      connection.user_id,
      connection.canvas_base_url,
      course.id,
    );
    const teacher = course.teachers?.[0]?.display_name ||
      course.teachers?.[0]?.name || null;
    const { data: classRow, error: classError } = await admin.from("classes")
      .upsert({
        user_id: connection.user_id,
        client_class_id: clientClassId,
        name: course.name?.trim() || course.course_code || "Canvas class",
        professor: teacher,
        color: "bg-primary",
        meta: {
          canvas: {
            baseUrl: connection.canvas_base_url,
            courseId: String(course.id),
            courseCode: course.course_code ?? null,
            term: course.term ?? null,
            syllabusText: htmlToPlainText(course.syllabus_body, 20000),
          },
        },
        source: "canvas",
        external_id: externalId,
        source_url: course.html_url ||
          `${connection.canvas_base_url}/courses/${course.id}`,
        source_updated_at: course.updated_at ?? null,
        source_archived_at: null,
      }, { onConflict: "user_id,source,external_id" })
      .select("id,client_class_id").single();
    if (classError || !classRow) throw new Error("Canvas class import failed");
    const { error: enrollmentError } = await admin.from("enrollments").upsert({
      user_id: connection.user_id,
      class_id: classRow.id,
      role: "student",
    }, { onConflict: "user_id,class_id" });
    if (enrollmentError) throw new Error("Canvas enrollment import failed");

    let assignments: CanvasAssignment[];
    try {
      assignments = await canvasFetchAll<CanvasAssignment>(
        connection.canvas_base_url,
        accessToken,
        `/api/v1/courses/${
          encodeURIComponent(String(course.id))
        }/assignments?include[]=submission&order_by=due_at&per_page=100`,
        10,
      );
    } catch (error) {
      if (error instanceof CanvasApiError && error.status === 401) throw error;
      partial = true;
      continue;
    }
    if (assignments.length > 500) partial = true;
    for (const assignment of assignments.slice(0, 500)) {
      if (assignment.id == null) continue;
      const mapped = mapCanvasAssignment(
        assignment,
        connection.canvas_base_url,
      );
      const common = {
        user_id: connection.user_id,
        class_id: classRow.id,
        client_class_id: classRow.client_class_id || clientClassId,
        title: mapped.title,
        notes: mapped.notes,
        source: "canvas",
        external_id: mapped.externalId,
        source_url: mapped.sourceUrl,
        source_updated_at: mapped.sourceUpdatedAt,
        source_due_at: mapped.sourceDueAt,
        source_archived_at: null,
        meta: mapped.meta,
      };
      if (mapped.kind === "exam") {
        activeExams.add(mapped.externalId);
        examCount += 1;
        const { error } = await admin.from("exams").upsert({
          ...common,
          exam_date: mapped.dueDate,
        }, { onConflict: "user_id,source,external_id" });
        if (error) throw new Error("Canvas test import failed");
      } else {
        activeAssignments.add(mapped.externalId);
        assignmentCount += 1;
        const { error } = await admin.from("assignments").upsert({
          ...common,
          due_date: mapped.dueDate,
          status: mapped.status,
          priority: "medium",
        }, { onConflict: "user_id,source,external_id" });
        if (error) throw new Error("Canvas assignment import failed");
      }
    }
  }
  if (!partial) {
    await archiveMissing(admin, "assignments", connection, activeAssignments);
    await archiveMissing(admin, "exams", connection, activeExams);
  }
  return {
    partial,
    counts: {
      courses: selected.length,
      assignments: assignmentCount,
      exams: examCount,
    },
  };
}

async function archiveMissing(
  admin: SupabaseClient,
  table: "assignments" | "exams",
  connection: ConnectionRow,
  active: Set<string>,
) {
  const prefix = `${
    new URL(connection.canvas_base_url).hostname.toLowerCase()
  }:`;
  const { data, error } = await admin.from(table).select(
    "id,external_id,source_archived_at",
  )
    .eq("user_id", connection.user_id).eq("source", "canvas");
  if (error) throw new Error("Canvas archive lookup failed");
  const archivedAt = new Date().toISOString();
  for (const item of data ?? []) {
    if (
      typeof item.external_id === "string" &&
      item.external_id.startsWith(prefix) &&
      !active.has(item.external_id) && !item.source_archived_at
    ) {
      const result = await admin.from(table).update({
        source_archived_at: archivedAt,
      })
        .eq("id", item.id).eq("user_id", connection.user_id);
      if (result.error) throw new Error("Canvas archive failed");
    }
  }
}

async function canvasFetchAll<T>(
  baseUrl: string,
  token: string,
  path: string,
  maxPages: number,
): Promise<T[]> {
  const origin = new URL(baseUrl).origin;
  let next: URL | null = new URL(path, baseUrl);
  const rows: T[] = [];
  let page = 0;
  while (next && page < maxPages) {
    if (next.origin !== origin) {
      throw new CanvasApiError(502, "Unsafe Canvas pagination");
    }
    const response = await fetch(next, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json+canvas-string-ids",
      },
    });
    if (!response.ok) {
      throw new CanvasApiError(
        response.status,
        `Canvas returned ${response.status}`,
      );
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new CanvasApiError(502, "Unexpected Canvas response");
    }
    rows.push(...data as T[]);
    page += 1;
    next = nextLink(response.headers.get("Link"), origin);
  }
  if (next) {
    throw new CanvasApiError(502, "Canvas result exceeded safe page limit");
  }
  return rows;
}

function nextLink(header: string | null, origin: string): URL | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match?.[2] !== "next") continue;
    const url = new URL(match[1]);
    return url.origin === origin ? url : null;
  }
  return null;
}

function canvasClassId(
  userId: string,
  baseUrl: string,
  courseId: string | number,
) {
  const host = new URL(baseUrl).hostname.toLowerCase().replace(
    /[^a-z0-9]+/g,
    "-",
  ).slice(0, 24);
  return `canvas-${userId.slice(0, 8)}-${host}-${
    String(courseId).replace(/[^a-z0-9_-]/gi, "")
  }`;
}
