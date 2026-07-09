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
  created_at: string;
  updated_at: string;
}

export interface NewAssignmentInput {
  title: string;
  clientClassId: string;
  classUuid?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number;
  priority?: AssignmentPriority;
  status?: AssignmentStatus;
  notes?: string | null;
}

export async function listAssignments(userId: string, clientClassId?: string): Promise<RealAssignment[]> {
  let q = supabase.from("assignments").select("*").eq("user_id", userId);
  if (clientClassId) q = q.eq("client_class_id", clientClassId);
  const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.warn("[assignments:list]", error);
    return [];
  }
  return (data ?? []) as RealAssignment[];
}

export async function createAssignment(userId: string, input: NewAssignmentInput): Promise<RealAssignment | null> {
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      user_id: userId,
      client_class_id: input.clientClassId,
      class_id: input.classUuid ?? null,
      title: input.title,
      due_date: input.dueDate ?? null,
      estimated_minutes: input.estimatedMinutes ?? 30,
      priority: input.priority ?? "medium",
      status: input.status ?? "not_started",
      notes: input.notes ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[assignments:create]", error);
    return null;
  }
  return data as RealAssignment;
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
  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) {
    console.warn("[assignments:delete]", error);
    return false;
  }
  return true;
}
