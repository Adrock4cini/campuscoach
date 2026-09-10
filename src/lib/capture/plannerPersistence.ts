import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatedUserId } from "@/hooks/useClassIntelligence";
import { CAPTURE_PLANNER_VERSION, extractPlannerDates, plannerTitleKey, validPlannerDate, type PlannerDateProposal, type PlannerSource } from "./plannerDates";

export interface PendingPlannerDate extends PlannerDateProposal { plannerId: string }
type SavedRow = { id: string; client_class_id: string | null; title: string; due_date?: string | null; exam_date?: string | null; source_archived_at: string | null };

function assertOwner(ownerId: string) {
  if (!ownerId || getAuthenticatedUserId() !== ownerId) throw new Error("Your account changed. Reopen date review in the correct account.");
}

async function proposalId(ownerId: string, proposal: PlannerDateProposal): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([
    CAPTURE_PLANNER_VERSION, ownerId, proposal.classId, proposal.captureId, proposal.key,
  ])));
  const hex = Array.from(new Uint8Array(bytes)).map(n => n.toString(16).padStart(2, "0")).join("");
  // Stable, content-addressed UUID. Retrying never updates an existing item.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function sources(ownerId: string, classId: string, captureIds?: string[]): Promise<PlannerSource[]> {
  assertOwner(ownerId);
  if (captureIds && !captureIds.length) return [];
  let q = supabase.from("captures")
    .select("id, client_class_id, class_id, kind, topic, captured_on, processing_status, raw_text")
    .eq("user_id", ownerId).eq("client_class_id", classId).eq("processing_status", "ready");
  if (captureIds) q = q.in("id", captureIds);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  assertOwner(ownerId);
  if (error) throw new Error("Could not check saved material for dates. Please retry.");
  return (data ?? []) as PlannerSource[];
}

async function savedRows(ownerId: string, classId: string) {
  assertOwner(ownerId);
  // Include archived rows so reopening a source cannot resurrect removed work.
  const [assignments, exams] = await Promise.all([
    supabase.from("assignments").select("id, client_class_id, title, due_date, source_archived_at").eq("user_id", ownerId).eq("client_class_id", classId),
    supabase.from("exams").select("id, client_class_id, title, exam_date, source_archived_at").eq("user_id", ownerId).eq("client_class_id", classId),
  ]);
  assertOwner(ownerId);
  if (assignments.error || exams.error) throw new Error("Could not check your planner for duplicates. Nothing new was added.");
  return { assignment: assignments.data ?? [], exam: exams.data ?? [] };
}

function isExisting(proposal: PendingPlannerDate, rows: SavedRow[], title = proposal.title, date = proposal.date) {
  return rows.some(row => row.id === proposal.plannerId || (
    !row.source_archived_at && validPlannerDate(date)
    && (row.due_date ?? row.exam_date) === date
    && plannerTitleKey(row.title) === plannerTitleKey(title)
  ));
}

function notifyPlanner(kind: PlannerDateProposal["kind"]) {
  window.dispatchEvent(new CustomEvent(kind === "assignment" ? "real-assignments:changed" : "real-exams:changed"));
  window.dispatchEvent(new CustomEvent("capture-planner:changed"));
}

export async function loadPlannerDates(ownerId: string, classId: string, captureIds?: string[]): Promise<PendingPlannerDate[]> {
  const captures = await sources(ownerId, classId, captureIds);
  const proposals = await Promise.all(captures.flatMap(extractPlannerDates).map(async proposal => ({
    ...proposal, plannerId: await proposalId(ownerId, proposal),
  })));
  assertOwner(ownerId);
  if (!proposals.length) return [];
  const existing = await savedRows(ownerId, classId);
  return proposals.filter(proposal => !isExisting(proposal, existing[proposal.kind]));
}

export async function confirmPlannerDate(ownerId: string, proposal: PendingPlannerDate, edits: { title: string; date: string }): Promise<"added" | "existing"> {
  assertOwner(ownerId);
  const title = edits.title.trim();
  if (!title || title.length > 180 || !validPlannerDate(edits.date)) throw new Error("Check the title and choose a valid date before adding.");
  // Re-read the owner-scoped source before every insert. A stale dialog, failed
  // wrong-class capture, or another class's proposal is never enough authority.
  const [source] = await sources(ownerId, proposal.classId, [proposal.captureId]);
  const verified = source && extractPlannerDates(source).find(row => row.key === proposal.key && row.excerpt === proposal.excerpt && row.kind === proposal.kind);
  if (!verified || await proposalId(ownerId, verified) !== proposal.plannerId) throw new Error("The source changed or is no longer available. Recheck its dates before adding.");
  const existing = await savedRows(ownerId, proposal.classId);
  if (isExisting(proposal, existing[proposal.kind], title, edits.date)) {
    notifyPlanner(proposal.kind);
    return "existing";
  }
  const payload = {
    id: proposal.plannerId, user_id: ownerId, client_class_id: proposal.classId,
    class_id: source.class_id, title,
    notes: `Student-confirmed from ${verified.sourceLabel}\n${verified.excerpt}`,
    meta: { source: CAPTURE_PLANNER_VERSION, capture_id: source.id, proposal_key: verified.key, source_excerpt: verified.excerpt },
  };
  assertOwner(ownerId);
  const result = proposal.kind === "assignment"
    ? await supabase.from("assignments").insert({ ...payload, due_date: edits.date, status: "not_started", priority: "medium", estimated_minutes: 30 }).select("id").maybeSingle()
    : await supabase.from("exams").insert({ ...payload, exam_date: edits.date, topics: [], readiness: 0 }).select("id").maybeSingle();
  assertOwner(ownerId);
  if (result.error || !result.data) {
    // A dropped response may follow a successful commit. Resolve by stable id,
    // without overwriting completion, title edits, or archival on the server.
    const recovered = await savedRows(ownerId, proposal.classId);
    if (!recovered[proposal.kind].some(row => row.id === proposal.plannerId)) {
      throw new Error("Could not confirm this date was saved. Retry safely; already saved dates will not be duplicated.");
    }
  }
  notifyPlanner(proposal.kind);
  return "added";
}
