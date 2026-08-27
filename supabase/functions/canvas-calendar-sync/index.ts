import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";
import {
  parseCanvasCalendar,
  validateCanvasFeedUrl,
} from "../_shared/canvas-calendar.ts";
import {
  decryptCanvasToken,
  encryptCanvasToken,
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

type Action = "status" | "connect" | "sync" | "disconnect";
type Admin = SupabaseClient;
interface Connection {
  id: string;
  user_id: string;
  feed_url_ciphertext: string;
  canvas_base_url: string;
  status: "connected" | "error";
  last_sync_status: "never" | "syncing" | "success" | "partial" | "error";
  last_sync_error: string | null;
  last_synced_at: string | null;
  sync_counts: Record<string, number> | null;
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
        errorClass: "canvas_calendar_environment_missing",
        status: 503,
        requestId,
      });
      return json({ error: "School connection is unavailable." }, 503);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await userClient.auth.getUser();
    if (!data.user) return json({ error: "Authentication required" }, 401);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const agreementGate = await checkCurrentFamilyBetaAgreement(
      data.user.id,
      () =>
        admin
          .from("family_beta_agreement_acceptances")
          .select("user_id, accepted_by, agreement_version, accepted_at")
          .eq("user_id", data.user.id)
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
    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (
      !parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)
    ) {
      return json({ error: "Invalid request" }, 400);
    }
    const body = parsedBody as { action?: Action; feedUrl?: string };
    const action = body.action ?? "status";
    if (!["status", "connect", "sync", "disconnect"].includes(action)) {
      return json({ error: "Unsupported action" }, 400);
    }
    const row = await findConnection(admin, data.user.id);
    if (action === "status") return json(publicStatus(row));
    if (action === "disconnect") {
      if (row) {
        try {
          await archiveCalendarItems(admin, data.user.id, row.canvas_base_url);
        } catch {
          logPrivateFailure({
            errorClass: "canvas_calendar_archive_failed",
            status: 500,
            requestId,
          });
          return json({ error: "Couldn’t disconnect the calendar." }, 500);
        }
        const result = await admin.from("canvas_calendar_connections").delete()
          .eq("id", row.id).eq("user_id", data.user.id);
        if (result.error) {
          logPrivateFailure({
            errorClass: "canvas_calendar_disconnect_failed",
            status: 500,
            requestId,
          });
          return json({ error: "Couldn’t disconnect the calendar." }, 500);
        }
      }
      return json({ ok: true, connected: false });
    }
    let connection = row;
    if (action === "connect") {
      let feed: URL;
      try {
        feed = validateCanvasFeedUrl(body.feedUrl ?? "");
      } catch (error) {
        return json({
          error: error instanceof Error ? error.message : "Invalid link",
        }, 400);
      }
      const saved = await admin.from("canvas_calendar_connections").upsert({
        user_id: data.user.id,
        feed_url_ciphertext: await encryptCanvasToken(feed.toString()),
        canvas_base_url: feed.origin,
        status: "connected",
        last_sync_error: null,
      }, { onConflict: "user_id" }).select("*").single();
      if (saved.error || !saved.data) {
        logPrivateFailure({
          errorClass: "canvas_calendar_connection_write_failed",
          status: 500,
          requestId,
        });
        return json(
          { error: "The Canvas calendar link could not be saved." },
          500,
        );
      }
      connection = saved.data as Connection;
    }
    if (!connection) {
      return json({ error: "Connect your Canvas calendar first." }, 409);
    }
    const syncing = await admin.from("canvas_calendar_connections").update({
      last_sync_status: "syncing",
      last_sync_error: null,
    }).eq("id", connection.id);
    if (syncing.error) {
      logPrivateFailure({
        errorClass: "canvas_calendar_sync_state_write_failed",
        status: 500,
        requestId,
      });
      return json({ error: "Canvas calendar could not be refreshed." }, 500);
    }
    try {
      const result = await importCalendar(admin, connection);
      const lastSyncedAt = new Date().toISOString();
      const completed = await admin.from("canvas_calendar_connections").update({
        status: "connected",
        last_sync_status: result.partial ? "partial" : "success",
        last_sync_error: result.partial
          ? "Some calendar items need a syllabus or Canvas connection."
          : null,
        last_synced_at: lastSyncedAt,
        sync_counts: result.counts,
      }).eq("id", connection.id);
      if (completed.error) {
        throw new Error("Canvas calendar sync completion could not be saved");
      }
      return json({ ok: true, connected: true, lastSyncedAt, ...result });
    } catch {
      logPrivateFailure({
        errorClass: "canvas_calendar_sync_failed",
        status: 502,
        requestId,
      });
      await admin.from("canvas_calendar_connections").update({
        status: "error",
        last_sync_status: "error",
        last_sync_error:
          "Canvas calendar could not be refreshed. Copy a new link from Canvas.",
      }).eq("id", connection.id);
      return json({
        error:
          "Canvas calendar could not be refreshed. Copy a new link from Canvas.",
      }, 502);
    }
  })
);

