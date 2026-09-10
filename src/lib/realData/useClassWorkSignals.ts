/**
 * useClassWorkSignals — per-item material and study evidence for one class.
 *
 * Only explicit linkage counts: a capture is "for this assignment/test" when
 * its assignment_id / exam_id points at that row. Captures that merely share
 * the class are reported separately as the weaker `classCaptureCount`.
 *
 * "Started studying" comes from real study_sessions rows scoped to the exam.
 * Nothing here writes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ClassWorkSignals {
  /** capture count keyed by assignment id */
  assignmentMaterials: Record<string, number>;
  /** capture count keyed by exam id */
  examMaterials: Record<string, number>;
  /** study session count keyed by exam id */
  examStudySessions: Record<string, number>;
  /** captures attached to the class but not to a specific item */
  classCaptureCount: number;
}

const EMPTY: ClassWorkSignals = {
  assignmentMaterials: {},
  examMaterials: {},
  examStudySessions: {},
  classCaptureCount: 0,
};

export function useClassWorkSignals(clientClassId: string | undefined) {
  const { user, mode } = useAuth();
  const userId = user?.id;
  const realMode = mode === "real";
  const [signals, setSignals] = useState<ClassWorkSignals>(EMPTY);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);

  const load = useCallback(async () => {
    const request = ++version.current;
    if (!realMode || !userId || !clientClassId) {
      setSignals(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [captures, sessions] = await Promise.all([
        supabase
          .from("captures")
          .select("id, assignment_id, exam_id")
          .eq("user_id", userId)
          .eq("client_class_id", clientClassId),
        supabase
          .from("study_sessions")
          .select("study_scope_id")
          .eq("user_id", userId)
          .eq("study_scope_type", "exam"),
      ]);
      if (request !== version.current) return;
      if (captures.error || sessions.error) throw captures.error || sessions.error;

      const next: ClassWorkSignals = {
        assignmentMaterials: {},
        examMaterials: {},
        examStudySessions: {},
        classCaptureCount: 0,
      };
      for (const row of (captures.data ?? []) as { assignment_id: string | null; exam_id: string | null }[]) {
        if (row.assignment_id) {
          next.assignmentMaterials[row.assignment_id] = (next.assignmentMaterials[row.assignment_id] ?? 0) + 1;
        } else if (row.exam_id) {
          next.examMaterials[row.exam_id] = (next.examMaterials[row.exam_id] ?? 0) + 1;
        } else {
          next.classCaptureCount += 1;
        }
      }
      for (const row of (sessions.data ?? []) as { study_scope_id: string | null }[]) {
        if (!row.study_scope_id) continue;
        next.examStudySessions[row.study_scope_id] = (next.examStudySessions[row.study_scope_id] ?? 0) + 1;
      }
      setSignals(next);
    } catch (error) {
      if (request !== version.current) return;
      console.warn("[class work] signals load failed", error);
      setSignals(EMPTY);
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [clientClassId, realMode, userId]);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("capture:committed", handler);
    window.addEventListener("coach:refresh", handler);
    return () => {
      version.current += 1;
      window.removeEventListener("capture:committed", handler);
      window.removeEventListener("coach:refresh", handler);
    };
  }, [load]);

  return { signals, loading, reload: load };
}
