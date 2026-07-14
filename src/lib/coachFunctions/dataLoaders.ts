/**
 * Shared data loaders for coach functions.
 *
 * Every coach function reads from PERMANENT MEMORY first — Concepts
 * and user_concept_mastery — before touching artifacts. These
 * loaders keep that invariant obvious and reusable.
 */
import type { CoachFunctionContext } from "./types";

export interface LoadedClass {
  id: string; // client_class_id
  name: string;
  readiness: number | null;
}

export interface LoadedMastery {
  concept_id: string;
  class_id: string; // client_class_id
  concept_name: string;
  professor_emphasis: boolean;
  strength: number;
  streak: number;
  attempts: number;
  last_seen_at: string | null;
  next_review_at: string | null;
}

export interface LoadedExam {
  id: string;
  class_id: string; // client_class_id
  title: string;
  exam_date: string | null;
  weight: number;
}

export interface LoadedAssignment {
  id: string;
  class_id: string; // client_class_id
  title: string;
  due_date: string | null;
}

export async function loadClasses(ctx: CoachFunctionContext): Promise<LoadedClass[]> {
  const { data, error } = await ctx.supabase
    .from("classes")
    .select("client_class_id, name")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`classes: ${error.message}`);
  const rows = (data ?? []) as { client_class_id: string | null; name: string }[];
  const classes = rows
    .filter((r) => r.client_class_id)
    .map((r) => ({ id: r.client_class_id as string, name: r.name, readiness: null as number | null }));

  const { data: readiness } = await ctx.supabase
    .from("readiness_scores")
    .select("client_class_id, readiness, computed_at")
    .eq("user_id", ctx.userId)
    .order("computed_at", { ascending: true });
  const readinessMap = new Map<string, number>();
  for (const r of (readiness ?? []) as { client_class_id: string | null; readiness: number }[]) {
    if (r.client_class_id) readinessMap.set(r.client_class_id, Number(r.readiness));
  }
  return classes.map((c) => ({ ...c, readiness: readinessMap.get(c.id) ?? null }));
}

export async function loadMastery(ctx: CoachFunctionContext): Promise<LoadedMastery[]> {
  const { data, error } = await ctx.supabase
    .from("user_concept_mastery")
    .select(
      "concept_id, strength, streak, attempts, last_seen_at, next_review_at, concepts!inner(name, client_class_id, professor_emphasis)",
    )
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`mastery: ${error.message}`);
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as {
      concept_id: string;
      strength: number;
      streak: number;
      attempts: number;
      last_seen_at: string | null;
      next_review_at: string | null;
      concepts: { name: string; client_class_id: string | null; professor_emphasis: boolean } | null;
    };
    return {
      concept_id: row.concept_id,
      class_id: row.concepts?.client_class_id ?? "",
      concept_name: row.concepts?.name ?? "concept",
      professor_emphasis: !!row.concepts?.professor_emphasis,
      strength: Number(row.strength) || 0,
      streak: row.streak ?? 0,
      attempts: row.attempts ?? 0,
      last_seen_at: row.last_seen_at,
      next_review_at: row.next_review_at,
    };
  }).filter((r) => r.class_id);
}

export async function loadExams(ctx: CoachFunctionContext): Promise<LoadedExam[]> {
  const { data, error } = await ctx.supabase
    .from("exams")
    .select("id, client_class_id, title, exam_date, weight")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`exams: ${error.message}`);
  return ((data ?? []) as {
    id: string; client_class_id: string | null; title: string; exam_date: string | null; weight: number | null;
  }[])
    .filter((e) => e.client_class_id)
    .map((e) => ({
      id: e.id,
      class_id: e.client_class_id as string,
      title: e.title,
      exam_date: e.exam_date,
      weight: e.weight != null ? Number(e.weight) : 1,
    }));
}

export async function loadAssignments(ctx: CoachFunctionContext): Promise<LoadedAssignment[]> {
  const { data, error } = await ctx.supabase
    .from("assignments")
    .select("id, client_class_id, title, due_date")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`assignments: ${error.message}`);
  return ((data ?? []) as {
    id: string; client_class_id: string | null; title: string; due_date: string | null;
  }[])
    .filter((a) => a.client_class_id)
    .map((a) => ({
      id: a.id,
      class_id: a.client_class_id as string,
      title: a.title,
      due_date: a.due_date,
    }));
}

export function daysBetween(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - base.getTime()) / 86400000);
}
