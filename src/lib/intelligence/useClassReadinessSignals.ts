/**
 * useClassReadinessSignals — loads the evidence behind one class's
 * readiness for the signed-in student (concepts, mastery, captures) and
 * runs the pure `explainReadiness` explainer.
 *
 * Real mode only. Nothing here writes; artifacts are never read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { explainReadiness, type ReadinessExplanation } from "./readinessExplanation";

interface Options {
  daysToExam?: number | null;
  overdueAssignments?: number;
}

export function useClassReadinessSignals(clientClassId: string, options: Options = {}) {
  const { user, mode } = useAuth();
  const userId = user?.id;
  const realMode = mode === "real";
  const [raw, setRaw] = useState({ conceptCount: 0, strengths: [] as number[], attempts: 0, captureCount: 0 });
  const [loading, setLoading] = useState(realMode);
  const [error, setError] = useState(false);
  const version = useRef(0);

  const load = useCallback(async () => {
    const request = ++version.current;
    if (!realMode || !userId || !clientClassId) {
      setRaw({ conceptCount: 0, strengths: [], attempts: 0, captureCount: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [concepts, mastery, captures] = await Promise.all([
        supabase
          .from("concepts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("client_class_id", clientClassId),
        supabase
          .from("user_concept_mastery")
          .select("strength, attempts, concepts!inner(client_class_id)")
          .eq("user_id", userId)
          .eq("concepts.client_class_id", clientClassId),
        supabase
          .from("captures")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("client_class_id", clientClassId),
      ]);
      if (request !== version.current) return;
      if (concepts.error || mastery.error || captures.error) throw concepts.error || mastery.error || captures.error;
      const rows = (mastery.data ?? []) as { strength: number | null; attempts: number | null }[];
      setRaw({
        conceptCount: concepts.count ?? 0,
        captureCount: captures.count ?? 0,
        strengths: rows.map((r) => Number(r.strength) || 0),
        attempts: rows.reduce((sum, r) => sum + (r.attempts ?? 0), 0),
      });
    } catch (e) {
      if (request !== version.current) return;
      console.warn("[readiness] signals load failed", e);
      setError(true);
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [clientClassId, realMode, userId]);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("coach:refresh", handler);
    window.addEventListener("capture:committed", handler);
    window.addEventListener("concepts:extracted", handler);
    return () => {
      version.current += 1;
      window.removeEventListener("coach:refresh", handler);
      window.removeEventListener("capture:committed", handler);
      window.removeEventListener("concepts:extracted", handler);
    };
  }, [load]);

  const explanation: ReadinessExplanation = explainReadiness({
    ...raw,
    daysToExam: options.daysToExam ?? null,
    overdueAssignments: options.overdueAssignments ?? 0,
  });

  return { explanation, signals: raw, loading, error, reload: load };
}
