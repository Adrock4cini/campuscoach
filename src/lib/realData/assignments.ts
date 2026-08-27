/**
 * Real (Supabase-backed) assignments — CRUD scoped by auth.uid() via RLS.
 * The Data API client automatically attaches the current session, so we
 * only need to set user_id on insert.
 */
import { supabase } from "@/integrations/supabase/client";

export type AssignmentPriority = "low" | "medium" | "high";
export type AssignmentStatus = "not_started" | "in_progress" | "complete";

export interface RealAssignment {
  id: string;
  user_id: string;
  client_class_id: string | null;
  class_id: string | null;
  title: string;
  due_date: string | null;
  estimated_minutes: number;
  priority: AssignmentPriority;
  status: AssignmentStatus;
  notes: string | null;
  source?: "manual" | "canvas" | "syllabus";
  source_url?: string | null;
  source_archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAssignmentInput {
  /** Optional client-generated UUID used to reconcile ambiguous mobile retries. */
  id?: string;
  title: string;
  clientClassId: string;
  classUuid?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number;
  priority?: AssignmentPriority;
  status?: AssignmentStatus;
  notes?: string | null;
}

export interface CreateAssignmentAttempt {
  assignment: RealAssignment | null;
  created: boolean;
  conflict: boolean;
}

export async function listAssignments(userId: string, clientClassId?: string): Promise<RealAssignment[]> {
  let q = supabase.from("assignments").select("*").eq("user_id", userId)
    .is("source_archived_at", null);
  if (clientClassId) q = q.eq("client_class_id", clientClassId);
  const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.warn("[assignments:list]", error);
    throw error;
  }
  return (data ?? []) as RealAssignment[];
}

export async function createAssignmentAttempt(
  userId: string,
  input: NewAssignmentInput,
): Promise<CreateAssignmentAttempt> {
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    user_id: userId,
    client_class_id: input.clientClassId,
    class_id: input.classUuid ?? null,
    title: input.title,
    due_date: input.dueDate ?? null,
    estimated_minutes: input.estimatedMinutes ?? 30,
    priority: input.priority ?? "medium",
    status: input.status ?? "not_started",
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase.from("assignments").insert(payload)
    .select("*")
    .maybeSingle();
  if (!error && data) {
    return { assignment: data as RealAssignment, created: true, conflict: false };
  }

  // A client-generated id makes a dropped successful response recoverable,
  // but it must never become an UPDATE-style retry that rewrites a student's
  // already-saved assignment.
  if (input.id && error?.code === "23505") {
    const recovered = await supabase
      .from("assignments")
      .select("*")
      .eq("id", input.id)
      .eq("user_id", userId)
      .maybeSingle();
    const row = recovered.data as RealAssignment | null;
    if (!recovered.error && row) {
      const exact = row.client_class_id === payload.client_class_id
        && row.class_id === payload.class_id
        && row.title === payload.title
        && row.due_date === payload.due_date
        && row.estimated_minutes === payload.estimated_minutes
        && row.priority === payload.priority
        && row.status === payload.status
        && row.notes === payload.notes
        && (row.source ?? "manual") === "manual"
        && row.source_archived_at == null;
      return exact
        ? { assignment: row, created: false, conflict: false }
        : { assignment: null, created: false, conflict: true };
    }
  }
  if (error) {
    console.warn("[assignments:create]", error);
  }
  return { assignment: null, created: false, conflict: false };
}

export async function createAssignment(
  userId: string,
  input: NewAssignmentInput,
): Promise<RealAssignment | null> {
  return (await createAssignmentAttempt(userId, input)).assignment;
}

/** Single assignment for the real detail page. */
export async function getAssignment(id: string): Promise<RealAssignment | null> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[assignments:get]", error);
    throw error;
  }
  return (data as RealAssignment) ?? null;
}

export async function updateAssignment(id: string, patch: Partial<RealAssignment>): Promise<RealAssignment | null> {
  const { data, error } = await supabase
    .from("assignments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[assignments:update]", error);
    return null;
  }
  return data as RealAssignment;
}

export async function deleteAssignment(id: string): Promise<boolean> {
  // Student-facing deletion is archival. A hard delete would null the capture
  // link and destroy the boundary needed to audit confirmed assignment help.
  const { error } = await supabase
    .from("assignments")
    .update({ source_archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.warn("[assignments:delete]", error);
    return false;
  }
  return true;
}
