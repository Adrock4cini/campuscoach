/**
 * Real (Supabase-backed) exams — CRUD scoped by auth.uid() via RLS.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RealExam {
  id: string;
  user_id: string;
  client_class_id: string | null;
  class_id: string | null;
  title: string;
  exam_date: string | null;
  topics: string[];
  readiness: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewExamInput {
  title: string;
  clientClassId: string;
  classUuid?: string | null;
  examDate?: string | null;
  topics?: string[];
  readiness?: number;
  notes?: string | null;
}

export async function listExams(userId: string, clientClassId?: string): Promise<RealExam[]> {
  let q = supabase.from("exams").select("*").eq("user_id", userId);
  if (clientClassId) q = q.eq("client_class_id", clientClassId);
  const { data, error } = await q.order("exam_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.warn("[exams:list]", error);
    return [];
  }
  return (data ?? []) as RealExam[];
}

export async function createExam(userId: string, input: NewExamInput): Promise<RealExam | null> {
  const { data, error } = await supabase
    .from("exams")
    .insert({
      user_id: userId,
      client_class_id: input.clientClassId,
      class_id: input.classUuid ?? null,
      title: input.title,
      exam_date: input.examDate ?? null,
      topics: input.topics ?? [],
      readiness: input.readiness ?? 0,
      notes: input.notes ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[exams:create]", error);
    return null;
  }
  return data as RealExam;
}

export async function updateExam(id: string, patch: Partial<RealExam>): Promise<RealExam | null> {
  const { data, error } = await supabase
    .from("exams")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[exams:update]", error);
    return null;
  }
  return data as RealExam;
}

export async function deleteExam(id: string): Promise<boolean> {
  const { error } = await supabase.from("exams").delete().eq("id", id);
  if (error) {
    console.warn("[exams:delete]", error);
    return false;
  }
  return true;
}
