/**
 * useCoachRecommendations — loads permanent memory (mastery, exams,
 * assignments, classes) for the signed-in student and runs the pure
 * `recommend()` ranker.
 *
 * Real users only. Anonymous/demo callers get an empty list — they
 * should keep using the demo `DoThisNowHero` path.
 *
 * Refreshes when the classes list changes, when assignments/exams
 * change (via existing `real-*:changed` window events), and whenever
 * `record-study-result` fires (mastery changed → rankings change).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import {
  recommend,
  type CoachInputMastery,
  type CoachRecommendation,
} from "./recommend";

export function useCoachRecommendations() {
  const { user, mode } = useAuth();
  const realMode = mode === "real";
  const { classes } = useMyClasses();
  const { items: assignments } = useRealAssignments();
  const { items: exams } = useRealExams();
  const [mastery, setMastery] = useState<CoachInputMastery[]>([]);
  const [loading, setLoading] = useState(realMode);

  const loadMastery = useCallback(async () => {
    if (!user || !realMode) { setMastery([]); setLoading(false); return; }
    // Mastery rows carry class_id as uuid. Concepts also carry
    // client_class_id (the id the rest of the app uses). Join through
    // concepts so we get a stable client-facing class id.
    const { data, error } = await supabase
      .from("user_concept_mastery")
      .select("concept_id, strength, next_review_at, attempts, concepts!inner(client_class_id)")
      .eq("user_id", user.id);
    if (error) {
      console.warn("[coach] mastery load failed", error);
      setMastery([]); setLoading(false); return;
    }
    const rows: CoachInputMastery[] = (data ?? []).map((r: unknown) => {
      const row = r as {
        concept_id: string;
        strength: number;
        next_review_at: string | null;
        attempts: number;
        concepts: { client_class_id: string | null } | null;
      };
      return {
        concept_id: row.concept_id,
        class_id: row.concepts?.client_class_id ?? "",
        strength: Number(row.strength) || 0,
        next_review_at: row.next_review_at,
        attempts: row.attempts ?? 0,
      };
    }).filter((r) => r.class_id);
    setMastery(rows);
    setLoading(false);
  }, [user, realMode]);

  useEffect(() => { void loadMastery(); }, [loadMastery]);
  useEffect(() => {
    const handler = () => void loadMastery();
    window.addEventListener("coach:refresh", handler);
    return () => window.removeEventListener("coach:refresh", handler);
  }, [loadMastery]);

  const recommendations = useMemo<CoachRecommendation[]>(() => {
    if (!realMode || classes.length === 0) return [];
    return recommend({
      classes: classes.map((c) => ({ id: c.id, name: c.name, currentReadiness: c.readiness })),
      mastery,
      exams: exams.map((e) => ({
        class_id: e.client_class_id ?? "",
        exam_date: e.exam_date,
        title: e.title,
      })).filter((e) => e.class_id),
      assignments: assignments.map((a) => ({
        class_id: a.client_class_id ?? "",
        due_date: a.due_date,
        title: a.title,
      })).filter((a) => a.class_id),
    });
  }, [realMode, classes, mastery, exams, assignments]);

  return { recommendations, loading, reload: loadMastery };
}