async function findConnection(admin: Admin, userId: string) {
  const result = await admin.from("canvas_calendar_connections").select("*")
    .eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("Calendar status lookup failed");
  return result.data as Connection | null;
}
function publicStatus(row: Connection | null) {
  if (!row) return { connected: false, status: "disconnected" };
  return {
    connected: true,
    status: row.status,
    method: "calendar",
    canvasBaseUrl: row.canvas_base_url,
    lastSyncStatus: row.last_sync_status,
    lastSyncError: row.last_sync_error,
    lastSyncedAt: row.last_synced_at,
    counts: row.sync_counts ?? {},
  };
}
async function importCalendar(admin: Admin, connection: Connection) {
  const feedUrl = validateCanvasFeedUrl(
    await decryptCanvasToken(connection.feed_url_ciphertext),
  );
  const response = await fetch(feedUrl, {
    redirect: "error",
    headers: { Accept: "text/calendar" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Calendar returned ${response.status}`);
  const length = Number(response.headers.get("content-length") || "0");
  if (length > 5_000_000) throw new Error("Calendar is too large");
  const text = await response.text();
  if (text.length > 5_000_000 || !text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Invalid calendar");
  }
  const items = parseCanvasCalendar(text);
  const activeAssignments = new Set<string>();
  const activeExams = new Set<string>();
  const classIds = new Map<string, { id: string; client: string }>();
  for (const item of items) {
    let target = classIds.get(item.courseId);
    if (!target) {
      // Use the same course identity as full OAuth so upgrading the connection
      // enriches the existing class instead of creating a duplicate.
      const externalId = canvasResourceId(
        connection.canvas_base_url,
        item.courseId,
      );
      const client = canvasClassId(
        connection.user_id,
        connection.canvas_base_url,
        item.courseId,
      );
      const result = await admin.from("classes").upsert({
        user_id: connection.user_id,
        client_class_id: client,
        name: item.courseName,
        color: "bg-primary",
        meta: { canvasCalendar: { courseId: item.courseId } },
        source: "canvas",
        external_id: externalId,
        source_url: item.sourceUrl,
        source_archived_at: null,
      }, { onConflict: "user_id,source,external_id" }).select("id").single();
      if (result.error || !result.data) throw new Error("Class import failed");
      target = { id: result.data.id, client };
      classIds.set(item.courseId, target);
      await admin.from("enrollments").upsert({
        user_id: connection.user_id,
        class_id: target.id,
        role: "student",
      }, { onConflict: "user_id,class_id" });
    }
    const externalId = calendarId(
      connection.canvas_base_url,
      `event:${item.uid}`,
    );
    const common = {
      user_id: connection.user_id,
      class_id: target.id,
      client_class_id: target.client,
      title: item.title,
      notes: item.description || null,
      source: "canvas",
      external_id: externalId,
      source_url: item.sourceUrl,
      source_due_at: item.dueAt,
      source_archived_at: null,
      meta: { canvasCalendar: true },
    };
    if (item.kind === "exam") {
      activeExams.add(externalId);
      const result = await admin.from("exams").upsert({
        ...common,
        exam_date: item.dueAt.slice(0, 10),
      }, { onConflict: "user_id,source,external_id" });
      if (result.error) throw new Error("Exam import failed");
    } else {
      activeAssignments.add(externalId);
      const result = await admin.from("assignments").upsert({
        ...common,
        due_date: item.dueAt.slice(0, 10),
        status: "not_started",
        priority: "medium",
      }, { onConflict: "user_id,source,external_id" });
      if (result.error) throw new Error("Assignment import failed");
    }
  }
  await Promise.all([
    archiveMissingCalendarItems(
      admin,
      "assignments",
      connection,
      activeAssignments,
    ),
    archiveMissingCalendarItems(admin, "exams", connection, activeExams),
  ]);
  return {
    partial: items.some((item) => item.courseName === "Canvas"),
    counts: {
      courses: classIds.size,
      assignments: activeAssignments.size,
      exams: activeExams.size,
    },
  };
}
async function archiveMissingCalendarItems(
  admin: Admin,
  table: "assignments" | "exams",
  connection: Connection,
  active: Set<string>,
) {
  const prefix = `${
    new URL(connection.canvas_base_url).hostname.toLowerCase()
  }:calendar:%`;
  const result = await admin.from(table).select(
    "id,external_id,source_archived_at",
  )
    .eq("user_id", connection.user_id).eq("source", "canvas")
    .like("external_id", prefix);
  if (result.error) throw new Error("Calendar archive lookup failed");
  const archivedAt = new Date().toISOString();
  for (const row of result.data ?? []) {
    if (
      typeof row.external_id === "string" &&
      !active.has(row.external_id) &&
      !row.source_archived_at
    ) {
      const update = await admin.from(table).update({
        source_archived_at: archivedAt,
      }).eq("id", row.id).eq("user_id", connection.user_id);
      if (update.error) throw new Error("Calendar archive failed");
    }
  }
}
async function archiveCalendarItems(
  admin: Admin,
  userId: string,
  baseUrl: string,
) {
  const prefix = `${new URL(baseUrl).hostname.toLowerCase()}:calendar:%`;
  const at = new Date().toISOString();
  const results = await Promise.all([
    admin.from("assignments").update({ source_archived_at: at })
      .eq("user_id", userId).eq("source", "canvas").like("external_id", prefix),
    admin.from("exams").update({ source_archived_at: at })
      .eq("user_id", userId).eq("source", "canvas").like("external_id", prefix),
  ]);
  if (results.some((result) => result.error)) {
    throw new Error("Canvas calendar coursework archive failed");
  }
}
function calendarId(baseUrl: string, value: string) {
  return `${new URL(baseUrl).hostname.toLowerCase()}:calendar:${value}`;
}
function canvasResourceId(baseUrl: string, value: string) {
  return `${new URL(baseUrl).hostname.toLowerCase()}:${value}`;
}
function canvasClassId(userId: string, baseUrl: string, courseId: string) {
  const host = new URL(baseUrl).hostname.toLowerCase().replace(
    /[^a-z0-9]+/g,
    "-",
  ).slice(0, 24);
  return `canvas-${userId.slice(0, 8)}-${host}-${
    courseId.replace(/[^a-z0-9_-]/gi, "")
  }`;
}
