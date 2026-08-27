/**
 * useCoachRecommendations — loads permanent memory (mastery, exams,
 * assignments, classes) for the signed-in student and runs the pure
 * `recommend()` ranker.
 *
 * Real users only. The faithful demo dashboard uses a hook-free sample adapter
 * rather than loading authenticated recommendation data.
 *
 * Refreshes when the classes list changes, when assignments/exams
 * change (via existing `real-*:changed` window events), and whenever
 * `record-study-result` fires (mastery changed → rankings change).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const userId = user?.id;
  const realMode = mode === "real";
  const { classes, loading: classesLoading, error: classesError, reload: reloadClasses } = useMyClasses();
  const { items: assignments, loading: assignmentsLoading, error: assignmentsError, reload: reloadAssignments } = useRealAssignments();
  const { items: exams, loading: examsLoading, error: examsError, reload: reloadExams } = useRealExams();
  const [mastery, setMastery] = useState<CoachInputMastery[]>([]);
  const [masteryLoading, setMasteryLoading] = useState(realMode);
  const [masteryError, setMasteryError] = useState<string | null>(null);
  const masteryRequestVersion = useRef(0);

  const loadMastery = useCallback(async () => {
    const request = ++masteryRequestVersion.current;
    if (!userId || !realMode) { setMastery([]); setMasteryLoading(false); setMasteryError(null); return; }
    setMasteryLoading(true);
    setMasteryError(null);
    try {
      // Mastery rows carry class_id as uuid. Concepts also carry
      // client_class_id (the id the rest of the app uses). Join through
      // concepts so we get a stable client-facing class id.
      const { data, error } = await supabase
        .from("user_concept_mastery")
        .select("concept_id, strength, next_review_at, attempts, concepts!inner(client_class_id)")
        .eq("user_id", userId)
        .is("concepts.retired_at", null);
      if (request !== masteryRequestVersion.current) return;
      if (error) throw error;
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
    } catch (error) {
      if (request !== masteryRequestVersion.current) return;
      console.warn("[coach] mastery load failed", error);
      setMastery([]);
      setMasteryError("We couldn’t load your study memory.");
    } finally {
      if (request === masteryRequestVersion.current) setMasteryLoading(false);
    }
  }, [userId, realMode]);

  useEffect(() => {
    void loadMastery();
    return () => { masteryRequestVersion.current += 1; };
  }, [loadMastery]);
  useEffect(() => {
    const handler = () => void loadMastery();
    window.addEventListener("coach:refresh", handler);
    return () => window.removeEventListener("coach:refresh", handler);
  }, [loadMastery]);

  const loading = realMode && (classesLoading || assignmentsLoading || examsLoading || masteryLoading);

  const recommendations = useMemo<CoachRecommendation[]>(() => {
    if (!realMode || loading || classes.length === 0 || classesError || assignmentsError || examsError || masteryError) return [];
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
        status: a.status,
      })).filter((a) => a.class_id),
    });
  }, [realMode, loading, classes, mastery, exams, assignments, classesError, assignmentsError, examsError, masteryError]);

  const error = classesError || assignmentsError || examsError || masteryError;
  const reload = useCallback(async () => {
    await Promise.all([reloadClasses(), reloadAssignments(), reloadExams(), loadMastery()]);
  }, [loadMastery, reloadAssignments, reloadClasses, reloadExams]);

  return { recommendations, loading, error, reload };
}
