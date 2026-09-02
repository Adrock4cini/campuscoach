import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { explainReadiness, fullScopeStrengths } from "./readinessExplanation";
import { deriveClassTruth, type ClassTruth } from "./classTruth";

interface ClassRef {
  id: string;
}

interface TruthState {
  byClassId: Record<string, ClassTruth>;
  loading: boolean;
  error: boolean;
}

const EMPTY: ClassTruth = {
  materialLabel: "Need material",
  preparednessLabel: "Not practiced",
  nextAction: "Add material",
};

export function useMyClassesTruth(classes: ClassRef[]): TruthState {
  const { user, mode } = useAuth();
  const userId = user?.id;
  const realMode = mode === "real";
  const idsKey = classes.map((c) => c.id).sort().join("|");
  const version = useRef(0);
  const [state, setState] = useState<TruthState>({ byClassId: {}, loading: realMode, error: false });

  const load = useCallback(async () => {
    const request = ++version.current;
    const classIds = idsKey ? idsKey.split("|") : [];
    if (!realMode || !userId || classIds.length === 0) {
      setState({ byClassId: {}, loading: false, error: false });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: false }));
    try {
      // Three page-level reads total, regardless of how many classes are on the page.
      const [concepts, mastery, captures] = await Promise.all([
        supabase
          .from("concepts")
          .select("id, client_class_id")
          .eq("user_id", userId)
          .in("client_class_id", classIds)
          .is("retired_at", null),
        supabase
          .from("user_concept_mastery")
          .select("strength, attempts, concepts!inner(client_class_id)")
          .eq("user_id", userId)
          .in("concepts.client_class_id", classIds)
          .is("concepts.retired_at", null),
        supabase
          .from("captures")
          .select("id, client_class_id")
          .eq("user_id", userId)
          .in("client_class_id", classIds),
      ]);
      if (request !== version.current) return;
      if (concepts.error || mastery.error || captures.error) throw concepts.error || mastery.error || captures.error;

      const conceptCounts = new Map<string, number>();
      for (const row of concepts.data ?? []) {
        if (!row.client_class_id) continue;
        conceptCounts.set(row.client_class_id, (conceptCounts.get(row.client_class_id) ?? 0) + 1);
      }

      const captureCounts = new Map<string, number>();
      for (const row of captures.data ?? []) {
        if (!row.client_class_id) continue;
        captureCounts.set(row.client_class_id, (captureCounts.get(row.client_class_id) ?? 0) + 1);
      }

      const masteryByClass = new Map<string, { strengths: number[]; attempts: number }>();
      for (const row of mastery.data ?? []) {
        const joined = row.concepts as unknown as { client_class_id?: string | null } | { client_class_id?: string | null }[] | null;
        const classId = Array.isArray(joined) ? joined[0]?.client_class_id : joined?.client_class_id;
        if (!classId) continue;
        const current = masteryByClass.get(classId) ?? { strengths: [], attempts: 0 };
        current.strengths.push(Number(row.strength) || 0);
        current.attempts += row.attempts ?? 0;
        masteryByClass.set(classId, current);
      }

      const byClassId: Record<string, ClassTruth> = {};
      for (const classId of classIds) {
        const conceptCount = conceptCounts.get(classId) ?? 0;
        const captureCount = captureCounts.get(classId) ?? 0;
        const masterySignals = masteryByClass.get(classId) ?? { strengths: [], attempts: 0 };
        const explanation = explainReadiness({
          conceptCount,
          captureCount,
          attempts: masterySignals.attempts,
          strengths: fullScopeStrengths(conceptCount, masterySignals.strengths),
        });
        byClassId[classId] = deriveClassTruth({
          captureCount,
          conceptCount,
          attempts: masterySignals.attempts,
          explanation,
        });
      }
      setState({ byClassId, loading: false, error: false });
    } catch (error) {
      if (request !== version.current) return;
      console.warn("[my-classes-truth] evidence load failed", error);
      setState({
        byClassId: Object.fromEntries(classIds.map((id) => [id, EMPTY])),
        loading: false,
        error: true,
      });
    }
  }, [idsKey, realMode, userId]);

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

  return state;
}
